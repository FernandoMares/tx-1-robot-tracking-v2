"use client"

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import {
  Check,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  ApiError,
  createTrackingApiClient,
  parseApiDate,
  type ApiDateValue,
  type GlobalDestinationDto,
  type GlobalMillOrderDto,
  type QmosBundleLocationDto,
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
const GLOBAL_DESTINATION_ENDPOINT = "/api/tracking/destination"
const QMOS_MILL_ORDERS_ENDPOINT = "/api/qmos/mill-orders"
const QMOS_BUNDLE_LOCATIONS_ENDPOINT = "/api/qmos/bundle-locations"
const MAX_VISIBLE_LOCATIONS = 80

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

function formatUpdatedUtc(value: ApiDateValue | undefined): string | null {
  const date = parseApiDate(value)
  return date ? date.toLocaleString() : null
}

export function GlobalMillOrderPanel({ tracking, config }: GlobalMillOrderPanelProps) {
  const [orders, setOrders] = useState<QmosMillOrderDto[]>([])
  const [locations, setLocations] = useState<QmosBundleLocationDto[]>([])
  const [activeOrder, setActiveOrder] = useState<GlobalMillOrderDto | null>(null)
  const [activeDestination, setActiveDestination] = useState<GlobalDestinationDto | null>(null)
  const [selectedMillOrder, setSelectedMillOrder] = useState("")
  const [selectedDestinationId, setSelectedDestinationId] = useState<number | null>(null)
  const [destinationQuery, setDestinationQuery] = useState("")
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle")
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)

  const client = useMemo(
    () =>
      config.baseUrl
        ? createTrackingApiClient({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs })
        : null,
    [config.baseUrl, config.timeoutMs],
  )

  const canReadOrders = hasCapability(tracking.capabilities?.reads, "GET", QMOS_MILL_ORDERS_ENDPOINT)
  const canReadActiveOrder = hasCapability(
    tracking.capabilities?.reads,
    "GET",
    GLOBAL_MILL_ORDER_ENDPOINT,
  )
  const canReadLocations = hasCapability(
    tracking.capabilities?.reads,
    "GET",
    QMOS_BUNDLE_LOCATIONS_ENDPOINT,
  )
  const canReadActiveDestination = hasCapability(
    tracking.capabilities?.reads,
    "GET",
    GLOBAL_DESTINATION_ENDPOINT,
  )
  const canUpdateActiveOrder = hasCapability(
    tracking.capabilities?.commands,
    "PUT",
    GLOBAL_MILL_ORDER_ENDPOINT,
  )
  const canUpdateActiveDestination = hasCapability(
    tracking.capabilities?.commands,
    "PUT",
    GLOBAL_DESTINATION_ENDPOINT,
  )
  const canReadProductionSelection =
    canReadOrders && canReadActiveOrder && canReadLocations && canReadActiveDestination

  const refresh = useCallback(() => {
    setRefreshRevision((revision) => revision + 1)
  }, [])

  useEffect(() => {
    if (!client || tracking.mode !== "live" || !canReadProductionSelection) {
      setOrders([])
      setLocations([])
      setActiveOrder(null)
      setActiveDestination(null)
      setSelectedMillOrder("")
      setSelectedDestinationId(null)
      setDestinationQuery("")
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
      client.getQmosBundleLocations(controller.signal),
      client.getGlobalDestination(controller.signal),
    ])
      .then(([availableOrders, currentOrder, availableLocations, currentDestination]) => {
        setOrders(availableOrders.value)
        setLocations(availableLocations)
        setActiveOrder(currentOrder)
        setActiveDestination(currentDestination)
        setSelectedMillOrder(currentOrder.enabled ? (currentOrder.millOrder ?? "") : "")
        setSelectedDestinationId(currentDestination.DestinationId)
        setDestinationQuery("")
        setLoadStatus("ready")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setOrders([])
        setLocations([])
        setActiveOrder(null)
        setActiveDestination(null)
        setSelectedMillOrder("")
        setSelectedDestinationId(null)
        setLoadStatus("error")
        setLoadError(describeApiError(error))
      })

    return () => controller.abort()
  }, [canReadProductionSelection, client, refreshRevision, tracking.mode])

  const activeMillOrder = activeOrder?.enabled ? activeOrder.millOrder : null
  const activeDestinationId = activeDestination?.DestinationId ?? null
  const activeDestinationDescription = activeDestination?.Description ?? null
  const activeOrderUpdatedAt = formatUpdatedUtc(activeOrder?.updatedUtc)
  const activeDestinationUpdatedAt = formatUpdatedUtc(activeDestination?.UpdatedUtc)
  const activeOrderMissingFromCatalog = Boolean(
    activeMillOrder && !orders.some((order) => order.MillOrder === activeMillOrder),
  )
  const selectedOrder = orders.find((order) => order.MillOrder === selectedMillOrder) ?? null
  const selectedDestination =
    locations.find((location) => location.Id === selectedDestinationId) ?? null
  const selectedDestinationDescription =
    selectedDestination?.Description ??
    (selectedDestinationId === activeDestinationId ? activeDestinationDescription : null)

  const matchingLocations = useMemo(() => {
    const query = destinationQuery.trim().toLocaleLowerCase()
    const matches = query
      ? locations.filter(
          (location) =>
            location.Description.toLocaleLowerCase().includes(query) ||
            String(location.Id).includes(query),
        )
      : locations

    return {
      count: matches.length,
      visible: matches.slice(0, MAX_VISIBLE_LOCATIONS),
    }
  }, [destinationQuery, locations])

  const updating = updateStatus === "updating"
  const orderChanged = Boolean(selectedMillOrder && selectedMillOrder !== activeMillOrder)
  const destinationChanged = Boolean(
    selectedDestinationId && selectedDestinationId !== activeDestinationId,
  )
  const readyToUpdate = Boolean(
    client &&
      selectedMillOrder &&
      selectedDestinationId &&
      selectedDestinationDescription &&
      (orderChanged || destinationChanged) &&
      canUpdateActiveOrder &&
      canUpdateActiveDestination &&
      loadStatus === "ready" &&
      tracking.syncStatus === "live" &&
      !updating,
  )

  async function refreshActiveValuesAfterFailure() {
    if (!client) return
    try {
      const [currentOrder, currentDestination] = await Promise.all([
        client.getGlobalMillOrder(),
        client.getGlobalDestination(),
      ])
      setActiveOrder(currentOrder)
      setActiveDestination(currentDestination)
    } catch {
      // Preserve the original update error; the regular refresh remains available.
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !client ||
      !readyToUpdate ||
      !selectedDestinationId ||
      !selectedDestinationDescription
    ) {
      return
    }

    const confirmed = window.confirm(
      `Set Mill Order ${selectedMillOrder} and Destination ${selectedDestinationDescription} ` +
        `(#${selectedDestinationId}) as the active production selection? ` +
        "The values will apply to subsequent QMOS CREATE operations.",
    )
    if (!confirmed) return

    setUpdateStatus("updating")
    setUpdateMessage("Saving and verifying the global production selection...")
    let savedOneSelection = false

    try {
      // Destination is saved first so a failure in the new QMOS-backed setting
      // does not change an otherwise valid Mill Order.
      if (destinationChanged) {
        const response = await client.updateGlobalDestination({ destinationId: selectedDestinationId })
        if (response.DestinationId !== selectedDestinationId) {
          throw new Error("Tracking answered, but the selected Destination was not acknowledged.")
        }
        savedOneSelection = true
      }

      if (orderChanged) {
        const response = await client.updateGlobalMillOrder({ millOrder: selectedMillOrder })
        if (!response.updated || !response.enabled || response.millOrder !== selectedMillOrder) {
          throw new Error("Tracking answered, but the selected global Mill Order was not acknowledged.")
        }
        savedOneSelection = true
      }

      const [verifiedOrder, verifiedDestination] = await Promise.all([
        client.getGlobalMillOrder(),
        client.getGlobalDestination(),
      ])

      if (
        !verifiedOrder.enabled ||
        verifiedOrder.millOrder !== selectedMillOrder ||
        verifiedDestination.DestinationId !== selectedDestinationId
      ) {
        throw new Error("Tracking answered, but both global selections could not be verified.")
      }

      setActiveOrder(verifiedOrder)
      setActiveDestination(verifiedDestination)
      setUpdateStatus("success")
      setUpdateMessage(
        `Mill Order ${selectedMillOrder} and Destination ${verifiedDestination.Description ?? selectedDestinationDescription} are now active.`,
      )
    } catch (error) {
      await refreshActiveValuesAfterFailure()
      setUpdateStatus("error")
      setUpdateMessage(
        `${savedOneSelection ? "One setting may already have changed; the current values were read again. " : ""}${describeApiError(error)}`,
      )
    }
  }

  const headerUnavailable =
    loadStatus === "error" || (tracking.capabilities && !canReadProductionSelection)

  return (
    <>
      <section
        className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2"
        aria-label="Global production selection"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <ClipboardList className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">Active Mill Order</p>
              <p
                className={`tabular truncate text-xl leading-tight font-semibold ${
                  loadStatus === "ready" && !activeMillOrder ? "text-warning-fg" : "text-foreground"
                }`}
                title={activeMillOrder ?? undefined}
              >
                {loadStatus === "ready"
                  ? activeMillOrder ?? "Not selected"
                  : headerUnavailable
                    ? "Unavailable"
                    : "Reading..."}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-3 border-border sm:border-l sm:pl-6">
            <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">Active Destination</p>
              <p
                className={`truncate text-xl leading-tight font-semibold ${
                  loadStatus === "ready" && !activeDestinationId ? "text-warning-fg" : "text-foreground"
                }`}
                title={activeDestinationDescription ?? undefined}
                role="status"
                aria-live="polite"
              >
                {loadStatus === "ready"
                  ? activeDestinationDescription ?? "Not selected"
                  : headerUnavailable
                    ? "Unavailable"
                    : "Reading..."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canReadProductionSelection && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={refresh}
              disabled={loadStatus === "loading" || updating}
              aria-label="Refresh active Mill Order, Destination, and QMOS catalogs"
              title="Refresh production selection"
            >
              <RefreshCw
                className={loadStatus === "loading" ? "animate-spin motion-reduce:animate-none" : ""}
                aria-hidden
              />
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
            Change selection
          </Button>
        </div>
      </section>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border px-5 py-4 pr-12 text-left">
            <SheetTitle className="text-lg">Select Mill Order and Destination</SheetTitle>
            <SheetDescription>
              Both global values apply to subsequent QMOS CREATE operations. Existing bundles are not changed.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <section className="flex flex-col gap-4" aria-label="Global production selection controls">
              {canReadProductionSelection && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={refresh}
                  disabled={loadStatus === "loading" || updating}
                >
                  <RefreshCw
                    className={loadStatus === "loading" ? "animate-spin motion-reduce:animate-none" : ""}
                    aria-hidden
                  />
                  Refresh catalogs
                </Button>
              )}

              {tracking.capabilities && !canReadActiveOrder ? (
                <CapabilityWarning>Tracking does not advertise the global Mill Order API.</CapabilityWarning>
              ) : tracking.capabilities && !canReadOrders ? (
                <CapabilityWarning>Tracking does not advertise the QMOS Mill Order catalog.</CapabilityWarning>
              ) : tracking.capabilities && !canReadActiveDestination ? (
                <CapabilityWarning>Tracking does not advertise the global Destination API.</CapabilityWarning>
              ) : tracking.capabilities && !canReadLocations ? (
                <CapabilityWarning>Tracking does not advertise the QMOS bundle-location catalog.</CapabilityWarning>
              ) : loadStatus === "error" ? (
                <p className="flex items-start gap-1.5 text-xs text-error-fg" role="alert">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {loadError}
                </p>
              ) : loadStatus !== "ready" ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                  Reading the active production selection...
                </p>
              ) : (
                <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <CurrentSelection
                      label="Current Mill Order"
                      value={activeMillOrder ?? "No global selection"}
                      updatedAt={activeOrderUpdatedAt}
                      missing={!activeMillOrder}
                    />
                    <CurrentSelection
                      label="Current Destination"
                      value={activeDestinationDescription ?? "No global selection"}
                      detail={activeDestinationId ? `ID ${activeDestinationId}` : undefined}
                      updatedAt={activeDestinationUpdatedAt}
                      missing={!activeDestinationId}
                    />
                  </div>

                  <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                    Select global Mill Order
                    <select
                      className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
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
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-border px-3 py-3 text-sm">
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

                  <fieldset className="flex min-w-0 flex-col gap-2" disabled={updating}>
                    <legend className="text-sm font-medium text-foreground">Select global Destination</legend>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        className="pl-8"
                        value={destinationQuery}
                        onChange={(event) => setDestinationQuery(event.target.value)}
                        placeholder="Search location or destination ID"
                        aria-label="Search QMOS bundle locations"
                      />
                    </div>

                    {selectedDestinationId && selectedDestinationDescription && (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-active/30 bg-active/5 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate font-semibold text-foreground">
                          {selectedDestinationDescription}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">ID {selectedDestinationId}</span>
                      </div>
                    )}

                    <ScrollArea className="h-52 rounded-lg border border-border bg-background">
                      <div className="flex flex-col p-1" role="listbox" aria-label="QMOS bundle locations">
                        {matchingLocations.visible.map((location) => {
                          const selected = location.Id === selectedDestinationId
                          return (
                            <button
                              key={location.Id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${
                                selected ? "bg-primary/10 text-foreground" : "text-foreground"
                              }`}
                              onClick={() => {
                                setSelectedDestinationId(location.Id)
                                setDestinationQuery(location.Description)
                                setUpdateStatus("idle")
                                setUpdateMessage(null)
                              }}
                            >
                              <Check
                                className={`size-4 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 truncate">{location.Description}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">{location.Id}</span>
                            </button>
                          )
                        })}
                        {matchingLocations.count === 0 && (
                          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                            No destinations match this search.
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground">
                      {matchingLocations.count > MAX_VISIBLE_LOCATIONS
                        ? `Showing ${MAX_VISIBLE_LOCATIONS} of ${matchingLocations.count} matches. Refine the search to see a specific location.`
                        : `${matchingLocations.count} matching destination${matchingLocations.count === 1 ? "" : "s"}.`}
                    </p>
                  </fieldset>

                  {(!canUpdateActiveOrder || !canUpdateActiveDestination) && (
                    <CapabilityWarning>
                      Tracking does not advertise permission to change both global selections.
                    </CapabilityWarning>
                  )}

                  <Button type="submit" className="w-full" disabled={!readyToUpdate}>
                    {updating && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
                    {updating ? "Saving production selection" : "Set Mill Order and Destination"}
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
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function CapabilityWarning({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-warning-fg" role="status">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  )
}

function CurrentSelection({
  label,
  value,
  detail,
  updatedAt,
  missing,
}: {
  label: string
  value: string
  detail?: string
  updatedAt: string | null
  missing: boolean
}) {
  return (
    <div
      className={
        missing
          ? "rounded-lg border border-warning/30 bg-warning/5 px-3 py-2"
          : "rounded-lg border border-active/30 bg-active/5 px-3 py-2"
      }
    >
      <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-foreground" title={value}>
        {value}
      </p>
      {(detail || updatedAt) && (
        <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
          {[detail, updatedAt ? `Updated ${updatedAt}` : null].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  )
}
