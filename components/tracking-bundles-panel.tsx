"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Boxes, ChevronRight, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  ApiError,
  createTrackingApiClient,
  type TrackedBundleDto,
  type TrackingApiConfig,
  type TrackingRuntimeState,
} from "@/lib/tracking-api"
import { isTrackingZoneName } from "@/lib/tracking-zone-layout"

interface TrackingBundlesPanelProps {
  tracking: TrackingRuntimeState
  config: TrackingApiConfig
  onRefresh: () => void
}

type RemovalStatus = "idle" | "sending" | "pending" | "uncertain" | "success" | "error"

function displayIdentity(bundle: TrackedBundleDto) {
  return bundle.BundleId ?? (bundle.L2Id != null ? String(bundle.L2Id) : bundle.TrackingId)
}

function describeRemovalError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === "http") {
      const detail = error.body && typeof error.body === "object" && "error" in error.body
        ? error.body.error
        : null
      return typeof detail === "string" ? `HTTP ${error.status}: ${detail}` : `HTTP ${error.status}.`
    }
    if (error.kind === "timeout") return "The request timed out. It may still have been accepted."
    return "The request could not be verified. It may still have been accepted."
  }
  return error instanceof Error ? error.message : "The removal could not be verified."
}

function removalMayHaveBeenAccepted(error: unknown): boolean {
  return !(error instanceof ApiError) || error.kind !== "http" || (error.status ?? 500) >= 500
}

/** Live bundle readout from the current Tracking state. */
export function TrackingBundlesPanel({ tracking, config, onRefresh }: TrackingBundlesPanelProps) {
  const bundles = tracking.trackingState?.Bundles
  const [open, setOpen] = useState(false)
  const [selectedBundle, setSelectedBundle] = useState<TrackedBundleDto | null>(null)
  const [operatorId, setOperatorId] = useState("")
  const [reason, setReason] = useState("")
  const [removalStatus, setRemovalStatus] = useState<RemovalStatus>("idle")
  const [removalMessage, setRemovalMessage] = useState<string | null>(null)
  const [removalResponseAt, setRemovalResponseAt] = useState<number | null>(null)
  const removalSubmitted = useRef(false)
  const latestRemovalState = useRef({ tracking, selectedTrackingId: selectedBundle?.TrackingId ?? null })
  const client = useMemo(
    () => config.mode === "live" && config.baseUrl
      ? createTrackingApiClient({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs })
      : null,
    [config.baseUrl, config.mode, config.timeoutMs],
  )
  const selectedStillTracked = selectedBundle
    ? bundles?.find((bundle) => bundle.TrackingId === selectedBundle.TrackingId)
    : null
  const removalAvailable =
    tracking.syncStatus === "live" &&
    tracking.capabilities?.commands.some((command) => command.includes("/api/tracking/correct")) === true

  useLayoutEffect(() => {
    latestRemovalState.current = { tracking, selectedTrackingId: selectedBundle?.TrackingId ?? null }
  }, [tracking, selectedBundle])

  useEffect(() => {
    if (
      (removalStatus === "pending" || removalStatus === "uncertain") &&
      selectedBundle &&
      tracking.syncStatus === "live" &&
      removalResponseAt !== null &&
      tracking.lastSuccessfulPollAt !== null &&
      tracking.lastSuccessfulPollAt.getTime() > removalResponseAt &&
      bundles &&
      !bundles.some((bundle) => bundle.TrackingId === selectedBundle.TrackingId)
    ) {
      setRemovalStatus("success")
      setRemovalMessage(
        removalStatus === "uncertain"
          ? `${displayIdentity(selectedBundle)} is no longer in active tracking. The command response was not verified; check the backend audit log.`
          : `${displayIdentity(selectedBundle)} is no longer in active tracking.`,
      )
    }
  }, [bundles, removalResponseAt, removalStatus, selectedBundle, tracking.lastSuccessfulPollAt, tracking.syncStatus])

  function selectBundle(bundle: TrackedBundleDto) {
    removalSubmitted.current = false
    setSelectedBundle(bundle)
    setOperatorId("")
    setReason("")
    setRemovalStatus("idle")
    setRemovalMessage(null)
    setRemovalResponseAt(null)
  }

  async function handleRemoval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      removalSubmitted.current || !selectedBundle || !selectedStillTracked || !client || !removalAvailable ||
      removalStatus !== "idle" || !operatorId.trim() || !reason.trim()
    ) return

    const trackingId = selectedBundle.TrackingId
    const confirmed = window.confirm(
      `Remove bundle ${displayIdentity(selectedStillTracked)} from active tracking?\n\n` +
      `TrackingId: ${trackingId}\nCurrent zone: ${selectedStillTracked.CurrentZone ?? "Unknown"}\n\n` +
      "Tracking will clear this bundle's occupied positions, including PLC occupancy. " +
      "This does not remove any other bundle. Continue?",
    )
    if (!confirmed) return

    // Native confirmation can pause polling long enough for its snapshot to expire.
    const latest = latestRemovalState.current
    const receivedAt = latest.tracking.lastSuccessfulPollAt?.getTime()
    const snapshotAge = receivedAt === undefined ? Infinity : Date.now() - receivedAt
    if (removalSubmitted.current) return
    if (
      latest.selectedTrackingId !== trackingId ||
      latest.tracking.syncStatus !== "live" ||
      !latest.tracking.capabilities?.commands.some((command) => command.includes("/api/tracking/correct")) ||
      !latest.tracking.trackingState?.Bundles.some((bundle) => bundle.TrackingId === trackingId) ||
      !Number.isFinite(snapshotAge) || snapshotAge < 0 || snapshotAge >= config.staleMs
    ) {
      setRemovalMessage(
        "Tracking changed or became stale while confirming. No removal request was sent. " +
        "Refreshing tracking; review the selected bundle and confirm again.",
      )
      onRefresh()
      return
    }

    removalSubmitted.current = true
    setRemovalStatus("sending")
    setRemovalMessage("Sending removal request...")
    try {
      const acknowledgement = await client.removeBundle({
        TrackingId: trackingId,
        Operation: "REMOVE",
        OperatorId: operatorId.trim(),
        Reason: reason.trim(),
      })
      if (!acknowledgement.accepted || acknowledgement.trackingId !== trackingId) {
        throw new Error("Tracking did not acknowledge removal of the selected TrackingId.")
      }
      setRemovalResponseAt(Date.now())
      setRemovalStatus("pending")
      setRemovalMessage(
        `Request accepted (event ${acknowledgement.eventId}). Waiting for a fresh state showing this bundle absent. Do not submit it again.`,
      )
      onRefresh()
    } catch (error) {
      const mayHaveBeenAccepted = removalMayHaveBeenAccepted(error)
      setRemovalResponseAt(Date.now())
      setRemovalStatus(mayHaveBeenAccepted ? "uncertain" : "error")
      setRemovalMessage(
        `${describeRemovalError(error)} ${mayHaveBeenAccepted
          ? "Do not submit it again until the backend audit/state is checked."
          : "Check the current state before trying again."}`,
      )
      onRefresh()
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-full w-full justify-between gap-3 bg-card px-4 py-2 text-left lg:min-w-56"
        onClick={() => setOpen(true)}
        aria-label={`View tracked bundles${bundles ? `, ${bundles.length} active` : ""}`}
      >
        <span className="flex items-center gap-2">
          <Boxes className="size-4 text-muted-foreground" aria-hidden />
          <span>Tracked bundles</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="tabular rounded-md bg-muted px-2 py-0.5 text-sm font-semibold text-foreground">
            {bundles?.length ?? "—"}
          </span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-5 py-4 pr-12 text-left">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Boxes className="size-5 text-muted-foreground" aria-hidden />
              Tracked bundles
              <span className="tabular rounded-md bg-muted px-2 py-0.5 text-sm font-semibold">
                {bundles?.length ?? "—"}
              </span>
            </SheetTitle>
            <SheetDescription>
              Current bundles from the Tracking state snapshot. Manual removal changes L2 and PLC occupancy.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">

      {selectedBundle && (
        <form onSubmit={handleRemoval} className="mb-4 space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-destructive">Remove from Tracking</h3>
              <p className="text-xs text-muted-foreground">
                {displayIdentity(selectedBundle)} · {selectedBundle.CurrentZone ?? "Unknown zone"}
              </p>
              <p className="break-all font-mono text-xs text-foreground">TrackingId: {selectedBundle.TrackingId}</p>
            </div>
            {removalStatus !== "sending" && removalStatus !== "pending" && removalStatus !== "uncertain" && (
              <Button type="button" variant="ghost" size="xs" onClick={() => setSelectedBundle(null)}>
                Cancel
              </Button>
            )}
          </div>
          <p className="text-xs text-destructive">
            This affects the selected bundle only and clears its tracking/PLC occupancy. It is not a global reset.
          </p>
          {removalStatus === "idle" && (
            <>
              <label className="block text-xs font-medium text-foreground" htmlFor="removal-operator-id">
                Operator ID
              </label>
              <Input
                id="removal-operator-id"
                value={operatorId}
                onChange={(event) => setOperatorId(event.target.value)}
                autoComplete="off"
                required
                disabled={!removalAvailable}
              />
              <p className="text-xs text-muted-foreground">
                Enter your real operator ID. This field is not an authentication check.
              </p>
              <label className="block text-xs font-medium text-foreground" htmlFor="removal-reason">
                Reason for removal
              </label>
              <textarea
                id="removal-reason"
                className="min-h-20 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                disabled={!removalAvailable}
              />
              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                disabled={!removalAvailable || !selectedStillTracked || !operatorId.trim() || !reason.trim()}
              >
                <Trash2 aria-hidden /> Remove selected bundle
              </Button>
              {!removalAvailable && (
                <p className="text-xs text-muted-foreground">
                  Removal is available only with a live Tracking connection that advertises the correction command.
                </p>
              )}
              {!selectedStillTracked && (
                <p className="text-xs text-muted-foreground">This bundle is no longer in the current snapshot.</p>
              )}
            </>
          )}
          {removalMessage && (
            <p className="text-xs text-foreground" role={removalStatus === "error" ? "alert" : "status"}>
              {removalMessage}
            </p>
          )}
        </form>
      )}

      {!bundles ? (
        <p className="text-sm text-muted-foreground">Waiting for the first valid state snapshot.</p>
      ) : bundles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bundles are currently tracked.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {bundles.map((bundle, index) => {
            return (
              <li key={`${bundle.TrackingId}-${index}`}>
                <div className="w-full rounded-lg border border-border px-3 py-2.5 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="min-w-0 truncate text-sm font-semibold text-foreground"
                      title={bundle.TrackingId}
                    >
                      {displayIdentity(bundle)}
                    </span>
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        bundle.CurrentZone && isTrackingZoneName(bundle.CurrentZone)
                          ? "text-muted-foreground"
                          : "text-warning-fg"
                      }`}
                    >
                      {bundle.CurrentZone ?? "Unknown zone"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{bundle.Status ?? "Unknown status"}</span>
                    <span aria-hidden>·</span>
                    <span>{bundle.CorrelationStatus ?? "Unknown correlation"}</span>
                  </div>
                  {bundle.MillOrder1 && (
                    <p className="mt-1 truncate text-xs font-medium text-primary">
                      MO {bundle.MillOrder1}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="xs"
                    className="mt-2"
                    onClick={() => selectBundle(bundle)}
                    disabled={
                      !removalAvailable || removalStatus === "sending" ||
                      removalStatus === "pending" || removalStatus === "uncertain"
                    }
                    aria-label={`Remove ${displayIdentity(bundle)} from Tracking`}
                  >
                    Remove from Tracking
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Removal uses TrackingId, not the displayed bundle number or zone. Operator ID and reason are sent to Tracking for audit.
          </p>
        </SheetContent>
      </Sheet>
    </>
  )
}
