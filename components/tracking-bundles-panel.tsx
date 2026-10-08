"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { ArrowRightLeft, Boxes, ChevronRight, Trash2 } from "lucide-react"

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
import {
  getRepositionZones,
  manualOutcomeObserved,
  manualPreflightProblem,
  reportedZoneOccupants,
  supportsManualCorrection,
  type ManualTrackingAction,
} from "@/lib/tracking-api/manual-position"
import { isTrackingZoneName } from "@/lib/tracking-zone-layout"

interface TrackingBundlesPanelProps {
  tracking: TrackingRuntimeState
  config: TrackingApiConfig
  onRefresh: () => void
}

type CommandStatus = "idle" | "checking" | "sending" | "pending" | "uncertain" | "success" | "error"
const VERIFICATION_WINDOW_MS = 60_000

function displayIdentity(bundle: TrackedBundleDto) {
  return bundle.BundleId ?? (bundle.L2Id != null ? String(bundle.L2Id) : bundle.TrackingId)
}

function describeCommandError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === "http") {
      const detail = error.body && typeof error.body === "object" && "error" in error.body
        ? error.body.error : null
      return typeof detail === "string" ? `HTTP ${error.status}: ${detail}` : `HTTP ${error.status}.`
    }
    if (error.kind === "timeout") return "The request timed out."
    return "The API response could not be verified."
  }
  return error instanceof Error ? error.message : "The request could not be verified."
}

function commandMayHaveBeenAccepted(error: unknown): boolean {
  return !(error instanceof ApiError) || error.kind !== "http" ||
    error.status === 408 || (error.status ?? 500) >= 500
}

/** One command lock shared by removal and reposition; closing the sheet does not reset it. */
export function TrackingBundlesPanel({ tracking, config, onRefresh }: TrackingBundlesPanelProps) {
  const bundles = tracking.trackingState?.Bundles
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedBundle, setSelectedBundle] = useState<TrackedBundleDto | null>(null)
  const [action, setAction] = useState<ManualTrackingAction>("remove")
  const [destination, setDestination] = useState("")
  const [operatorId, setOperatorId] = useState("")
  const [reason, setReason] = useState("")
  const [commandStatus, setCommandStatus] = useState<CommandStatus>("idle")
  const [commandMessage, setCommandMessage] = useState<string | null>(null)
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  const [verificationPaused, setVerificationPaused] = useState(false)
  const [verificationRevision, setVerificationRevision] = useState(0)
  const commandLocked = useRef(false)
  const mounted = useRef(true)
  const client = useMemo(
    () => config.mode === "live" && config.baseUrl
      ? createTrackingApiClient({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs }) : null,
    [config.baseUrl, config.mode, config.timeoutMs],
  )
  const selectedStillTracked = selectedBundle
    ? bundles?.find((bundle) => bundle.TrackingId === selectedBundle.TrackingId &&
      bundle.ScenarioName === selectedBundle.ScenarioName) : null
  const currentSelection = selectedStillTracked ?? selectedBundle
  const commandAvailable = tracking.syncStatus === "live" && supportsManualCorrection(tracking.capabilities)
  const zones = useMemo(() => getRepositionZones(tracking.topology), [tracking.topology])
  const selectedZone = zones.find((zone) => zone.ZoneName === destination) ?? null
  const reportedOccupants = reportedZoneOccupants(tracking.trackingState, destination)
  const busy = ["checking", "sending", "pending", "uncertain"].includes(commandStatus)
  const isReposition = action === "reposition"
  const fieldPrefix = isReposition ? "reposition" : "removal"
  const visibleBundles = useMemo(() => {
    const query = search.trim().toLowerCase()
    return bundles?.filter((bundle) => !query ||
      [displayIdentity(bundle), bundle.TrackingId, bundle.CurrentZone ?? ""].some((value) => value.toLowerCase().includes(query)),
    )
  }, [bundles, search])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if ((commandStatus !== "pending" && commandStatus !== "uncertain") || !client || !selectedBundle) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const deadline = Date.now() + VERIFICATION_WINDOW_MS
    setVerificationPaused(false)
    setVerificationMessage("Checking subsequent tracking snapshots...")

    // These GETs start AFTER the command response. A pre-command poll that
    // finishes late must not be mistaken for confirmation of the outcome.
    async function verify() {
      try {
        const state = await client!.getState(controller.signal)
        if (cancelled) return
        if (state.ScenarioName !== selectedBundle!.ScenarioName) {
          throw new Error("The tracking scenario changed; verify the command in the backend audit log.")
        }
        if (manualOutcomeObserved(action, selectedBundle!.TrackingId, destination, state)) {
          setCommandStatus("success")
          setVerificationMessage(null)
          setCommandMessage(
            (action === "remove"
              ? `${displayIdentity(selectedBundle!)} is no longer in active tracking.`
              : `${displayIdentity(selectedBundle!)} is now reported at ${destination}.`) +
            (commandStatus === "uncertain" ? " The command response was not verified; check the backend audit log." : "") +
            (action === "reposition" ? " This confirms the reported position, not physical equipment motion." : ""),
          )
          commandLocked.current = false
          onRefresh()
          return
        }
        setVerificationMessage("The requested result is not yet visible in the latest state. Do not resend the command.")
      } catch (error) {
        if (cancelled) return
        setVerificationMessage(`${describeCommandError(error)} The result remains unconfirmed; do not resend the command.`)
      }
      if (Date.now() >= deadline) {
        setVerificationPaused(true)
        setVerificationMessage("Not confirmed after one minute. Check the backend event/audit log. You may check state again without resending the command.")
      } else {
        timer = setTimeout(() => { void verify() }, 2000)
      }
    }
    void verify()
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [action, client, commandStatus, destination, onRefresh, selectedBundle, verificationRevision])

  function selectBundle(bundle: TrackedBundleDto, nextAction: ManualTrackingAction) {
    if (commandLocked.current || busy) return
    setSelectedBundle(bundle)
    setAction(nextAction)
    setDestination("")
    setOperatorId("")
    setReason("")
    setCommandStatus("idle")
    setCommandMessage(null)
    setVerificationMessage(null)
    setVerificationPaused(false)
  }

  async function handleCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      commandLocked.current || !selectedStillTracked || !tracking.trackingState || !client || !commandAvailable ||
      commandStatus !== "idle" || !operatorId.trim() || !reason.trim() ||
      (isReposition && (!selectedZone || destination === selectedStillTracked.CurrentZone))
    ) return

    const selected = selectedStillTracked
    const displayedState = tracking.trackingState
    const trackingId = selected.TrackingId
    const targetZone = selectedZone
    commandLocked.current = true
    const confirmed = window.confirm(
      (isReposition ? `Reposition bundle ${displayIdentity(selected)} in tracking?` : `Remove bundle ${displayIdentity(selected)} from active tracking?`) +
      `\n\nTrackingId: ${trackingId}\nCurrent zone: ${selected.CurrentZone ?? "Unknown"}\n` +
      (isReposition
        ? `New zone: ${destination}\nReported occupants in destination: ${reportedOccupants.length}\n\n` +
          "Confirm this matches the physical position. This corrects L2 tracking and may affect automation; it is not an equipment motion command. " +
          "Zone capacity, route restrictions and HEAD/TAIL handling belong to the backend. Continue?"
        : "\nTracking will clear this bundle's occupied positions, including PLC occupancy. " +
          "This does not remove any other bundle. Continue?"),
    )
    if (!confirmed) { commandLocked.current = false; return }

    setCommandStatus("checking")
    setCommandMessage("Checking fresh tracking state and configuration before sending...")
    setVerificationMessage(null)
    let commandDispatched = false
    try {
      // Native confirm pauses polling. Always re-read after OK rather than
      // requiring the operator to accept a destructive dialog in a few seconds.
      const [service, capabilities, map] = await Promise.all([
        client.getStatus(), client.getCapabilities(), client.getMap(),
      ])
      if (!mounted.current) return
      // Read position last so slow metadata cannot age the position check.
      const state = await client.getState()
      if (!mounted.current) return
      const problem = manualPreflightProblem({
        action, selected, displayedState, destination: targetZone, service, capabilities, map, state,
      })
      if (problem) throw new Error(problem)

      setCommandStatus("sending")
      setCommandMessage(isReposition ? "Sending reposition request..." : "Sending removal request...")
      commandDispatched = true
      const identity = { TrackingId: trackingId, OperatorId: operatorId.trim(), Reason: reason.trim() }
      const acknowledgement = isReposition
        ? await client.repositionBundle({ ...identity, CurrentZone: destination })
        : await client.removeBundle({ ...identity, Operation: "REMOVE" })
      if (!mounted.current) return
      if (!acknowledgement.accepted || acknowledgement.trackingId !== trackingId) {
        throw new Error("Tracking did not acknowledge the command for the selected TrackingId.")
      }
      setCommandStatus("pending")
      setCommandMessage(`Request accepted (event ${acknowledgement.eventId}). Acceptance is not completion; waiting for the resulting state. Do not submit it again.`)
      onRefresh()
    } catch (error) {
      if (!mounted.current) return
      if (!commandDispatched) {
        commandLocked.current = false
        setCommandStatus("idle")
        setCommandMessage(`${describeCommandError(error)} No command was sent. Refreshing tracking; review and confirm again.`)
      } else {
        const uncertain = commandMayHaveBeenAccepted(error)
        commandLocked.current = uncertain
        setCommandStatus(uncertain ? "uncertain" : "error")
        setCommandMessage(`${describeCommandError(error)} ${uncertain
          ? "It may have been accepted. Do not resend until the backend audit/state is checked."
          : "Check the current state before selecting an action again."}`)
      }
      onRefresh()
    }
  }

  return (
    <>
      <Button type="button" variant="outline"
        className="h-full w-full justify-between gap-3 bg-card px-4 py-2 text-left lg:min-w-56"
        onClick={() => setOpen(true)} aria-label={`View tracked bundles${bundles ? `, ${bundles.length} active` : ""}`}>
        <span className="flex items-center gap-2"><Boxes className="size-4 text-muted-foreground" aria-hidden /><span>Tracked bundles</span></span>
        <span className="flex items-center gap-2">
          <span className="tabular rounded-md bg-muted px-2 py-0.5 text-sm font-semibold text-foreground">{bundles?.length ?? "—"}</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-5 py-4 pr-12 text-left">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Boxes className="size-5 text-muted-foreground" aria-hidden />Tracked bundles
              <span className="tabular rounded-md bg-muted px-2 py-0.5 text-sm font-semibold">{bundles?.length ?? "—"}</span>
            </SheetTitle>
            <SheetDescription>Current Tracking snapshot. Manual actions change L2 tracking; they are not physical equipment controls.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {selectedBundle && (
              <form onSubmit={handleCommand}
                className={`mb-4 space-y-3 rounded-lg border p-3 ${isReposition ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className={`text-sm font-semibold ${isReposition ? "text-primary" : "text-destructive"}`}>
                      {isReposition ? "Reposition in Tracking" : "Remove from Tracking"}
                    </h3>
                    <p className="text-xs text-muted-foreground">{displayIdentity(selectedBundle)} · {currentSelection?.CurrentZone ?? "Unknown zone"}</p>
                    <p className="break-all font-mono text-xs text-foreground">TrackingId: {selectedBundle.TrackingId}</p>
                  </div>
                  {!busy && <Button type="button" variant="ghost" size="xs" onClick={() => { if (!commandLocked.current) setSelectedBundle(null) }}>Close</Button>}
                </div>
                <p className={`text-xs ${isReposition ? "text-foreground" : "text-destructive"}`}>
                  {isReposition
                    ? "Correct this bundle's recorded position. Verify its physical position first. This is not a motion command, but tracking changes may affect automation."
                    : "This affects the selected bundle only and clears its tracking/PLC occupancy. It is not a global reset."}
                </p>
                {commandStatus === "idle" && (
                  <>
                    {isReposition && (
                      <>
                        <label className="block text-xs font-medium" htmlFor="reposition-zone">Destination position (CurrentZone)</label>
                        <select id="reposition-zone" value={destination} required disabled={!commandAvailable}
                          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                          onChange={(event) => setDestination(event.target.value)}>
                          <option value="">Select a position</option>
                          {zones.map((zone) => (
                            <option key={zone.ZoneName} value={zone.ZoneName} disabled={zone.ZoneName === selectedStillTracked?.CurrentZone}>
                              {zone.ZoneName}{zone.ZoneName === selectedStillTracked?.CurrentZone ? " (current)" : ""}
                            </option>
                          ))}
                        </select>
                        {selectedZone && (
                          <p className="text-xs text-muted-foreground">
                            Reported occupants: {reportedOccupants.length}. Configured capacity: {selectedZone.Capacity ?? "not provided"}.
                            {reportedOccupants.length > 0 && " Destination has reported occupancy; verify before confirming."}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Positions come from the enabled API map, not QMOS Destination. Route, capacity and HEAD/TAIL rules must be validated by the backend.
                          {zones.length === 0 && " No enabled positions are available."}
                        </p>
                      </>
                    )}
                    <label className="block text-xs font-medium" htmlFor={`${fieldPrefix}-operator-id`}>Operator ID</label>
                    <Input id={`${fieldPrefix}-operator-id`} value={operatorId} onChange={(event) => setOperatorId(event.target.value)}
                      autoComplete="off" required disabled={!commandAvailable} />
                    <p className="text-xs text-muted-foreground">Enter your real operator ID. This field is not an authentication check.</p>
                    <label className="block text-xs font-medium" htmlFor={`${fieldPrefix}-reason`}>{isReposition ? "Reason for reposition" : "Reason for removal"}</label>
                    <textarea id={`${fieldPrefix}-reason`}
                      className="min-h-20 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={reason} onChange={(event) => setReason(event.target.value)} required disabled={!commandAvailable} />
                    <Button type="submit" variant={isReposition ? "default" : "destructive"} className="w-full"
                      disabled={!commandAvailable || !selectedStillTracked || !operatorId.trim() || !reason.trim() ||
                        (isReposition && (!selectedZone || destination === selectedStillTracked.CurrentZone))}>
                      {isReposition ? <ArrowRightLeft aria-hidden /> : <Trash2 aria-hidden />}
                      {isReposition ? "Reposition selected bundle" : "Remove selected bundle"}
                    </Button>
                    {!commandAvailable && <p className="text-xs text-muted-foreground">Manual actions require a live Tracking connection that advertises the correction command.</p>}
                    {!selectedStillTracked && <p className="text-xs text-muted-foreground">This bundle is no longer in the current snapshot.</p>}
                  </>
                )}
                {commandMessage && <p className="text-xs text-foreground" role={commandStatus === "error" ? "alert" : "status"}>{commandMessage}</p>}
                {verificationMessage && <p className="text-xs text-muted-foreground" role="status">{verificationMessage}</p>}
                {(commandStatus === "pending" || commandStatus === "uncertain") && verificationPaused && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setVerificationRevision((revision) => revision + 1)}>
                    Check state again (read only)
                  </Button>
                )}
              </form>
            )}
            <label className="mb-1 block text-xs font-medium" htmlFor="bundle-search">Find bundle / TrackingId / zone</label>
            <Input id="bundle-search" className="mb-3" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search current bundles" />
            {!bundles ? (
              <p className="text-sm text-muted-foreground">Waiting for the first valid state snapshot.</p>
            ) : bundles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bundles are currently tracked.</p>
            ) : visibleBundles?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bundles match the search.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {visibleBundles?.map((bundle, index) => (
                  <li key={`${bundle.TrackingId}-${index}`}>
                    <div className="w-full rounded-lg border border-border px-3 py-2.5 text-left">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground" title={bundle.TrackingId}>{displayIdentity(bundle)}</span>
                        <span className={`shrink-0 text-xs font-medium ${bundle.CurrentZone && isTrackingZoneName(bundle.CurrentZone) ? "text-muted-foreground" : "text-warning-fg"}`}>
                          {bundle.CurrentZone ?? "Unknown zone"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{bundle.Status ?? "Unknown status"}</span><span aria-hidden>·</span><span>{bundle.CorrelationStatus ?? "Unknown correlation"}</span>
                      </div>
                      {bundle.MillOrder1 && <p className="mt-1 truncate text-xs font-medium text-primary">MO {bundle.MillOrder1}</p>}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="xs" onClick={() => selectBundle(bundle, "reposition")}
                          disabled={!commandAvailable || busy || zones.length === 0} aria-label={`Reposition ${displayIdentity(bundle)} in Tracking`}>
                          <ArrowRightLeft aria-hidden /> Reposition
                        </Button>
                        <Button type="button" variant="destructive" size="xs" onClick={() => selectBundle(bundle, "remove")}
                          disabled={!commandAvailable || busy} aria-label={`Remove ${displayIdentity(bundle)} from Tracking`}>Remove from Tracking</Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Actions use TrackingId, not the displayed number or zone. Operator ID and reason are sent for audit. An accepted request is not proof of completion.
          </p>
        </SheetContent>
      </Sheet>
    </>
  )
}
