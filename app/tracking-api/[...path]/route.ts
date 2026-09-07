const STATIC_READ_ENDPOINTS = new Set([
  "/api/tracking/status",
  "/api/tracking/capabilities",
  "/api/tracking/map",
  "/api/tracking/state",
  "/api/tracking/opc",
  "/api/tracking/events/recent",
  "/api/qmos/status",
])

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
  upstreamUrl.search = new URL(request.url).search

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
