import type {
  ApiErrorResponseDto,
  GlobalMillOrderDto,
  GlobalMillOrderUpdateRequestDto,
  GlobalMillOrderUpdateResponseDto,
  OpcStatusDto,
  QmosMillOrdersDto,
  QmosMillOrdersResponseDto,
  QmosStatusDto,
  TrackedBundleDto,
  TrackingCapabilitiesDto,
  TrackingCommandAcceptedDto,
  TrackingCorrectionRequestDto,
  TrackingEventsResponseDto,
  TrackingMapDto,
  TrackingStateDto,
  TrackingStatusDto,
} from "./types"
import {
  isGlobalMillOrderDto,
  isGlobalMillOrderUpdateRequestDto,
  isGlobalMillOrderUpdateResponseDto,
  isOpcStatusDto,
  isQmosMillOrdersResponseDto,
  isQmosStatusDto,
  isTrackedBundleDto,
  isTrackingCapabilitiesDto,
  isTrackingCommandAcceptedDto,
  isTrackingCorrectionRequestDto,
  isTrackingEventsResponseDto,
  isTrackingMapDto,
  isTrackingStateDto,
  isTrackingStatusDto,
} from "./validation"

export type ApiErrorKind = "http" | "timeout" | "aborted" | "network" | "invalid-json" | "invalid-payload"

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly statusText: string | null
  readonly url: string
  readonly body: ApiErrorResponseDto | string | unknown | null

  constructor(options: {
    message: string
    kind: ApiErrorKind
    url: string
    status?: number | null
    statusText?: string | null
    body?: ApiErrorResponseDto | string | unknown | null
    cause?: unknown
  }) {
    super(options.message, { cause: options.cause })
    this.name = "ApiError"
    this.kind = options.kind
    this.url = options.url
    this.status = options.status ?? null
    this.statusText = options.statusText ?? null
    this.body = options.body ?? null
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export interface TrackingApiClientOptions {
  baseUrl: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  headers?: HeadersInit
}

export const DEFAULT_TRACKING_API_TIMEOUT_MS = 10_000
export const MAX_QMOS_MILL_ORDERS = 100

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  if (!normalized) throw new Error("Tracking API baseUrl is required")

  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    if (normalized.includes("?") || normalized.includes("#")) {
      throw new Error("A relative Tracking API baseUrl cannot include a query or fragment")
    }
    return normalized
  }

  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error("Tracking API baseUrl must be an HTTP(S) URL or a root-relative path")
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Tracking API baseUrl must use HTTP or HTTPS")
  }

  return url.toString().replace(/\/$/, "")
}

async function readResponseBody(response: Response): Promise<unknown | null> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export class TrackingApiClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly headers: HeadersInit

  constructor(options: TrackingApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TRACKING_API_TIMEOUT_MS
    // Some browsers require the native fetch function to keep its global
    // receiver. Calling an unbound fetch as an instance property can fail
    // before a request is sent (for example with "Illegal invocation").
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.headers = options.headers ?? {}

    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("Tracking API timeoutMs must be greater than zero")
    }
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    validate: (value: unknown) => value is T,
    externalSignal?: AbortSignal,
    requestBody?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    let timedOut = false
    let abortedByCaller = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const abortFromCaller = () => {
      abortedByCaller = true
      if (timeout !== null) clearTimeout(timeout)
      controller.abort(externalSignal?.reason)
    }

    if (externalSignal?.aborted) abortFromCaller()
    else externalSignal?.addEventListener("abort", abortFromCaller, { once: true })

    if (!controller.signal.aborted) {
      timeout = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, this.timeoutMs)
    }
    const requestHeaders = new Headers(this.headers)
    if (!requestHeaders.has("Accept")) requestHeaders.set("Accept", "application/json")
    if (method === "POST" || method === "PUT") {
      requestHeaders.set("Content-Type", "application/json")
    }

    try {
      const response = await this.fetchImpl(url, {
        method,
        body: method === "POST" || method === "PUT" ? JSON.stringify(requestBody) : undefined,
        cache: "no-store",
        credentials: "omit",
        headers: requestHeaders,
        signal: controller.signal,
      })
      const body = await readResponseBody(response)

      if (!response.ok) {
        throw new ApiError({
          message: `Tracking API request failed with HTTP ${response.status}`,
          kind: "http",
          url,
          status: response.status,
          statusText: response.statusText,
          body,
        })
      }

      if (typeof body === "string" || body == null) {
        throw new ApiError({
          message: "Tracking API returned a non-JSON success response",
          kind: "invalid-json",
          url,
          status: response.status,
          statusText: response.statusText,
          body,
        })
      }

      if (!validate(body)) {
        throw new ApiError({
          message: "Tracking API returned JSON that does not match the expected response shape",
          kind: "invalid-payload",
          url,
          status: response.status,
          statusText: response.statusText,
          body,
        })
      }

      return body
    } catch (error) {
      if (error instanceof ApiError) throw error

      const aborted = abortedByCaller || controller.signal.aborted
      throw new ApiError({
        message: timedOut
          ? `Tracking API request timed out after ${this.timeoutMs} ms`
          : aborted
            ? "Tracking API request was cancelled"
            : "Tracking API request failed before receiving a response",
        kind: timedOut ? "timeout" : aborted ? "aborted" : "network",
        url,
        cause: error,
      })
    } finally {
      if (timeout !== null) clearTimeout(timeout)
      externalSignal?.removeEventListener("abort", abortFromCaller)
    }
  }

  private get<T>(
    path: string,
    validate: (value: unknown) => value is T,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    return this.request("GET", path, validate, externalSignal)
  }

  private post<T>(
    path: string,
    body: unknown,
    validate: (value: unknown) => value is T,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    return this.request("POST", path, validate, externalSignal, body)
  }

  private put<T>(
    path: string,
    body: unknown,
    validate: (value: unknown) => value is T,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    return this.request("PUT", path, validate, externalSignal, body)
  }

  getStatus(signal?: AbortSignal): Promise<TrackingStatusDto> {
    return this.get("/api/tracking/status", isTrackingStatusDto, signal)
  }

  getCapabilities(signal?: AbortSignal): Promise<TrackingCapabilitiesDto> {
    return this.get("/api/tracking/capabilities", isTrackingCapabilitiesDto, signal)
  }

  getMap(signal?: AbortSignal): Promise<TrackingMapDto> {
    return this.get("/api/tracking/map", isTrackingMapDto, signal)
  }

  getState(signal?: AbortSignal): Promise<TrackingStateDto> {
    return this.get("/api/tracking/state", isTrackingStateDto, signal)
  }

  getBundle(trackingId: string, signal?: AbortSignal): Promise<TrackedBundleDto> {
    const normalizedId = trackingId.trim()
    if (!normalizedId) throw new Error("trackingId is required")
    return this.get(`/api/tracking/bundles/${encodeURIComponent(normalizedId)}`, isTrackedBundleDto, signal)
  }

  getOpcStatus(signal?: AbortSignal): Promise<OpcStatusDto> {
    return this.get("/api/tracking/opc", isOpcStatusDto, signal)
  }

  getRecentEvents(signal?: AbortSignal): Promise<TrackingEventsResponseDto> {
    return this.get("/api/tracking/events/recent", isTrackingEventsResponseDto, signal)
  }

  getQmosStatus(signal?: AbortSignal): Promise<QmosStatusDto> {
    return this.get("/api/qmos/status", isQmosStatusDto, signal)
  }

  async getQmosMillOrders(max = 20, signal?: AbortSignal): Promise<QmosMillOrdersDto> {
    if (!Number.isSafeInteger(max) || max <= 0 || max > MAX_QMOS_MILL_ORDERS) {
      throw new Error(`max must be an integer between 1 and ${MAX_QMOS_MILL_ORDERS}`)
    }

    const response: QmosMillOrdersResponseDto = await this.get(
      `/api/qmos/mill-orders?max=${max}`,
      isQmosMillOrdersResponseDto,
      signal,
    )

    return Array.isArray(response)
      ? { value: response, Count: response.length }
      : response
  }

  getGlobalMillOrder(signal?: AbortSignal): Promise<GlobalMillOrderDto> {
    return this.get("/api/tracking/mill-order", isGlobalMillOrderDto, signal)
  }

  updateGlobalMillOrder(
    request: GlobalMillOrderUpdateRequestDto,
    signal?: AbortSignal,
  ): Promise<GlobalMillOrderUpdateResponseDto> {
    if (!isGlobalMillOrderUpdateRequestDto(request)) {
      throw new Error("A global Mill Order is required and must not exceed 32 characters")
    }

    return this.put(
      "/api/tracking/mill-order",
      { millOrder: request.millOrder.trim() },
      isGlobalMillOrderUpdateResponseDto,
      signal,
    )
  }

  correctBundle(
    request: TrackingCorrectionRequestDto,
    signal?: AbortSignal,
  ): Promise<TrackingCommandAcceptedDto> {
    if (!isTrackingCorrectionRequestDto(request)) {
      throw new Error("A tracking correction requires four non-empty string fields")
    }

    const sanitizedRequest: TrackingCorrectionRequestDto = {
      TrackingId: request.TrackingId.trim(),
      OperatorId: request.OperatorId.trim(),
      Reason: request.Reason.trim(),
      MillOrder1: request.MillOrder1.trim(),
    }

    return this.post(
      "/api/tracking/correct",
      sanitizedRequest,
      isTrackingCommandAcceptedDto,
      signal,
    )
  }
}

export function createTrackingApiClient(options: TrackingApiClientOptions): TrackingApiClient {
  return new TrackingApiClient(options)
}
