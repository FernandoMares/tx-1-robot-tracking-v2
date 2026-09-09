import type { CSSProperties } from "react"

import {
  getTrackingVisualZone,
  type TrackingZoneName,
} from "@/lib/tracking-zone-layout"
import type { TrackedBundleDto } from "@/lib/tracking-api"
import { cn } from "@/lib/utils"

export interface TrackingZoneSlotProps {
  zoneName: TrackingZoneName
  bundles?: readonly TrackedBundleDto[]
  compact?: boolean
  /** Distinguishes a valid empty snapshot from startup without data. */
  hasSnapshot?: boolean
  className?: string
  style?: CSSProperties
}

function bundleIdentity(bundle: TrackedBundleDto): string {
  return bundle.BundleId ?? (bundle.L2Id != null ? String(bundle.L2Id) : bundle.TrackingId)
}

/**
 * Generic zone-level renderer. Multiple chips mean co-location only: their
 * visual order must not be interpreted as a physical slot sequence.
 */
export function TrackingZoneSlot({
  zoneName,
  bundles = [],
  compact = false,
  hasSnapshot = true,
  className,
  style,
}: TrackingZoneSlotProps) {
  const zone = getTrackingVisualZone(zoneName)
  const occupied = hasSnapshot && bundles.length > 0
  const waitingForQmos = bundles.some(
    (bundle) =>
      bundle.Status === "WAITING_QMOS_ID" || bundle.CorrelationStatus === "UNMATCHED",
  )

  return (
    <section
      data-zone-name={zoneName}
      data-zone-occupied={occupied || undefined}
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
        <span>{zone.label}</span>
        <span className="tabular rounded bg-black/15 px-1.5 py-0.5" aria-label={`${bundles.length} bundles`}>
          {hasSnapshot ? bundles.length : "—"}
        </span>
      </header>

      <div
        className={cn(
          "flex flex-wrap content-start gap-1.5",
          compact ? "h-10 overflow-hidden p-1.5" : "min-h-16 p-2",
        )}
      >
        {!hasSnapshot ? (
          <span className="self-center text-[11px] text-slate-400">Waiting</span>
        ) : bundles.length === 0 ? (
          <span className="self-center text-[11px] text-slate-400">Empty</span>
        ) : compact && bundles.length > 1 ? (
          <span className="self-center text-[10px] font-medium text-slate-600">
            {bundles.length} co-located
          </span>
        ) : (
          bundles.map((bundle, index) => {
            const identity = bundleIdentity(bundle)
            const status = bundle.Status ?? "Unknown status"
            const correlation = bundle.CorrelationStatus ?? "Unknown correlation"

            return (
              <span
                key={`${bundle.TrackingId}-${index}`}
                className={cn(
                  "min-w-0 rounded border px-2 py-1 text-slate-800",
                  waitingForQmos ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50",
                  compact ? "text-[10px]" : "text-[11px]",
                )}
                title={`${bundle.TrackingId} · ${status} · ${correlation}`}
              >
                <strong className="block truncate font-semibold">{identity}</strong>
                {!compact && <span className="block truncate text-[10px] text-slate-500">{status}</span>}
              </span>
            )
          })
        )}
      </div>
    </section>
  )
}
