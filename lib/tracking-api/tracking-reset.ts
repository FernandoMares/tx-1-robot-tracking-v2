import { getActiveBundles, isRemovedBundle } from "./bundle-lifecycle"
import type { TrackingCapabilitiesDto, TrackingStateDto, TrackingStatusDto } from "./types"

/** Match the advertised endpoint exactly; GET/reset-like commands are not authority to POST. */
export function supportsTrackingReset(capabilities: TrackingCapabilitiesDto | null): boolean {
  return capabilities?.commands.some((command) => {
    const parts = command.trim().split(/\s+/)
    return parts.length === 1
      ? parts[0] === "/api/tracking/reset"
      : parts.length === 2 && parts[0].toUpperCase() === "POST" && parts[1] === "/api/tracking/reset"
  }) === true
}

function unambiguousState(state: TrackingStateDto): boolean {
  if (!state.ScenarioName.trim()) return false
  const identities = new Set<string>()
  return state.Bundles.every((bundle) => {
    if (!bundle.TrackingId.trim() || bundle.ScenarioName !== state.ScenarioName || identities.has(bundle.TrackingId)) return false
    identities.add(bundle.TrackingId)
    return true
  })
}

function activeIdentitySignature(state: TrackingStateDto): string {
  return JSON.stringify(getActiveBundles(state.Bundles).map((bundle) => bundle.TrackingId).sort())
}

/** Run only on newly fetched metadata/state AFTER the final confirmation. */
export function resetPreflightProblem(options: {
  displayedState: TrackingStateDto
  service: TrackingStatusDto
  capabilities: TrackingCapabilitiesDto
  state: TrackingStateDto
}): string | null {
  const { displayedState, service, capabilities, state } = options
  if (!service.running || !supportsTrackingReset(capabilities)) {
    return "Tracking is not running or no longer advertises POST /api/tracking/reset."
  }
  if (!state.ScenarioName.trim() || state.ScenarioName !== displayedState.ScenarioName || service.scenario !== state.ScenarioName) {
    return "The tracking scenario changed or could not be verified. Refresh tracking before confirming a reset."
  }
  if (!unambiguousState(displayedState) || !unambiguousState(state)) {
    return "The tracking state contains missing, duplicate or foreign-scenario bundle identities. Verify the backend state before resetting."
  }
  if (activeIdentitySignature(displayedState) !== activeIdentitySignature(state)) {
    return "The set of active bundles changed while confirming. Review the current scope and confirm again. No reset was sent."
  }
  return null
}

/**
 * Observes a subsequent cleared state, not proof of event processing or PLC effects.
 * An already empty baseline cannot demonstrate that RESET was processed. Incoming
 * bundles or malformed retained records likewise require backend audit review.
 */
export function resetOutcomeObserved(baseline: TrackingStateDto, state: TrackingStateDto): boolean {
  if (state.ScenarioName !== baseline.ScenarioName || !unambiguousState(baseline) || !unambiguousState(state)) return false
  if (getActiveBundles(baseline.Bundles).length === 0 || getActiveBundles(state.Bundles).length > 0) return false
  return state.Bundles.every((bundle) =>
    isRemovedBundle(bundle) && bundle.CurrentZone === null &&
    Array.isArray(bundle.OccupiedZones) && bundle.OccupiedZones.length === 0,
  )
}
