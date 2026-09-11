"use client"

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ApiError,
  createTrackingApiClient,
  parseApiDate,
  type GlobalMillOrderDto,
  type QmosMillOrderDto,
  type TrackingApiConfig,
  type TrackingRuntimeState,
} from "@/lib/tracking-api"

interface GlobalMillOrderPanelProps {
  tracking: TrackingRuntimeState
  config: TrackingApiConfig
}

type LoadStatus = "idle" | "loading" | "ready" | "error"
type UpdateStatus = "idle" | "updating" | "success" | "error"

const GLOBAL_MILL_ORDER_ENDPOINT = "/api/tracking/mill-order"
const QMOS_MILL_ORDERS_ENDPOINT = "/api/qmos/mill-orders"

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

function hasCapability(entries: string[] | undefined, method: "GET" | "PUT", path: string): boolean {
  if (!entries) return false
  const methodAndPath = `${method} ${path}`.toUpperCase()

  return entries.some((entry) => {
    const normalized = entry.trim()
    return normalized === path || normalized.toUpperCase() === methodAndPath
  })
}

function formatUpdatedUtc(value: GlobalMillOrderDto["updatedUtc"] | undefined): string | null {
  const date = parseApiDate(value)
  return date ? date.toLocaleString() : null
}

export function GlobalMillOrderPanel({ tracking, config }: GlobalMillOrderPanelProps) {
  const [orders, setOrders] = useState<QmosMillOrderDto[]>([])
  const [activeOrder, setActiveOrder] = useState<GlobalMillOrderDto | null>(null)
  const [selectedMillOrder, setSelectedMillOrder] = useState("")
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle")
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)

  const client = useMemo(
    () =>
      config.baseUrl
        ? createTrackingApiClient({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs })
        : null,
    [config.baseUrl, config.timeoutMs],
  )

  const canReadOrders = hasCapability(
    tracking.capabilities?.reads,
    "GET",
    QMOS_MILL_ORDERS_ENDPOINT,
  )
  const canReadActiveOrder = hasCapability(
    tracking.capabilities?.reads,
    "GET",
    GLOBAL_MILL_ORDER_ENDPOINT,
  )
  const canUpdateActiveOrder = hasCapability(
    tracking.capabilities?.commands,
    "PUT",
    GLOBAL_MILL_ORDER_ENDPOINT,
  )

  const refresh = useCallback(() => {
    setRefreshRevision((revision) => revision + 1)
  }, [])

  useEffect(() => {
    if (!client || tracking.mode !== "live" || !canReadOrders || !canReadActiveOrder) {
      setOrders([])
      setActiveOrder(null)
      setSelectedMillOrder("")
      setLoadStatus("idle")
      setLoadError(null)
      return
    }

    const controller = new AbortController()
    setLoadStatus("loading")
    setLoadError(null)

    void Promise.all([
      client.getQmosMillOrders(50, controller.signal),
      client.getGlobalMillOrder(controller.signal),
    ])
      .then(([availableOrders, currentOrder]) => {
        setOrders(availableOrders.value)
        setActiveOrder(currentOrder)
        setSelectedMillOrder(currentOrder.enabled ? (currentOrder.millOrder ?? "") : "")
        setLoadStatus("ready")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setOrders([])
        setActiveOrder(null)
        setSelectedMillOrder("")
        setLoadStatus("error")
        setLoadError(describeApiError(error))
      })

    return () => controller.abort()
  }, [canReadActiveOrder, canReadOrders, client, refreshRevision, tracking.mode])

  const activeMillOrder = activeOrder?.enabled ? activeOrder.millOrder : null
  const activeUpdatedAt = formatUpdatedUtc(activeOrder?.updatedUtc)
  const activeOrderMissingFromCatalog = Boolean(
    activeMillOrder && !orders.some((order) => order.MillOrder === activeMillOrder),
  )
  const selectedOrder = orders.find((order) => order.MillOrder === selectedMillOrder) ?? null
  const updating = updateStatus === "updating"
  const readyToUpdate = Boolean(
    client &&
      selectedMillOrder &&
      selectedMillOrder !== activeMillOrder &&
      canUpdateActiveOrder &&
      loadStatus === "ready" &&
      tracking.syncStatus === "live" &&
      !updating,
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || !readyToUpdate) return

    const confirmed = window.confirm(
      `Set Mill Order ${selectedMillOrder} as the active order for the tracking system? ` +
        "It will apply to subsequent QMOS CREATE operations.",
    )
    if (!confirmed) return

    setUpdateStatus("updating")
    setUpdateMessage("Saving the global Mill Order in Tracking...")

    try {
      const response = await client.updateGlobalMillOrder({ millOrder: selectedMillOrder })
      const verified = await client.getGlobalMillOrder()

      if (!response.updated || !verified.enabled || verified.millOrder !== selectedMillOrder) {
        throw new Error("Tracking answered, but the selected global Mill Order could not be verified.")
      }

      setActiveOrder(verified)
      setUpdateStatus("success")
      setUpdateMessage(`Mill Order ${selectedMillOrder} is now active for subsequent bundles.`)
    } catch (error) {
      setUpdateStatus("error")
      setUpdateMessage(describeApiError(error))
    }
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      aria-label="Global production order"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardList className="size-4 text-muted-foreground" aria-hidden />
          Active Mill Order
        </h2>
        {canReadOrders && canReadActiveOrder && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={refresh}
            disabled={loadStatus === "loading" || updating}
            aria-label="Refresh active Mill Order and QMOS catalog"
            title="Refresh order data"
          >
            <RefreshCw
              className={loadStatus === "loading" ? "animate-spin motion-reduce:animate-none" : ""}
              aria-hidden
            />
          </Button>
        )}
      </div>

      {!canReadActiveOrder && tracking.capabilities ? (
        <p className="flex items-start gap-1.5 text-xs text-warning-fg" role="status">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This Tracking build does not advertise the global Mill Order API.
        </p>
      ) : !canReadOrders && tracking.capabilities ? (
        <p className="flex items-start gap-1.5 text-xs text-warning-fg" role="status">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          This Tracking build does not advertise the QMOS Mill Order catalog.
        </p>
      ) : loadStatus === "error" ? (
        <p className="flex items-start gap-1.5 text-xs text-error-fg" role="alert">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {loadError}
        </p>
      ) : loadStatus !== "ready" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          Reading the active production order...
        </p>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <div
            className={
              activeMillOrder
                ? "rounded-lg border border-active/30 bg-active/5 px-3 py-2"
                : "rounded-lg border border-warning/30 bg-warning/5 px-3 py-2"
            }
          >
            <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
              Currently active
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {activeMillOrder ?? "No global selection"}
            </p>
            {activeUpdatedAt && (
              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                Updated {activeUpdatedAt}
              </p>
            )}
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
            Select global Mill Order
            <select
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              value={selectedMillOrder}
              onChange={(event) => {
                setSelectedMillOrder(event.target.value)
                setUpdateStatus("idle")
                setUpdateMessage(null)
              }}
              disabled={updating}
            >
              <option value="">Select an order</option>
              {activeOrderMissingFromCatalog && activeMillOrder && (
                <option value={activeMillOrder}>{activeMillOrder} · Current active order</option>
              )}
              {orders.map((order) => (
                <option key={order.FrpId} value={order.MillOrder}>
                  {orderLabel(order)}
                </option>
              ))}
            </select>
          </label>

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

          {!canUpdateActiveOrder && (
            <p className="flex items-start gap-1.5 text-xs text-warning-fg" role="status">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              This Tracking build does not advertise permission to change the global order.
            </p>
          )}

          <Button type="submit" className="w-full" disabled={!readyToUpdate}>
            {updating && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {updating ? "Saving active order" : "Set active order"}
          </Button>

          {updateMessage && (
            <p
              className={
                updateStatus === "success"
                  ? "flex items-start gap-1.5 text-xs text-active-fg"
                  : updateStatus === "error"
                    ? "flex items-start gap-1.5 text-xs text-error-fg"
                    : "text-xs text-muted-foreground"
              }
              role={updateStatus === "error" ? "alert" : "status"}
            >
              {updateStatus === "success" && (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              )}
              {updateStatus === "error" && (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              )}
              {updateMessage}
            </p>
          )}
        </form>
      )}

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Applies to subsequent QMOS CREATE operations. Existing bundles are not changed.
      </p>
    </section>
  )
}
