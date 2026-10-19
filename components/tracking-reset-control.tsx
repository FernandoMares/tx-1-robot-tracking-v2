"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { RotateCcw, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { TrackingCommandGate } from "@/hooks/use-tracking-command-gate"
import {
  ApiError,
  createTrackingApiClient,
  type TrackingApiConfig,
  type TrackingRuntimeState,
  type TrackingStateDto,
} from "@/lib/tracking-api"
import { getActiveBundles } from "@/lib/tracking-api/bundle-lifecycle"
import { resetOutcomeObserved, resetPreflightProblem, supportsTrackingReset } from "@/lib/tracking-api/tracking-reset"

interface TrackingResetControlProps {
  tracking: TrackingRuntimeState
  config: TrackingApiConfig
  onRefresh: () => void
  commandGate: TrackingCommandGate
}

type ResetStatus = "idle" | "checking" | "sending" | "pending" | "uncertain" | "success" | "error"
const VERIFICATION_WINDOW_MS = 60_000

function describeResetError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === "http") {
      const detail = error.body && typeof error.body === "object" && "error" in error.body ? error.body.error : null
      return typeof detail === "string" ? `HTTP ${error.status}: ${detail}` : `HTTP ${error.status}.`
    }
    if (error.kind === "timeout") return "The request timed out."
    return "The API response could not be verified."
  }
  return error instanceof Error ? error.message : "The request could not be verified."
}

function resetMayHaveBeenAccepted(error: unknown): boolean {
  return !(error instanceof ApiError) || error.kind !== "http" || error.status === 408 || (error.status ?? 500) >= 500
}

/** Owns its pending state outside the sheet; closing it never unlocks a dispatched reset. */
export function TrackingResetControl({ tracking, config, onRefresh, commandGate }: TrackingResetControlProps) {
  const [open, setOpen] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [status, setStatus] = useState<ResetStatus>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  const [verificationPaused, setVerificationPaused] = useState(false)
  const [verificationRevision, setVerificationRevision] = useState(0)
  const [baseline, setBaseline] = useState<TrackingStateDto | null>(null)
  const locked = useRef(false)
  const mounted = useRef(true)
  const { owner, tryAcquire, release } = commandGate
  const client = useMemo(() => config.mode === "live" && config.baseUrl
    ? createTrackingApiClient({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs }) : null,
  [config.baseUrl, config.mode, config.timeoutMs])
  const activeCount = tracking.trackingState ? getActiveBundles(tracking.trackingState.Bundles).length : 0
  const busy = ["checking", "sending", "pending", "uncertain"].includes(status)
  const commandAvailable = !!client && tracking.syncStatus === "live" && tracking.service?.running === true &&
    !!tracking.trackingState && supportsTrackingReset(tracking.capabilities)
  const unavailableMessage = owner === "manual"
    ? "A manual bundle action is unresolved. Reset is locked until its result is confirmed."
    : "Reset requires live tracking and an advertised POST /api/tracking/reset capability."

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if ((status !== "pending" && status !== "uncertain") || !client || !baseline) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const deadline = Date.now() + VERIFICATION_WINDOW_MS
    const initialActiveCount = getActiveBundles(baseline.Bundles).length
    setVerificationPaused(false)
    setVerificationMessage("Checking subsequent tracking snapshots...")

    // These reads begin after the POST response/error. An older dashboard poll
    // finishing late must never be used as evidence of the reset outcome.
    async function verify() {
      try {
        const state = await client!.getState(controller.signal)
        if (cancelled) return
        if (state.ScenarioName !== baseline!.ScenarioName) {
          throw new Error("The tracking scenario changed; check the backend event/audit log.")
        }
        if (resetOutcomeObserved(baseline!, state)) {
          setStatus("success")
          setMessage("A subsequent API snapshot reports no active bundles and no occupied positions in retained removed records. " +
            "This observes tracking state; it does not independently verify the reset event, PLC state or physical equipment." +
            (status === "uncertain" ? " The command response was not verified; check the backend audit log." : ""))
          setVerificationMessage(null)
          locked.current = false
          release("reset")
          onRefresh()
          return
        }
        setVerificationMessage(initialActiveCount === 0
          ? "Tracking was already empty before this request. An empty snapshot cannot prove reset processing; confirm the event in the backend audit log. Do not resend."
          : "A fully cleared tracking state has not been observed. New incoming bundles can also prevent this check from confirming the reset. Do not resend; check the backend event/audit log.")
      } catch (error) {
        if (cancelled) return
        setVerificationMessage(`${describeResetError(error)} The result remains unconfirmed. Do not resend the reset.`)
      }
      if (Date.now() >= deadline) {
        setVerificationPaused(true)
        setVerificationMessage((initialActiveCount === 0
          ? "Tracking was already empty; only backend audit review can establish whether this reset was processed. "
          : "A cleared state was not confirmed within one minute. Check the backend event/audit log. ") +
          "You may check state again without resending. The command lock remains active.")
      } else {
        timer = setTimeout(() => { void verify() }, 2000)
      }
    }
    void verify()
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [baseline, client, onRefresh, release, status, verificationRevision])

  function openControl() {
    if (!busy && !locked.current) {
      setStatus("idle")
      setMessage(null)
      setVerificationMessage(null)
      setAuthorized(false)
    }
    setOpen(true)
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current || busy || !commandAvailable || !client || !tracking.trackingState ||
      !authorized || !tryAcquire("reset")) return

    const displayedState = tracking.trackingState
    locked.current = true
    const confirmed = window.confirm(
      `RESET ALL TRACKING for scenario ${displayedState.ScenarioName}?\n\n` +
      `Active bundles in the displayed snapshot: ${getActiveBundles(displayedState.Bundles).length}.\n\n` +
      "This is a global maintenance operation, not removal of one selected bundle. " +
      "It can clear tracking and occupancy used by automation. There is no undo in this HMI. " +
      "It does not restart the service and is not a physical equipment movement command.\n\n" +
      "Proceed only with Operations authorization and the line in the approved maintenance condition. Send reset now?",
    )
    if (!confirmed) { locked.current = false; release("reset"); return }

    setStatus("checking")
    setMessage("Checking fresh service status, reset capability and the scope of active bundles...")
    setVerificationMessage(null)
    let dispatched = false
    try {
      const [service, capabilities] = await Promise.all([client.getStatus(), client.getCapabilities()])
      if (!mounted.current) return
      const state = await client.getState()
      if (!mounted.current) return
      const problem = resetPreflightProblem({ displayedState, service, capabilities, state })
      if (problem) throw new Error(problem)
      setBaseline(state)
      setStatus("sending")
      setMessage("Sending global reset request once...")
      dispatched = true
      const result = await client.resetTracking()
      if (!mounted.current) return
      if (!result.accepted) throw new Error("The response did not confirm reset acceptance.")
      setStatus("pending")
      setMessage(`Reset request accepted (event ${result.eventId}). Acceptance is not completion. ` +
        "Waiting for a subsequent tracking snapshot; do not submit again.")
      onRefresh()
    } catch (error) {
      if (!mounted.current) return
      if (dispatched && resetMayHaveBeenAccepted(error)) {
        setStatus("uncertain")
        setMessage(`${describeResetError(error)} The reset may already have been accepted. Do not resend. ` +
          "Checking state; verify the outcome with the backend event/audit log.")
      } else {
        setStatus("error")
        setMessage(`${describeResetError(error)} ` + (dispatched ? "The reset request was rejected." : "No reset request was sent."))
        locked.current = false
        release("reset")
        onRefresh()
      }
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="destructive" onClick={openControl}
        disabled={!busy && (!commandAvailable || owner === "manual")}
        title={busy ? "View the unresolved reset request" : !commandAvailable || owner === "manual" ? unavailableMessage : "Global tracking maintenance operation"}>
        <RotateCcw className="size-3.5" />
        {busy ? "Reset pending" : "Reset tracking"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b pr-10">
            <SheetTitle className="flex items-center gap-2"><TriangleAlert className="size-4 text-destructive" />Reset all tracking</SheetTitle>
            <SheetDescription>Global maintenance operation. This is not a service restart or a machine-motion command.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <p className="font-semibold text-destructive">Affects the entire tracking scenario, not one bundle.</p>
              <p>Tracking and occupancy used by automation may be cleared. There is no undo in this HMI. Coordinate with Operations and use only in an approved maintenance condition.</p>
              <p>Scenario: <strong>{baseline && busy ? baseline.ScenarioName : tracking.trackingState?.ScenarioName ?? "Unavailable"}</strong></p>
              <p>{busy ? "Active bundles before request" : "Active bundles in current snapshot"}: <strong>{baseline && busy ? getActiveBundles(baseline.Bundles).length : activeCount}</strong></p>
            </div>
            {!busy && status !== "success" && (
              <form onSubmit={handleReset} className="space-y-4">
                <label className="flex items-start gap-2 text-xs">
                  <input id="tracking-reset-authorization" type="checkbox" required checked={authorized} onChange={(event) => setAuthorized(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0" />
                  <span>I have Operations authorization and have verified the approved maintenance condition. This acknowledgment is not authentication or an equipment interlock.</span>
                </label>
                {(!commandAvailable || owner === "manual") && <p className="text-xs text-muted-foreground">{unavailableMessage}</p>}
                <Button type="submit" variant="destructive" className="w-full" disabled={!commandAvailable || owner === "manual" || !authorized}>
                  <RotateCcw className="size-4" />Confirm global reset
                </Button>
              </form>
            )}
            {(message || verificationMessage) && <div role="status" aria-live="polite" className="space-y-2 rounded-lg border p-3 text-xs">
              {message && <p>{message}</p>}
              {verificationMessage && <p className="text-muted-foreground">{verificationMessage}</p>}
              {verificationPaused && <Button type="button" size="xs" variant="outline" onClick={() => {
                setVerificationPaused(false)
                setVerificationRevision((value) => value + 1)
              }}>Check state again (read only)</Button>}
            </div>}
            <p className="text-xs text-muted-foreground">The request sends POST /api/tracking/reset without a body. No operator identity or comments are sent. Closing this panel does not cancel a sent command. The local lock is not a multi-user backend lock; if the page is reloaded, check the audit log before any further reset.</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
