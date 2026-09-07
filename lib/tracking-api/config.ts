export type PlantDataMode = "mock" | "live"

export interface TrackingApiConfig {
  mode: PlantDataMode
  baseUrl: string | null
  pollMs: number
  staleMs: number
  timeoutMs: number
  error: string | null
}

const DEFAULT_POLL_MS = 1_000
const DEFAULT_STALE_MS = 3_500
const DEFAULT_TIMEOUT_MS = 4_000

function readPositiveInteger(value: string | undefined, fallback: number, minimum: number): number {
  if (!value) return fallback

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback
}

function normalizeApiBaseUrl(value: string | undefined): { baseUrl: string | null; error: string | null } {
  const raw = value?.trim()
  if (!raw) {
    return {
      baseUrl: null,
      error: "NEXT_PUBLIC_TRACKING_API_URL is required when live mode is enabled.",
    }
  }

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (raw.includes("?") || raw.includes("#")) {
      return {
        baseUrl: null,
        error: "A relative tracking API URL cannot include a query or fragment.",
      }
    }
    return { baseUrl: raw.replace(/\/+$/, ""), error: null }
  }

  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { baseUrl: null, error: "The tracking API URL must use HTTP or HTTPS." }
    }

    return { baseUrl: url.toString().replace(/\/$/, ""), error: null }
  } catch {
    return { baseUrl: null, error: "NEXT_PUBLIC_TRACKING_API_URL is not a valid URL." }
  }
}

/**
 * Public runtime configuration used by the browser client.
 *
 * These values are embedded by Next.js at build time. Never put credentials in
 * a NEXT_PUBLIC variable.
 */
export function getTrackingApiConfig(): TrackingApiConfig {
  const requestedMode = process.env.NEXT_PUBLIC_PLANT_DATA_MODE?.trim().toLowerCase()
  const invalidMode = Boolean(requestedMode && requestedMode !== "mock" && requestedMode !== "live")
  const mode: PlantDataMode = requestedMode === "live" || invalidMode ? "live" : "mock"
  const pollMs = readPositiveInteger(process.env.NEXT_PUBLIC_TRACKING_POLL_MS, DEFAULT_POLL_MS, 250)
  const staleMs = readPositiveInteger(
    process.env.NEXT_PUBLIC_TRACKING_STALE_MS,
    Math.max(DEFAULT_STALE_MS, pollMs * 3),
    pollMs,
  )
  const timeoutMs = readPositiveInteger(
    process.env.NEXT_PUBLIC_TRACKING_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    250,
  )

  if (invalidMode) {
    return {
      mode,
      baseUrl: null,
      pollMs,
      staleMs,
      timeoutMs,
      error: 'NEXT_PUBLIC_PLANT_DATA_MODE must be either "mock" or "live".',
    }
  }

  if (mode === "mock") {
    return { mode, baseUrl: null, pollMs, staleMs, timeoutMs, error: null }
  }

  const { baseUrl, error } = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_TRACKING_API_URL)
  return { mode, baseUrl, pollMs, staleMs, timeoutMs, error }
}
