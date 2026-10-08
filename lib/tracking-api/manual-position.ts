import type {
  TrackedBundleDto,
  TrackingCapabilitiesDto,
  TrackingMapDto,
  TrackingStateDto,
  TrackingStatusDto,
  TrackingZoneDto,
} from "./types"

export type ManualTrackingAction = "remove" | "reposition"

export function supportsManualCorrection(capabilities: TrackingCapabilitiesDto | null): boolean {
  return capabilities?.commands.some((command) => {
    const parts = command.trim().split(/\s+/)
    return parts.length === 1
      ? parts[0] === "/api/tracking/correct"
      : parts.length === 2 && parts[0].toUpperCase() === "POST" && parts[1] === "/api/tracking/correct"
  }) === true
}

/** Use the API catalog, including enabled zones hidden in the schematic. */
export function getRepositionZones(map: TrackingMapDto | null): TrackingZoneDto[] {
  if (!map) return []
  return map.Zones.filter((zone) =>
    zone.IsEnabled && zone.ZoneName.trim().length > 0 &&
    map.Zones.filter((candidate) => candidate.ZoneName === zone.ZoneName).length === 1,
  ).sort((left, right) =>
    (left.DisplayOrder ?? Number.MAX_SAFE_INTEGER) - (right.DisplayOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.ZoneName.localeCompare(right.ZoneName),
  )
}

/** Snapshot information only: not a capacity/interlock or full PLC footprint check. */
export function reportedZoneOccupants(state: TrackingStateDto | null, zone: string): string[] {
  if (!state) return []
  return [...new Set(state.Bundles.filter((bundle) =>
    bundle.CurrentZone === zone ||
    (Array.isArray(bundle.OccupiedZones) && bundle.OccupiedZones.includes(zone)),
  ).map((bundle) => bundle.TrackingId))].sort()
}

function positionSignature(bundle: TrackedBundleDto): string {
  return JSON.stringify([
    bundle.TrackingId,
    bundle.CurrentZone,
    Array.isArray(bundle.OccupiedZones)
      ? bundle.OccupiedZones.map((zone) => JSON.stringify(zone)).sort()
      : null,
  ])
}

function zoneSignature(zone: TrackingZoneDto): string {
  return JSON.stringify([zone.ZoneId, zone.ZoneName, zone.IsEnabled, zone.ZoneType, zone.Capacity])
}

/** Validate a newly requested snapshot AFTER confirmation, never a timer-aged UI snapshot. */
export function manualPreflightProblem(options: {
  action: ManualTrackingAction
  selected: TrackedBundleDto
  displayedState: TrackingStateDto
  destination: TrackingZoneDto | null
  service: TrackingStatusDto
  capabilities: TrackingCapabilitiesDto
  map: TrackingMapDto
  state: TrackingStateDto
}): string | null {
  const { action, selected, displayedState, destination, service, capabilities, map, state } = options
  if (!service.running || !supportsManualCorrection(capabilities)) {
    return "Tracking is not running or no longer advertises the correction command."
  }
  if (
    state.ScenarioName !== displayedState.ScenarioName || map.ScenarioName !== state.ScenarioName ||
    selected.ScenarioName !== state.ScenarioName ||
    (service.scenario !== null && service.scenario !== state.ScenarioName)
  ) return "The tracking scenario changed. Reload tracking before selecting a bundle."

  const matches = state.Bundles.filter((bundle) => bundle.TrackingId === selected.TrackingId)
  if (matches.length !== 1) return "The selected TrackingId is missing or ambiguous in the current state."
  if (matches[0].ScenarioName !== state.ScenarioName || positionSignature(matches[0]) !== positionSignature(selected)) {
    return "The selected bundle's position changed. Review its current position and confirm again."
  }
  if (action === "remove") return null

  const currentDestination = getRepositionZones(map).find((zone) => zone.ZoneName === destination?.ZoneName)
  if (!destination || !currentDestination) return "The destination is not an enabled, unambiguous zone in the current map."
  if (matches[0].CurrentZone === currentDestination.ZoneName) return "The bundle is already in the selected destination."
  if (zoneSignature(destination) !== zoneSignature(currentDestination)) {
    return "The destination configuration changed. Refresh the map and review the destination."
  }
  if (JSON.stringify(reportedZoneOccupants(displayedState, destination.ZoneName)) !==
      JSON.stringify(reportedZoneOccupants(state, destination.ZoneName))) {
    return "Reported destination occupancy changed. Review the current state and confirm again."
  }
  return null
}

/** Observing state is not proof of event processing or PLC/physical movement. */
export function manualOutcomeObserved(
  action: ManualTrackingAction,
  trackingId: string,
  destination: string,
  state: TrackingStateDto,
): boolean {
  const matches = state.Bundles.filter((bundle) => bundle.TrackingId === trackingId)
  return action === "remove"
    ? matches.length === 0
    : matches.length === 1 && matches[0].ScenarioName === state.ScenarioName && matches[0].CurrentZone === destination
}
