"use client"

import {
  CircleAlert,
  ClockAlert,
  Database,
  LoaderCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type {
  TrackingRuntimeState,
  TrackingSyncStatus,
} from "@/lib/tracking-api/runtime"
import { formatClock } from "@/lib/status"
import type { TrackingLayoutValidation } from "@/lib/tracking-zone-layout"
import { cn } from "@/lib/utils"

interface TrackingConnectionBannerProps {
  tracking: TrackingRuntimeState
  layoutValidation?: TrackingLayoutValidation | null
  onRetry: () => void
}

export function TrackingSyncBadge({ tracking }: { tracking: TrackingRuntimeState }) {
  const presentation = STATUS_PRESENTATION[tracking.syncStatus]

  return (
    <span
      className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", presentation.surface)}
    >
      {presentation.label}
    </span>
  )
}

interface StatusPresentation {
  label: string
  description: string
  icon: LucideIcon
  surface: string
  iconClassName: string
  pulseClassName?: string
}

const STATUS_PRESENTATION: Record<TrackingSyncStatus, StatusPresentation> = {
  mock: {
    label: "Mock data",
    description: "Using local simulated plant data.",
    icon: Database,
    surface: "border-border bg-card",
    iconClassName: "text-offline",
  },
  "config-error": {
    label: "Configuration required",
    description: "Set the required NEXT_PUBLIC values, then restart or rebuild the frontend.",
    icon: CircleAlert,
    surface: "border-error-line bg-error-soft",
    iconClassName: "text-error-fg",
  },
  connecting: {
    label: "Connecting",
    description: "Opening the tracking data connection.",
    icon: LoaderCircle,
    surface: "border-border bg-card",
    iconClassName: "animate-spin text-offline motion-reduce:animate-none",
  },
  live: {
    label: "Live API",
    description: "Tracking data is updating automatically.",
    icon: Wifi,
    surface: "border-active/30 bg-active/10",
    iconClassName: "text-active-fg",
    pulseClassName: "bg-active",
  },
  reconnecting: {
    label: "Reconnecting",
    description: "Showing the last received data while the service reconnects.",
    icon: RefreshCw,
    surface: "border-warning-line bg-warning-soft",
    iconClassName: "animate-spin text-warning-fg motion-reduce:animate-none",
    pulseClassName: "bg-warning",
  },
  stale: {
    label: "Data is stale",
    description: "Showing the last received data; updates are overdue.",
    icon: ClockAlert,
    surface: "border-warning-line bg-warning-soft",
    iconClassName: "text-warning-fg",
  },
  offline: {
    label: "API offline",
    description: "Showing the last received data when available.",
    icon: WifiOff,
    surface: "border-error-line bg-error-soft",
    iconClassName: "text-error-fg",
  },
}

const RETRYABLE_STATUSES = new Set<TrackingSyncStatus>([
  "reconnecting",
  "stale",
  "offline",
])

function compactError(message: string): string {
  const safeMessage = message
    .replace(/https?:\/\/\S+/gi, "tracking endpoint")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "tracking endpoint")
    .replace(/\s+/g, " ")
    .trim()

  if (safeMessage.length <= 120) return safeMessage
  return `${safeMessage.slice(0, 117)}...`
}

export function TrackingConnectionBanner({
  tracking,
  layoutValidation = null,
  onRetry,
}: TrackingConnectionBannerProps) {
  const presentation = STATUS_PRESENTATION[tracking.syncStatus]
  const StatusIcon = presentation.icon
  const scenario =
    tracking.service?.scenario ??
    tracking.trackingState?.ScenarioName ??
    tracking.topology?.ScenarioName ??
    "Unknown"
  const apiVersion = tracking.service?.apiVersion ?? tracking.capabilities?.apiVersion ?? "Unknown"
  const bundleCount = tracking.trackingState?.Bundles.length
  const enabledZoneCount = tracking.topology?.Zones.filter((zone) => zone.IsEnabled).length
  const hasSnapshot = Boolean(tracking.trackingState || tracking.topology)
  const showSnapshot = tracking.syncStatus === "live" || hasSnapshot
  const showRetry = RETRYABLE_STATUSES.has(tracking.syncStatus)
  const errorMessage = tracking.error ? compactError(tracking.error) : null

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border px-3 py-1.5 sm:flex-row sm:items-center sm:justify-between",
        presentation.surface,
      )}
      aria-label="Tracking API connection"
    >
      <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
        <span className="relative mt-0.5 shrink-0 sm:mt-0" aria-hidden>
          <StatusIcon className={cn("size-4", presentation.iconClassName)} strokeWidth={2.25} />
          {presentation.pulseClassName && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 size-1.5 animate-soft-pulse rounded-full motion-reduce:animate-none",
                presentation.pulseClassName,
              )}
            />
          )}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className="text-xs font-semibold text-foreground"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {presentation.label}
            </span>
            <span className="text-xs text-muted-foreground">{presentation.description}</span>
          </div>

          {showSnapshot && (
            <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] text-muted-foreground">
              <div className="flex gap-1">
                <dt>Scenario</dt>
                <dd className="font-medium text-foreground">{scenario}</dd>
              </div>
              <div className="flex gap-1">
                <dt>API</dt>
                <dd className="font-medium text-foreground">v{apiVersion}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="sr-only">Bundles</dt>
                <dd className="font-medium text-foreground">{bundleCount ?? "N/A"} bundles</dd>
              </div>
              <div className="flex gap-1">
                <dt className="sr-only">Enabled zones</dt>
                <dd className="font-medium text-foreground">{enabledZoneCount ?? "N/A"} enabled zones</dd>
              </div>
              <div className="flex gap-1 tabular">
                <dt>Received</dt>
                <dd className="font-medium text-foreground">
                  {tracking.lastSuccessfulPollAt ? formatClock(tracking.lastSuccessfulPollAt) : "Pending"}
                </dd>
              </div>
              <div className="flex gap-1 tabular">
                <dt>State changed</dt>
                <dd className="font-medium text-foreground">
                  {tracking.sourceUpdatedAt ? formatClock(tracking.sourceUpdatedAt) : "N/A"}
                </dd>
              </div>
            </dl>
          )}

          {errorMessage && tracking.syncStatus !== "live" && tracking.syncStatus !== "mock" && (
            <p className="mt-1 text-[0.6875rem] text-muted-foreground" role="alert">
              Error: {errorMessage}
            </p>
          )}

          {layoutValidation && !layoutValidation.valid && (
            <p className="mt-1 text-[0.6875rem] font-medium text-warning-fg" role="alert">
              Layout mapping requires review: {layoutValidation.enabledApiZonesWithoutLayout.length} API zone(s)
              without a visual slot and {layoutValidation.layoutZonesMissingFromEnabledApi.length} expected zone(s)
              missing from the API; {layoutValidation.duplicateApiZoneNames.length} duplicate name(s) and{" "}
              {layoutValidation.displayOrderMismatches.length} display-order mismatch(es).
            </p>
          )}
        </div>
      </div>

      {showRetry && (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="self-start bg-background/80 sm:self-center"
          onClick={onRetry}
          aria-label="Retry tracking API connection"
        >
          <RefreshCw className="size-3" aria-hidden />
          Retry
        </Button>
      )}
    </section>
  )
}
