import type { CSSProperties } from "react"

import {
  getTrackingVisualZone,
  type TrackingZoneName,
} from "@/lib/tracking-zone-layout"
import type { TrackedBundleDto } from "@/lib/tracking-api"
import { getFifoMembership, orderBundlesByLogicalFifo } from "@/lib/tracking-fifo"
import { cn } from "@/lib/utils"

export interface TrackingZoneSlotProps {
  zoneName: TrackingZoneName
  bundles?: readonly TrackedBundleDto[]
  compact?: boolean
  /** Reserve space for this many compact bundle rows; scroll if more are present. */
  compactVisibleRows?: number
  /** Distinguishes a valid empty snapshot from startup without data. */
  hasSnapshot?: boolean
  className?: string
  style?: CSSProperties
}

function bundleIdentity(bundle: TrackedBundleDto): string {
  return bundle.BundleId ?? (bundle.L2Id != null ? String(bundle.L2Id) : bundle.TrackingId)
}

/**
 * CurrentZone determines placement. Within each logical FIFO, L2 QueueSequence
 * determines display precedence; this is not a physical HEAD/TAIL slot index.
 */
export function TrackingZoneSlot({
  zoneName,
  bundles = [],
  compact = false,
  compactVisibleRows,
  hasSnapshot = true,
  className,
  style,
}: TrackingZoneSlotProps) {
  const zone = getTrackingVisualZone(zoneName)
  const fifo = orderBundlesByLogicalFifo(bundles)
  const fifoIncomplete = fifo.hasFifoMembers && (fifo.hasUnorderedMembers || fifo.hasDuplicateSequences)
  const fifoDescription = fifo.hasFifoMembers
    ? "FIFO members are shown by QueueSequence ascending within each logical buffer." +
      (fifo.hasUnorderedMembers ? " Other bundles have no usable FIFO membership; their display positions are not FIFO ranks." : "") +
      (fifo.hasDuplicateSequences ? " Duplicate sequences: equal entries have no confirmed FIFO precedence." : "")
    : undefined
  const occupied = hasSnapshot && bundles.length > 0
  const waitingForQmos = bundles.some(
    (bundle) =>
      bundle.Status === "WAITING_QMOS_ID" || bundle.CorrelationStatus === "UNMATCHED",
  )
  const visibleRows =
    compact && compactVisibleRows !== undefined && Number.isInteger(compactVisibleRows) && compactVisibleRows > 0
      ? compactVisibleRows
      : null

  return (
    <section
      data-zone-name={zoneName}
      data-zone-occupied={occupied || undefined}
      data-fifo-order={hasSnapshot && fifo.hasFifoMembers ? fifoIncomplete ? "partial" : "ascending" : undefined}
      title={hasSnapshot ? fifoDescription : undefined}
      aria-description={hasSnapshot ? fifoDescription : undefined}
      className={cn(
        "overflow-hidden rounded-sm border bg-white shadow-sm",
        waitingForQmos
          ? "border-amber-400"
          : occupied
            ? "border-emerald-500"
            : "border-slate-300",
        className,
      )}
      style={style}
      aria-label={
        hasSnapshot
          ? `${zone.label} tracking zone, ${bundles.length} bundle${bundles.length === 1 ? "" : "s"}`
          : `${zone.label} tracking zone, waiting for tracking data`
      }
    >
      <header
        className={cn(
          "flex items-center justify-between gap-2 px-2 font-bold tracking-wide text-white",
          compact ? "h-7 text-[10px]" : "h-9 text-xs",
          waitingForQmos ? "bg-amber-600" : occupied ? "bg-emerald-700" : "bg-slate-700",
        )}
      >
        <span>{zone.label}{hasSnapshot && fifoIncomplete && <span className="ml-0.5" aria-label="FIFO order incomplete" title={fifoDescription}>*</span>}</span>
        <span className="tabular rounded bg-black/15 px-1.5 py-0.5" aria-label={`${bundles.length} bundles`}>
          {hasSnapshot ? bundles.length : "—"}
        </span>
      </header>

      <div
        className={cn(
          "flex flex-wrap content-start gap-1.5",
          compact
            ? visibleRows !== null
              ? "gap-0.5 overflow-x-hidden overflow-y-auto p-1"
              : bundles.length > 1
                ? "h-10 gap-0.5 overflow-hidden p-1"
                : "h-10 overflow-hidden p-1.5"
            : "min-h-16 p-2",
        )}
        style={visibleRows !== null ? { height: visibleRows * 22 + 10 } : undefined}
      >
        {!hasSnapshot ? (
          <span className="self-center text-[11px] text-slate-400">Waiting</span>
        ) : bundles.length === 0 ? (
          <span className="self-center text-[11px] text-slate-400">Empty</span>
        ) : (
          fifo.bundles.map((bundle, index) => {
            const identity = bundleIdentity(bundle)
            const numericIdentity = /^\d+$/.test(identity)
            const status = bundle.Status ?? "Unknown status"
            const correlation = bundle.CorrelationStatus ?? "Unknown correlation"
            const membership = getFifoMembership(bundle)
            const fifoDetail = membership
              ? ` · FIFO ${membership.bufferName} · QueueSequence ${membership.sequence}`
              : bundle.QueueSequence === null
                ? " · Not currently an active FIFO member"
                : bundle.LogicalBufferName != null || bundle.QueueSequence !== undefined
                  ? " · FIFO order unavailable"
                  : ""
            const bundleWaitingForQmos =
              bundle.Status === "WAITING_QMOS_ID" || bundle.CorrelationStatus === "UNMATCHED"

            return (
              <span
                key={`${bundle.TrackingId}-${index}`}
                data-tracking-id={bundle.TrackingId}
                data-fifo-buffer={membership?.bufferName}
                data-queue-sequence={membership?.sequence}
                className={cn(
                  "max-w-full min-w-0 rounded border text-slate-800",
                  bundleWaitingForQmos ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50",
                  compact
                    ? visibleRows !== null
                      ? "min-h-5 w-full px-1 py-0.5 text-[10px] leading-[14px]"
                      : bundles.length > 1
                        ? "w-full px-1 py-0 text-[9px] leading-3"
                        : "px-1 py-1 text-[10px]"
                    : "px-2 py-1 text-[11px]",
                  compact && numericIdentity && "w-full text-center",
                )}
                title={`${bundle.TrackingId} · ${status} · ${correlation}${fifoDetail}`}
              >
                <strong
                  className={cn(
                    "block font-semibold",
                    numericIdentity ? "whitespace-nowrap tabular-nums tracking-tight" : "truncate",
                  )}
                >
                  {identity}
                </strong>
                {!compact && <span className="block truncate text-[10px] text-slate-500">{status}</span>}
              </span>
            )
          })
        )}
      </div>
    </section>
  )
}
