"use client"

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ApiError,
  createTrackingApiClient,
  type QmosMillOrderDto,
  type TrackingApiConfig,
  type TrackingRuntimeState,
} from "@/lib/tracking-api"

interface MillOrderSelectionPanelProps {
  tracking: TrackingRuntimeState
  config: TrackingApiConfig
  selectedTrackingId: string | null
  onBusyChange: (busy: boolean) => void
}

type LoadStatus = "idle" | "loading" | "ready" | "error"
type SubmitStatus = "idle" | "submitting" | "verifying" | "success" | "error"

interface SubmissionState {
  status: SubmitStatus
  message: string | null
  trackingId: string | null
  millOrder: string | null
  eventId: number | null
  startedAt: number | null
}

const INITIAL_SUBMISSION: SubmissionState = {
  status: "idle",
  message: null,
  trackingId: null,
  millOrder: null,
  eventId: null,
  startedAt: null,
}

function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === "http") {
      if (error.body && typeof error.body === "object" && "error" in error.body) {
        const detail = error.body.error
        if (typeof detail === "string" && detail.trim()) return detail
      }
      return `The tracking service returned HTTP ${error.status ?? "error"}.`
    }
    if (error.kind === "timeout") return "The tracking service did not answer in time."
    if (error.kind === "invalid-json") {
      return "The tracking service returned a successful response that was not valid JSON."
    }
    if (error.kind === "invalid-payload") {
      return "The tracking service returned an unexpected response format."
    }
    if (error.kind === "aborted") return "The tracking request was cancelled."
    if (error.kind === "network") return "The tracking service could not be reached."
  }

  return error instanceof Error ? error.message : "Unexpected tracking API error."
}

function orderLabel(order: QmosMillOrderDto): string {
  return `${order.MillOrder} · ${order.Size} · ${order.Length}`
}

export function MillOrderSelectionPanel({
  tracking,
  config,
  selectedTrackingId,
  onBusyChange,
}: MillOrderSelectionPanelProps) {
  const [orders, setOrders] = useState<QmosMillOrderDto[]>([])
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const [selectedMillOrder, setSelectedMillOrder] = useState("")
  const [operatorId, setOperatorId] = useState("")
  const [submission, setSubmission] = useState<SubmissionState>(INITIAL_SUBMISSION)

  const client = useMemo(
    () =>
      config.baseUrl
        ? createTrackingApiClient({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs })
        : null,
    [config.baseUrl, config.timeoutMs],
  )

  const selectedBundle = useMemo(
    () =>
      tracking.trackingState?.Bundles.find(
        (bundle) => bundle.TrackingId === selectedTrackingId,
      ) ?? null,
    [selectedTrackingId, tracking.trackingState],
  )

  const submittedBundle = useMemo(
    () =>
      tracking.trackingState?.Bundles.find(
        (bundle) => bundle.TrackingId === submission.trackingId,
      ) ?? null,
    [submission.trackingId, tracking.trackingState],
  )

  const canReadOrders =
    tracking.capabilities?.reads.includes("/api/qmos/mill-orders") ?? false
  const canCorrectBundle =
    tracking.capabilities?.commands.includes("/api/tracking/correct") ?? false

  const loadOrders = useCallback(() => {
    setRefreshRevision((revision) => revision + 1)
  }, [])

  useEffect(() => {
    if (!client || tracking.mode !== "live" || !canReadOrders) {
      setOrders([])
      setLoadStatus("idle")
      setLoadError(null)
      return
    }

    const controller = new AbortController()
    setLoadStatus("loading")
    setLoadError(null)

    void client
      .getQmosMillOrders(20, controller.signal)
      .then((response) => {
        setOrders(response.value)
        setLoadStatus("ready")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setOrders([])
        setLoadStatus("error")
        setLoadError(describeApiError(error))
      })

    return () => controller.abort()
  }, [canReadOrders, client, refreshRevision, tracking.mode])

  useEffect(() => {
    setSelectedMillOrder(selectedBundle?.MillOrder1 ?? "")
    setSubmission(INITIAL_SUBMISSION)
  }, [selectedBundle?.TrackingId])

  useEffect(() => {
    setSelectedMillOrder(selectedBundle?.MillOrder1 ?? "")
  }, [selectedBundle?.MillOrder1])

  const submitting = submission.status === "submitting" || submission.status === "verifying"

  useEffect(() => {
    onBusyChange(submitting)
  }, [onBusyChange, submitting])

  useEffect(() => {
    if (!submission.eventId || !submission.trackingId || !submission.millOrder) return

    if (submittedBundle?.MillOrder1 === submission.millOrder) {
      setSubmission((previous) => ({
        ...previous,
        status: "success",
        message: `Mill Order ${submission.millOrder} was assigned and verified.`,
      }))
    }
  }, [submission.eventId, submission.millOrder, submission.trackingId, submittedBundle?.MillOrder1])

  useEffect(() => {
    if (submission.status !== "verifying" || !submission.startedAt) return

    const elapsed = Date.now() - submission.startedAt
    const remaining = Math.max(0, 20_000 - elapsed)
    const timer = window.setTimeout(() => {
      setSubmission((previous) =>
        previous.status === "verifying"
          ? {
              ...previous,
              status: "error",
              message:
                "The command was accepted, but the updated order was not observed within 20 seconds. Verify the live state before retrying.",
            }
          : previous,
      )
    }, remaining)

    return () => window.clearTimeout(timer)
  }, [submission.startedAt, submission.status])

  const selectedOrder = orders.find((order) => order.MillOrder === selectedMillOrder) ?? null
  const readyToSubmit = Boolean(
    client &&
      selectedBundle &&
      selectedOrder &&
      operatorId.trim() &&
      canCorrectBundle &&
      loadStatus === "ready" &&
      tracking.syncStatus === "live" &&
      !submitting &&
      selectedBundle.MillOrder1 !== selectedMillOrder,
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || !selectedBundle || !readyToSubmit) return

    const targetTrackingId = selectedBundle.TrackingId
    const targetMillOrder = selectedMillOrder

    const replacingExistingOrder =
      selectedBundle.MillOrder1 && selectedBundle.MillOrder1 !== targetMillOrder

    if (
      replacingExistingOrder &&
      !window.confirm(
        `Replace Mill Order ${selectedBundle.MillOrder1} with ${targetMillOrder} on bundle ${targetTrackingId}?`,
      )
    ) {
      return
    }

    setSubmission({
      status: "submitting",
      message: "Sending the order selection to Tracking...",
      trackingId: targetTrackingId,
      millOrder: targetMillOrder,
      eventId: null,
      startedAt: Date.now(),
    })

    try {
      const response = await client.correctBundle({
        TrackingId: targetTrackingId,
        OperatorId: operatorId.trim(),
        Reason: "HMI production order selection",
        MillOrder1: targetMillOrder,
      })

      setSubmission({
        status: "verifying",
        message: `Command accepted as event ${response.eventId}; waiting for live-state confirmation...`,
        trackingId: targetTrackingId,
        millOrder: targetMillOrder,
        eventId: response.eventId,
        startedAt: Date.now(),
      })
    } catch (error) {
      setSubmission((previous) => ({
        ...previous,
        status: "error",
        message: describeApiError(error),
      }))
    }
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      aria-label="Production order selection"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardList className="size-4 text-muted-foreground" aria-hidden />
          Production order
        </h2>
        {canReadOrders && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={loadOrders}
            disabled={loadStatus === "loading"}
            aria-label="Refresh QMOS Mill Orders"
            title="Refresh orders"
          >
            <RefreshCw
              className={loadStatus === "loading" ? "animate-spin motion-reduce:animate-none" : ""}
              aria-hidden
            />
          </Button>
        )}
      </div>

      {!selectedBundle ? (
        <p className="text-sm text-muted-foreground">
          Select a tracked bundle above to view or assign its Mill Order.
        </p>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <p className="truncate text-xs font-semibold text-foreground" title={selectedBundle.TrackingId}>
              {selectedBundle.BundleId ?? selectedBundle.TrackingId}
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
              {selectedBundle.CurrentZone ?? "Unknown zone"}
              {selectedBundle.MillOrder1
                ? ` · Current MO ${selectedBundle.MillOrder1}`
                : " · No order assigned"}
            </p>
          </div>

          {!canReadOrders ? (
            <p className="text-xs text-warning-fg">
              This API build does not advertise the QMOS Mill Order catalog.
            </p>
          ) : loadStatus === "error" ? (
            <p className="flex items-start gap-1.5 text-xs text-error-fg" role="alert">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {loadError}
            </p>
          ) : (
            <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
              Mill Order
              <select
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                value={selectedMillOrder}
                onChange={(event) => {
                  setSelectedMillOrder(event.target.value)
                  setSubmission(INITIAL_SUBMISSION)
                }}
                disabled={loadStatus !== "ready" || submitting}
              >
                <option value="">
                  {loadStatus === "loading"
                    ? "Loading QMOS orders..."
                    : loadStatus === "ready" && orders.length === 0
                      ? "No QMOS orders available"
                      : "Select an order"}
                </option>
                {orders.map((order) => (
                  <option key={order.FrpId} value={order.MillOrder}>
                    {orderLabel(order)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!canCorrectBundle && (
            <p className="text-xs text-warning-fg">
              This API build does not advertise manual bundle corrections.
            </p>
          )}

          {selectedOrder && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-[0.6875rem]">
              <dt className="text-muted-foreground">Heat</dt>
              <dd className="truncate text-right font-medium text-foreground">{selectedOrder.HeatNo}</dd>
              <dt className="text-muted-foreground">Work order</dt>
              <dd className="text-right font-medium text-foreground">{selectedOrder.WorkOrder}</dd>
              <dt className="text-muted-foreground">Grade</dt>
              <dd className="truncate text-right font-medium text-foreground" title={selectedOrder.Grade}>
                {selectedOrder.Grade}
              </dd>
              <dt className="text-muted-foreground">Weight</dt>
              <dd className="text-right font-medium text-foreground">{selectedOrder.Weight}</dd>
            </dl>
          )}

          <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
            Operator ID
            <Input
              value={operatorId}
              onChange={(event) => setOperatorId(event.target.value)}
              placeholder="Operator name or ID"
              autoComplete="username"
              disabled={submitting}
              maxLength={128}
            />
          </label>

          <Button type="submit" className="w-full" disabled={!readyToSubmit}>
            {submitting && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {submission.status === "verifying" ? "Verifying selection" : "Assign order"}
          </Button>

          {submission.message && (
            <p
              className={
                submission.status === "success"
                  ? "flex items-start gap-1.5 text-xs text-active-fg"
                  : submission.status === "error"
                    ? "flex items-start gap-1.5 text-xs text-error-fg"
                    : "text-xs text-muted-foreground"
              }
              role={submission.status === "error" ? "alert" : "status"}
            >
              {submission.status === "success" && (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              )}
              {submission.status === "error" && (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              )}
              {submission.message}
            </p>
          )}
        </form>
      )}

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Selections are submitted as audited manual corrections and verified against the live tracking state.
      </p>
    </section>
  )
}
