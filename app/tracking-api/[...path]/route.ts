import type { TrackingCorrectionRequestDto } from "@/lib/tracking-api/types"
import { isTrackingCorrectionRequestDto } from "@/lib/tracking-api/validation"

const STATIC_READ_ENDPOINTS = new Set([
  "/api/tracking/status",
  "/api/tracking/capabilities",
  "/api/tracking/map",
  "/api/tracking/state",
  "/api/tracking/opc",
  "/api/tracking/events/recent",
  "/api/qmos/status",
  "/api/qmos/mill-orders",
])

const TRACKING_CORRECTION_ENDPOINT = "/api/tracking/correct"
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

  if (!isTrackingCorrectionRequestDto(body)) {
    return jsonError(400, "TrackingId, OperatorId, Reason, and MillOrder1 must be non-empty strings.")
  }

  const sanitizedBody: TrackingCorrectionRequestDto = {
    TrackingId: body.TrackingId.trim(),
    OperatorId: body.OperatorId.trim(),
    Reason: body.Reason.trim(),
    MillOrder1: body.MillOrder1.trim(),
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
