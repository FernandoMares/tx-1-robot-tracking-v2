"use client"

import { useState } from "react"
import { Boxes, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import { isTrackingZoneName } from "@/lib/tracking-zone-layout"

interface TrackingBundlesPanelProps {
  tracking: TrackingRuntimeState
}

function displayIdentity(bundle: NonNullable<TrackingRuntimeState["trackingState"]>["Bundles"][number]) {
  return bundle.BundleId ?? (bundle.L2Id != null ? String(bundle.L2Id) : bundle.TrackingId)
}

/** Live bundle readout from the current Tracking state. */
export function TrackingBundlesPanel({ tracking }: TrackingBundlesPanelProps) {
  const bundles = tracking.trackingState?.Bundles
  const [open, setOpen] = useState(false)

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
            <SheetDescription>Current bundles from the Tracking state snapshot.</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">

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
                </div>
              </li>
            )
          })}
        </ul>
      )}

          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Bundle-specific Mill Orders are shown for reference. Unknown zones remain visible in this list.
          </p>
        </SheetContent>
      </Sheet>
    </>
  )
}
