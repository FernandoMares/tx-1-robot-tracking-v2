import type {
  TrackingCapabilitiesDto,
  TrackingMapDto,
  TrackingStateDto,
  TrackingStatusDto,
} from "./types"
import type { PlantDataMode } from "./config"

export type TrackingSyncStatus =
  | "mock"
  | "config-error"
  | "connecting"
  | "live"
  | "reconnecting"
  | "stale"
  | "offline"

export interface TrackingRuntimeState {
  mode: PlantDataMode
  syncStatus: TrackingSyncStatus
  service: TrackingStatusDto | null
  capabilities: TrackingCapabilitiesDto | null
  topology: TrackingMapDto | null
  trackingState: TrackingStateDto | null
  sourceUpdatedAt: Date | null
  lastSuccessfulPollAt: Date | null
  consecutiveFailures: number
  error: string | null
}
