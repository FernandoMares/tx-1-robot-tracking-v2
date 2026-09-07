"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  ApiError,
  createTrackingApiClient,
  getTrackingApiConfig,
  parseApiDate,
  type TrackingRuntimeState,
  type TrackingStateDto,
} from "@/lib/tracking-api"

const MAX_RETRY_MS = 30_000

function initialRuntimeState(mode: TrackingRuntimeState["mode"]): TrackingRuntimeState {
  return {
    mode,
    syncStatus: mode === "mock" ? "mock" : "connecting",
    service: null,
    capabilities: null,
    topology: null,
    trackingState: null,
    sourceUpdatedAt: null,
    lastSuccessfulPollAt: null,
    consecutiveFailures: 0,
    error: null,
  }
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === "http") {
      const body = error.body
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
        return `HTTP ${error.status}: ${body.error}`
      }
      return `The tracking service returned HTTP ${error.status ?? "error"}.`
    }

    if (error.kind === "timeout") return "The tracking service did not answer before the request timed out."
    if (error.kind === "invalid-json") return "The tracking service returned an invalid JSON response."
    if (error.kind === "invalid-payload") return "The tracking service returned an incompatible response shape."
    if (error.kind === "aborted") return "The tracking API request was cancelled."
    return "The tracking service could not be reached."
  }

  return error instanceof Error ? error.message : "Unexpected tracking API error."
}

function assertScenarioMatches(
  serviceScenario: string | null,
  mapScenario: string,
  stateScenario: string,
): void {
  const expected = serviceScenario ?? mapScenario
  if (mapScenario !== expected || stateScenario !== expected) {
    throw new Error(
      `Scenario mismatch: status=${serviceScenario ?? "unknown"}, map=${mapScenario}, state=${stateScenario}.`,
    )
  }
}

function retryDelay(pollMs: number, failures: number): number {
  const exponential = Math.min(MAX_RETRY_MS, pollMs * 2 ** Math.min(failures, 5))
  const jitter = 0.9 + Math.random() * 0.2
  return Math.min(MAX_RETRY_MS, Math.round(exponential * jitter))
}

/**
 * Owns the single read loop for the HMI. Startup reads status/capabilities/map
 * before state; normal operation polls only state and never overlaps requests.
 */
export function useTrackingApi() {
  const config = useMemo(() => getTrackingApiConfig(), [])
  const [retryRevision, setRetryRevision] = useState(0)
  const [tracking, setTracking] = useState<TrackingRuntimeState>(() => initialRuntimeState(config.mode))

  const retry = useCallback(() => {
    setRetryRevision((revision) => revision + 1)
  }, [])

  useEffect(() => {
    if (config.mode === "mock") {
      setTracking(initialRuntimeState("mock"))
      return
    }

    if (config.error || !config.baseUrl) {
      setTracking({
        ...initialRuntimeState("live"),
        syncStatus: "config-error",
        error: config.error ?? "Tracking API URL is missing.",
      })
      return
    }

    let cancelled = false
    let timer: number | null = null
    let bootstrapped = false
    let failures = 0
    let expectedScenario: string | null = null
    let activeController: AbortController | null = null

    const client = createTrackingApiClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    })

    const commitState = (state: TrackingStateDto) => {
      const receivedAt = new Date()
      failures = 0

      setTracking((previous) => ({
        ...previous,
        mode: "live",
        syncStatus: "live",
        trackingState: state,
        sourceUpdatedAt: parseApiDate(state.LastUpdateUtc),
        lastSuccessfulPollAt: receivedAt,
        consecutiveFailures: 0,
        error: null,
      }))
    }

    const run = async () => {
      if (cancelled) return

      activeController = new AbortController()
      let nextDelay = config.pollMs

      try {
        if (!bootstrapped) {
          setTracking((previous) => ({
            ...previous,
            mode: "live",
            syncStatus: previous.trackingState ? "reconnecting" : "connecting",
            error: null,
          }))

          const service = await client.getStatus(activeController.signal)
          if (!service.running) throw new Error("The tracking service answered but reported running=false.")

          const capabilities = await client.getCapabilities(activeController.signal)
          const topology = await client.getMap(activeController.signal)
          const state = await client.getState(activeController.signal)
          assertScenarioMatches(service.scenario, topology.ScenarioName, state.ScenarioName)

          if (cancelled) return
          bootstrapped = true
          expectedScenario = topology.ScenarioName
          setTracking((previous) => ({ ...previous, service, capabilities, topology }))
          commitState(state)
        } else {
          const state = await client.getState(activeController.signal)
          if (cancelled) return

          if (expectedScenario && state.ScenarioName !== expectedScenario) {
            bootstrapped = false
            throw new Error(
              `Scenario changed from ${expectedScenario} to ${state.ScenarioName}; reloading topology.`,
            )
          }
          commitState(state)
        }
      } catch (error) {
        if (cancelled) return

        // Refresh status/capabilities/topology after a disconnect or malformed
        // response instead of keeping startup metadata indefinitely.
        bootstrapped = false
        failures += 1
        nextDelay = retryDelay(config.pollMs, failures)
        const failedAt = Date.now()
        const message = describeError(error)

        setTracking((previous) => {
          const lastSuccessMs = previous.lastSuccessfulPollAt?.getTime() ?? null
          const hasSnapshot = previous.trackingState !== null
          const stale = lastSuccessMs !== null && failedAt - lastSuccessMs >= config.staleMs

          return {
            ...previous,
            mode: "live",
            syncStatus: hasSnapshot ? (stale ? "stale" : "reconnecting") : "offline",
            consecutiveFailures: failures,
            error: message,
          }
        })
      } finally {
        activeController = null
        if (!cancelled) timer = window.setTimeout(run, nextDelay)
      }
    }

    setTracking((previous) =>
      previous.mode === "live" && (previous.trackingState || previous.topology)
        ? { ...previous, syncStatus: "reconnecting", consecutiveFailures: 0, error: null }
        : initialRuntimeState("live"),
    )
    void run()

    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
      activeController?.abort()
    }
  }, [config.baseUrl, config.error, config.mode, config.pollMs, config.staleMs, config.timeoutMs, retryRevision])

  useEffect(() => {
    if (
      (tracking.syncStatus !== "live" && tracking.syncStatus !== "reconnecting") ||
      !tracking.lastSuccessfulPollAt
    ) {
      return
    }

    const remainingMs = Math.max(
      0,
      tracking.lastSuccessfulPollAt.getTime() + config.staleMs - Date.now(),
    )
    const timer = window.setTimeout(() => {
      setTracking((previous) => {
        const lastSuccessMs = previous.lastSuccessfulPollAt?.getTime()
        const isOverdue = lastSuccessMs != null && Date.now() - lastSuccessMs >= config.staleMs
        const canBecomeStale = previous.syncStatus === "live" || previous.syncStatus === "reconnecting"
        return canBecomeStale && isOverdue ? { ...previous, syncStatus: "stale" } : previous
      })
    }, remainingMs)

    return () => window.clearTimeout(timer)
  }, [config.staleMs, tracking.lastSuccessfulPollAt, tracking.syncStatus])

  return { tracking, retry, config }
}
