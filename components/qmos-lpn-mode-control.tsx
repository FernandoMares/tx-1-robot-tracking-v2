"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { CheckCircle2, LoaderCircle, RefreshCw, Settings2, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  ApiError,
  createTrackingApiClient,
  parseApiDate,
  type QmosLpnModeDto,
  type TrackingApiConfig,
  type TrackingRuntimeState,
} from "@/lib/tracking-api"

interface QmosLpnModeControlProps {
  tracking: TrackingRuntimeState
  config: TrackingApiConfig
}

type UpdateStatus = "idle" | "saving" | "success" | "error" | "uncertain"
const MODE_REFRESH_MS = 30_000

function describeModeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === "http") {
      if (error.status === 404) return "QMOS LPN mode is not available on this tracking service."
      const detail = error.body && typeof error.body === "object" && "error" in error.body
        ? error.body.error : null
      return typeof detail === "string" && detail.trim()
        ? `HTTP ${error.status}: ${detail}` : `The tracking service returned HTTP ${error.status}.`
    }
    if (error.kind === "timeout") return "The tracking service did not answer in time."
    if (error.kind === "network") return "The tracking service could not be reached."
    return "The tracking service response could not be verified."
  }
  return error instanceof Error ? error.message : "The tracking request could not be verified."
}

function updateDefinitelyRejected(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "http" &&
    error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 408
}

/** Owns the request lock outside the sheet, so closing it cannot send a second PUT. */
export function QmosLpnModeControl({ tracking, config }: QmosLpnModeControlProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<QmosLpnModeDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState("")
  const [operatorId, setOperatorId] = useState("")
  const [reason, setReason] = useState("")
  const [operatorTouched, setOperatorTouched] = useState(false)
  const [reasonTouched, setReasonTouched] = useState(false)
  const [status, setStatus] = useState<UpdateStatus>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [reconciliationRequired, setReconciliationRequired] = useState(false)
  const mounted = useRef(false)
  const locked = useRef(false)
  const readRevision = useRef(0)
  const readController = useRef<AbortController | null>(null)
  const client = useMemo(() => config.mode === "live" && config.baseUrl
    ? createTrackingApiClient({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs }) : null,
  [config.baseUrl, config.mode, config.timeoutMs])

  // Each read owns a revision. A GET started before PUT may never replace the
  // confirmed response or its subsequent reconciliation read.
  const readMode = useCallback(async (afterUpdate = false): Promise<QmosLpnModeDto | null> => {
    if (!client || (locked.current && !afterUpdate)) return null
    readController.current?.abort()
    const revision = ++readRevision.current
    const controller = new AbortController()
    readController.current = controller
    setLoading(true)
    setLoadError(null)
    try {
      const current = await client.getQmosLpnMode(controller.signal)
      if (!mounted.current || revision !== readRevision.current || controller.signal.aborted) return null
      setMode(current)
      return current
    } catch (error) {
      if (!mounted.current || revision !== readRevision.current || controller.signal.aborted) return null
      setMode(null)
      setLoadError(describeModeError(error))
      return null
    } finally {
      if (mounted.current && revision === readRevision.current) setLoading(false)
    }
  }, [client])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      ++readRevision.current
      readController.current?.abort()
    }
  }, [])

  useEffect(() => {
    setMode(null)
    setLoadError(null)
    if (!client || tracking.mode !== "live") return
    void readMode()
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && !locked.current) void readMode()
    }
    const timer = setInterval(refreshWhenVisible, MODE_REFRESH_MS)
    window.addEventListener("focus", refreshWhenVisible)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", refreshWhenVisible)
      ++readRevision.current
      readController.current?.abort()
    }
  }, [client, readMode, tracking.mode])

  const normalizedOperator = operatorId.trim()
  const normalizedReason = reason.trim()
  const operatorProblem = !normalizedOperator ? "Operator ID is required."
    : normalizedOperator.length > 100 ? "Operator ID must not exceed 100 characters." : null
  const reasonProblem = !normalizedReason ? "Reason is required for a global LPN mode change."
    : normalizedReason.length > 500 ? "Reason must not exceed 500 characters." : null
  const modeChanged = !!mode && (selectedMode === "on" || selectedMode === "off") &&
    (selectedMode === "on") !== mode.Enabled
  const saving = status === "saving"
  const canSave = !!client && !!mode && !loading && !loadError && modeChanged &&
    !operatorProblem && !reasonProblem && !saving && !reconciliationRequired &&
    tracking.syncStatus === "live" && tracking.service?.running === true
  const updatedAt = parseApiDate(mode?.UpdatedUtc)
  const label = loading ? "Checking..." : mode ? mode.Enabled ? "ON" : "OFF" : "Unavailable"

  function openControl() {
    if (!locked.current && !saving) {
      setSelectedMode(mode ? mode.Enabled ? "on" : "off" : "")
      setOperatorTouched(false)
      setReasonTouched(false)
      if (status !== "uncertain") {
        setStatus("idle")
        setMessage(null)
      }
      void readMode()
    }
    setOpen(true)
  }

  async function refreshReadOnly() {
    if (saving) return
    const current = await readMode(reconciliationRequired)
    if (current && reconciliationRequired) {
      locked.current = false
      setReconciliationRequired(false)
      setMessage(`The latest read reports QMOS LPN ${current.Enabled ? "ON" : "OFF"}. ` +
        "The earlier update response remains unverified. Review the current mode before submitting another change.")
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setOperatorTouched(true)
    setReasonTouched(true)
    if (!canSave || locked.current || !client) return
    locked.current = true
    ++readRevision.current
    readController.current?.abort()
    setLoading(false)
    setStatus("saving")
    setMessage("Saving the global QMOS LPN mode...")
    const target = selectedMode === "on"
    const request = { Enabled: target, OperatorId: normalizedOperator, Reason: normalizedReason }
    try {
      const result = await client.updateQmosLpnMode(request)
      if (!mounted.current) return
      if (result.updated !== true || result.enabled !== target) {
        throw new Error("The update response did not confirm the selected QMOS LPN mode.")
      }
      // Only a verified 200 response can confirm this change; selection alone cannot.
      setMode({ Enabled: result.enabled, UpdatedUtc: result.updatedUtc,
        OperatorId: request.OperatorId, Reason: request.Reason })
      const current = await readMode(true)
      if (!mounted.current) return
      setStatus("success")
      setMessage(`QMOS LPN ${target ? "ON" : "OFF"} was saved for bundles created afterward by the tracking engine. ` +
        (current && current.Enabled !== target
          ? `A later read now reports ${current.Enabled ? "ON" : "OFF"}; the global selection changed again.`
          : current ? "The current selection was refreshed." : "The follow-up read is unavailable; refresh the current mode before another change."))
      setOperatorId("")
      setReason("")
      setOperatorTouched(false)
      setReasonTouched(false)
      locked.current = false
    } catch (error) {
      if (!mounted.current) return
      if (updateDefinitelyRejected(error)) {
        setStatus("error")
        setMessage(`${describeModeError(error)} The change was rejected.`)
        locked.current = false
        if (error instanceof ApiError && error.status === 404) {
          setMode(null)
          setLoadError(describeModeError(error))
        }
        return
      }
      setStatus("uncertain")
      setReconciliationRequired(true)
      setMessage(`${describeModeError(error)} The change may have been saved. Checking the current mode before any further submission.`)
      const current = await readMode(true)
      if (!mounted.current) return
      if (current) {
        locked.current = false
        setReconciliationRequired(false)
        setMessage(`${describeModeError(error)} The update response remains unverified. ` +
          `A subsequent read reports QMOS LPN ${current.Enabled ? "ON" : "OFF"}. Review this mode before submitting another change.`)
      } else {
        setMessage(`${describeModeError(error)} The result and current mode remain unverified. ` +
          "Use Refresh current mode before any further submission. No update will be resent automatically.")
      }
    }
  }

  if (tracking.mode !== "live") return null

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={openControl}
        aria-label="QMOS LPN mode" className="h-auto min-h-8 shrink-0 gap-2 px-3 py-2">
        <Settings2 className="size-3.5" aria-hidden />
        <span className="text-xs">QMOS LPN <strong>{saving ? "Saving..." : label}</strong></span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b pr-10">
            <SheetTitle>QMOS LPN mode</SheetTitle>
            <SheetDescription>Global policy for LPN generation on newly created bundles.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <section className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs" aria-label="Current QMOS LPN mode">
              <p>Current mode: <strong>{label}</strong></p>
              {updatedAt && mode && <p className="text-muted-foreground">Updated {updatedAt.toLocaleString()}</p>}
              {loadError && <p role="alert" className="text-error-fg">{loadError}</p>}
              <Button type="button" size="xs" variant="outline" disabled={loading || saving}
                onClick={() => { void refreshReadOnly() }}>
                <RefreshCw className={loading ? "size-3 animate-spin" : "size-3"} aria-hidden />Refresh current mode
              </Button>
            </section>
            <div className="space-y-2 text-xs text-muted-foreground" id="qmos-lpn-scope">
              <p>Applies only to bundles created afterward by the tracking engine. Existing bundles keep their original policy, including after a restart.</p>
              <p>ON uses the normal QMOS LPN flow. OFF creates an internal ID without a QMOS LPN or QMOS printing. Tracking, weight and manual movements remain available.</p>
              <p>This selection does not disconnect the QMOS adapter. Existing ON bundles continue their normal cycle.</p>
            </div>
            <form onSubmit={handleUpdate} noValidate className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="qmos-lpn-enabled" className="text-xs font-medium">New bundle LPN mode (required)</label>
                <select id="qmos-lpn-enabled" value={selectedMode} required disabled={saving || reconciliationRequired || !mode}
                  onChange={(event) => setSelectedMode(event.target.value)} aria-describedby="qmos-lpn-scope"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50">
                  <option value="">Select ON or OFF</option>
                  <option value="on">ON — QMOS LPN</option>
                  <option value="off">OFF — Internal ID / no LPN</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="qmos-lpn-operator-id" className="text-xs font-medium">Operator ID (required)</label>
                <Input id="qmos-lpn-operator-id" value={operatorId} required maxLength={100} autoComplete="off"
                  disabled={saving || reconciliationRequired} aria-invalid={operatorTouched && !!operatorProblem}
                  aria-describedby="qmos-lpn-operator-help" onBlur={() => setOperatorTouched(true)}
                  onChange={(event) => setOperatorId(event.target.value)} />
                <p id="qmos-lpn-operator-help" className={operatorTouched && operatorProblem ? "text-xs text-error-fg" : "text-xs text-muted-foreground"}>
                  {operatorTouched && operatorProblem ? operatorProblem : "Enter your operator ID for the change record. Maximum 100 characters."}
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="qmos-lpn-reason" className="text-xs font-medium">Reason (required)</label>
                <textarea id="qmos-lpn-reason" value={reason} required maxLength={500} rows={3}
                  disabled={saving || reconciliationRequired} aria-invalid={reasonTouched && !!reasonProblem}
                  aria-describedby="qmos-lpn-reason-help" onBlur={() => setReasonTouched(true)}
                  onChange={(event) => setReason(event.target.value)}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50" />
                <p id="qmos-lpn-reason-help" className={reasonTouched && reasonProblem ? "text-xs text-error-fg" : "text-xs text-muted-foreground"}>
                  {reasonTouched && reasonProblem ? reasonProblem : "Describe why this global setting is changing. Maximum 500 characters."}
                </p>
              </div>
              {!saving && !reconciliationRequired && tracking.syncStatus !== "live" &&
                <p className="text-xs text-muted-foreground">A live tracking connection is required to save this setting.</p>}
              <Button type="submit" className="w-full" disabled={!canSave}>
                {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Settings2 className="size-4" aria-hidden />}
                {saving ? "Saving QMOS LPN mode..." : "Save QMOS LPN mode"}
              </Button>
            </form>
            {message && <div role="status" aria-live="polite" className={status === "error" || status === "uncertain"
              ? "flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs"
              : "flex items-start gap-2 rounded-lg border p-3 text-xs"}>
              {status === "success" && <CheckCircle2 className="size-4 shrink-0 text-active" aria-hidden />}
              {(status === "error" || status === "uncertain") && <TriangleAlert className="size-4 shrink-0 text-warning-fg" aria-hidden />}
              <p>{message}</p>
            </div>}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
