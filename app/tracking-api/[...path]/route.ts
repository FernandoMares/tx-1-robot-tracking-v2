import type {
  GlobalDestinationUpdateRequestDto,
  GlobalMillOrderUpdateRequestDto,
  GlobalPrinterUpdateRequestDto,
  TrackingCorrectionRequestDto,
  TrackingRemovalRequestDto,
  TrackingRepositionRequestDto,
  QmosLpnModeUpdateRequestDto,
} from "@/lib/tracking-api/types"
import {
  isGlobalDestinationUpdateRequestDto,
  isGlobalMillOrderUpdateRequestDto,
  isGlobalPrinterUpdateRequestDto,
  isTrackingCorrectionRequestDto,
  isTrackingRemovalRequestDto,
  isTrackingRepositionRequestDto,
  isQmosLpnModeUpdateRequestDto,
} from "@/lib/tracking-api/validation"

const STATIC_READ_ENDPOINTS = new Set([
  "/api/tracking/status",
  "/api/tracking/capabilities",
  "/api/tracking/map",
  "/api/tracking/state",
  "/api/tracking/mill-order",
  "/api/tracking/destination",
  "/api/tracking/printer",
  "/api/tracking/qmos-lpn-mode",
  "/api/tracking/opc",
  "/api/tracking/events/recent",
  "/api/qmos/status",
  "/api/qmos/mill-orders",
  "/api/qmos/bundle-locations",
  "/api/qmos/printers",
])

const TRACKING_CORRECTION_ENDPOINT = "/api/tracking/correct"
const TRACKING_RESET_ENDPOINT = "/api/tracking/reset"
const GLOBAL_MILL_ORDER_ENDPOINT = "/api/tracking/mill-order"
const GLOBAL_DESTINATION_ENDPOINT = "/api/tracking/destination"
const GLOBAL_PRINTER_ENDPOINT = "/api/tracking/printer"
const QMOS_LPN_MODE_ENDPOINT = "/api/tracking/qmos-lpn-mode"
const QMOS_MILL_ORDERS_ENDPOINT = "/api/qmos/mill-orders"
const DEFAULT_QMOS_MILL_ORDERS = 20
const MAX_QMOS_MILL_ORDERS = 100

interface RouteContext {
  params: Promise<{ path: string[] }>
}

function isAllowedReadEndpoint(pathname: string): boolean {
  return (
    STATIC_READ_ENDPOINTS.has(pathname) ||
    /^\/api\/tracking\/bundles\/[^/]+$/.test(pathname)
  )
}

function getProxyTarget(): URL {
  const configuredTarget = process.env.TRACKING_API_PROXY_TARGET?.trim()
  if (!configuredTarget) {
    throw new Error("TRACKING_API_PROXY_TARGET is not configured.")
  }

  const target = new URL(configuredTarget)
  if (
    (target.protocol !== "http:" && target.protocol !== "https:") ||
    target.username ||
    target.password
  ) {
    throw new Error("TRACKING_API_PROXY_TARGET must be an HTTP(S) URL without credentials.")
  }

  target.pathname = target.pathname.replace(/\/+$/, "") + "/"
  target.search = ""
  target.hash = ""
  return target
}

function jsonError(status: number, error: string): Response {
  return Response.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params
  const decodedPath = "/" + path.join("/")

  if (!isAllowedReadEndpoint(decodedPath)) {
    return jsonError(404, "Tracking API endpoint not found.")
  }

  let proxyTarget: URL
  try {
    proxyTarget = getProxyTarget()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tracking API proxy is not configured."
    return jsonError(503, message)
  }

  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/")
  const upstreamUrl = new URL(encodedPath, proxyTarget)
  const requestUrl = new URL(request.url)

  if (decodedPath === QMOS_MILL_ORDERS_ENDPOINT) {
    const maxValues = requestUrl.searchParams.getAll("max")
    const hasUnknownParameters = Array.from(requestUrl.searchParams.keys()).some(
      (key) => key !== "max",
    )
    const rawMax = maxValues.length === 0 ? String(DEFAULT_QMOS_MILL_ORDERS) : maxValues[0]
    const max = Number(rawMax)

    if (
      hasUnknownParameters ||
      maxValues.length > 1 ||
      !/^\d+$/.test(rawMax) ||
      !Number.isSafeInteger(max) ||
      max < 1 ||
      max > MAX_QMOS_MILL_ORDERS
    ) {
      return jsonError(400, `max must be an integer between 1 and ${MAX_QMOS_MILL_ORDERS}.`)
    }

    upstreamUrl.searchParams.set("max", String(max))
  } else {
    upstreamUrl.search = requestUrl.search
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: request.signal,
    })
    const body = await upstream.arrayBuffer()

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    })
  } catch {
    return jsonError(502, "The tracking service could not be reached by the frontend server.")
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params
  const decodedPath = "/" + path.join("/")

  if (decodedPath === TRACKING_RESET_ENDPOINT) {
    return resetTracking(request, path)
  }

  if (decodedPath !== TRACKING_CORRECTION_ENDPOINT) {
    return jsonError(404, "Tracking API endpoint not found.")
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase()
  if (contentType !== "application/json") {
    return jsonError(415, "Content-Type must be application/json.")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, "A valid JSON request body is required.")
  }

  let sanitizedBody: TrackingCorrectionRequestDto | TrackingRemovalRequestDto | TrackingRepositionRequestDto
  if (isTrackingRemovalRequestDto(body)) {
    sanitizedBody = {
      TrackingId: body.TrackingId.trim(),
      Operation: "REMOVE",
      OperatorId: body.OperatorId.trim(),
      Reason: body.Reason?.trim() || null,
    }
  } else if (body && typeof body === "object" && "Operation" in body) {
    return jsonError(400, "Removal requires Operation=REMOVE, TrackingId, OperatorId, and a string or null Reason.")
  } else if (isTrackingRepositionRequestDto(body)) {
    sanitizedBody = {
      TrackingId: body.TrackingId.trim(),
      OperatorId: body.OperatorId.trim(),
      Reason: body.Reason.trim(),
      CurrentZone: body.CurrentZone.trim(),
    }
  } else if (body && typeof body === "object" && "CurrentZone" in body) {
    return jsonError(400, "Reposition requires TrackingId, OperatorId, Reason, and CurrentZone without Operation or MillOrder1.")
  } else if (isTrackingCorrectionRequestDto(body)) {
    sanitizedBody = {
      TrackingId: body.TrackingId.trim(),
      OperatorId: body.OperatorId.trim(),
      Reason: body.Reason.trim(),
      MillOrder1: body.MillOrder1.trim(),
    }
  } else {
    return jsonError(400, "Correction requires TrackingId, OperatorId, Reason, and MillOrder1.")
  }

  let proxyTarget: URL
  try {
    proxyTarget = getProxyTarget()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tracking API proxy is not configured."
    return jsonError(503, message)
  }

  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/")
  const upstreamUrl = new URL(encodedPath, proxyTarget)

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sanitizedBody),
      signal: request.signal,
    })
    const responseBody = await upstream.arrayBuffer()

    return new Response(responseBody, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    })
  } catch {
    return jsonError(502, "The tracking service could not be reached by the frontend server.")
  }
}

async function resetTracking(request: Request, path: string[]): Promise<Response> {
  // This makes reset an explicit HMI action and blocks simple cross-origin form
  // submissions. It is NOT authentication or an operator authorization check.
  if (request.headers.get("X-Tracking-Reset-Confirmation") !== "RESET") {
    return jsonError(403, "An explicit tracking reset confirmation is required.")
  }

  const requestUrl = new URL(request.url)
  if (!resetOriginMatchesRequest(request, requestUrl)) {
    return jsonError(403, "Tracking reset must originate from this HMI.")
  }
  if (requestUrl.search) {
    return jsonError(400, "Tracking reset does not accept query parameters.")
  }

  try {
    if ((await request.text()).length !== 0) {
      return jsonError(400, "Tracking reset does not accept a request body.")
    }
  } catch {
    return jsonError(400, "The tracking reset request could not be read.")
  }

  let proxyTarget: URL
  try {
    proxyTarget = getProxyTarget()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tracking API proxy is not configured."
    return jsonError(503, message)
  }

  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/")
  const upstreamUrl = new URL(encodedPath, proxyTarget)
  try {
    // Reset has no request body in the backend contract. Do not forward the
    // browser's intent header or follow redirects that could repeat this POST.
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal: request.signal,
    })
    const body = await upstream.arrayBuffer()
    const bodyForbidden = upstream.status === 204 || upstream.status === 205 || upstream.status === 304
    return new Response(bodyForbidden ? null : body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    })
  } catch {
    return jsonError(502, "Tracking reset response was not received. The command may have been accepted; do not resend it automatically.")
  }
}

function resetOriginMatchesRequest(request: Request, requestUrl: URL): boolean {
  const origin = request.headers.get("Origin")
  if (origin === null) return true

  // Next may normalize a loopback URL to localhost or build it from the listen
  // hostname (0.0.0.0), while the browser actually addressed a different host.
  // Compare against the inbound Host authority, not that internal hostname.
  // Never substitute X-Forwarded-Host/Forwarded supplied by a caller. A reverse
  // proxy deployment must preserve the approved Host and request protocol.
  const host = request.headers.get("Host") ?? requestUrl.host
  if (!host || /[\s\\/?#@,%]/.test(host)) return false
  try {
    const inbound = new URL(`${requestUrl.protocol}//${host}`)
    if (!inbound.hostname || inbound.username || inbound.password ||
      inbound.pathname !== "/" || inbound.search || inbound.hash) return false
    return (inbound.protocol === "http:" || inbound.protocol === "https:") && origin === inbound.origin
  } catch {
    return false
  }
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params
  const decodedPath = "/" + path.join("/")

  if (
    decodedPath !== GLOBAL_MILL_ORDER_ENDPOINT &&
    decodedPath !== GLOBAL_DESTINATION_ENDPOINT &&
    decodedPath !== GLOBAL_PRINTER_ENDPOINT &&
    decodedPath !== QMOS_LPN_MODE_ENDPOINT
  ) {
    return jsonError(404, "Tracking API endpoint not found.")
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase()
  if (contentType !== "application/json") {
    return jsonError(415, "Content-Type must be application/json.")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, "A valid JSON request body is required.")
  }

  let sanitizedBody:
    | GlobalMillOrderUpdateRequestDto
    | GlobalDestinationUpdateRequestDto
    | GlobalPrinterUpdateRequestDto
    | QmosLpnModeUpdateRequestDto
  if (decodedPath === GLOBAL_MILL_ORDER_ENDPOINT) {
    if (!isGlobalMillOrderUpdateRequestDto(body)) {
      return jsonError(400, "millOrder must be a non-empty string of at most 32 characters.")
    }
    sanitizedBody = { millOrder: body.millOrder.trim() }
  } else if (decodedPath === GLOBAL_DESTINATION_ENDPOINT) {
    if (!isGlobalDestinationUpdateRequestDto(body)) {
      return jsonError(400, "destinationId must be a positive integer.")
    }
    sanitizedBody = { destinationId: body.destinationId }
  } else if (decodedPath === QMOS_LPN_MODE_ENDPOINT) {
    if (!isQmosLpnModeUpdateRequestDto(body)) {
      return jsonError(400, "Enabled must be boolean; OperatorId (1–100 characters) and Reason (1–500 characters) are required.")
    }
    sanitizedBody = { Enabled: body.Enabled, OperatorId: body.OperatorId.trim(), Reason: body.Reason.trim() }
  } else {
    if (!isGlobalPrinterUpdateRequestDto(body)) {
      return jsonError(400, "PrinterId must be a positive integer.")
    }
    sanitizedBody = { PrinterId: body.PrinterId }
  }

  let proxyTarget: URL
  try {
    proxyTarget = getProxyTarget()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tracking API proxy is not configured."
    return jsonError(503, message)
  }

  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/")
  const upstreamUrl = new URL(encodedPath, proxyTarget)

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "PUT",
      cache: "no-store",
      redirect: decodedPath === QMOS_LPN_MODE_ENDPOINT ? "error" : undefined,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sanitizedBody),
      signal: request.signal,
    })
    const responseBody = await upstream.arrayBuffer()

    return new Response(responseBody, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    })
  } catch {
    return jsonError(502, "The tracking service could not be reached by the frontend server.")
  }
}
