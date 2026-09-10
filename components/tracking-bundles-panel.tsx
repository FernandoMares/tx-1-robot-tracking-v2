"use client"

import { Boxes } from "lucide-react"

import type { TrackingRuntimeState } from "@/lib/tracking-api"
import { isTrackingZoneName } from "@/lib/tracking-zone-layout"
import { cn } from "@/lib/utils"

interface TrackingBundlesPanelProps {
  tracking: TrackingRuntimeState
  selectedTrackingId: string | null
  onSelectBundle: (trackingId: string) => void
  selectionLocked?: boolean
}

function displayIdentity(bundle: NonNullable<TrackingRuntimeState["trackingState"]>["Bundles"][number]) {
  return bundle.BundleId ?? (bundle.L2Id != null ? String(bundle.L2Id) : bundle.TrackingId)
}

/** Live bundle readout and explicit target selection for operator commands. */
export function TrackingBundlesPanel({
  tracking,
  selectedTrackingId,
  onSelectBundle,
  selectionLocked = false,
}: TrackingBundlesPanelProps) {
  const bundles = tracking.trackingState?.Bundles

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="Tracked bundles">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Boxes className="size-4 text-muted-foreground" aria-hidden />
          Tracked bundles
        </h2>
        {bundles && (
          <span className="tabular rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {bundles.length}
          </span>
        )}
      </div>

      {!bundles ? (
        <p className="text-sm text-muted-foreground">Waiting for the first valid state snapshot.</p>
      ) : bundles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bundles are currently tracked.</p>
      ) : (
        <ul className="flex max-h-[24rem] flex-col gap-2 overflow-y-auto pr-1">
          {bundles.map((bundle, index) => {
            const selected = selectedTrackingId === bundle.TrackingId

            return (
              <li key={`${bundle.TrackingId}-${index}`}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-lg border px-3 py-2.5 text-left transition-colors outline-none",
                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait",
                    selected
                      ? "border-primary/60 bg-primary/5"
                      : "border-border hover:border-primary/30 hover:bg-muted/50",
                  )}
                  onClick={() => onSelectBundle(bundle.TrackingId)}
                  aria-pressed={selected}
                  disabled={selectionLocked}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="min-w-0 truncate text-xs font-semibold text-foreground"
                      title={bundle.TrackingId}
                    >
                      {displayIdentity(bundle)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[0.6875rem] font-medium",
                        bundle.CurrentZone && isTrackingZoneName(bundle.CurrentZone)
                          ? "text-muted-foreground"
                          : "text-warning-fg",
                      )}
                    >
                      {bundle.CurrentZone ?? "Unknown zone"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[0.6875rem] text-muted-foreground">
                    <span>{bundle.Status ?? "Unknown status"}</span>
                    <span aria-hidden>·</span>
                    <span>{bundle.CorrelationStatus ?? "Unknown correlation"}</span>
                  </div>
                  {bundle.MillOrder1 && (
                    <p className="mt-1 truncate text-[0.6875rem] font-medium text-primary">
                      MO {bundle.MillOrder1}
                    </p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Select a bundle to view or assign its production order. Unknown zones remain visible in this list.
      </p>
    </section>
  )
}
