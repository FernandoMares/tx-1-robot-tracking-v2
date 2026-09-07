"use client"

import { Network } from "lucide-react"

import { MainSchematic } from "@/components/plant/main-schematic"
import { TrackingSyncBadge } from "@/components/tracking-connection-banner"
import { LEGEND, STATUS_META, formatClock } from "@/lib/status"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import type { PlantTable } from "@/lib/types"
import { cn } from "@/lib/utils"

interface PlantMapProps {
  tables: PlantTable[]
  updatedAt: Date | null
  animationRunning: boolean
  tracking: TrackingRuntimeState
  /** Ids passing the active filters, or null when no filter is set. */
  matchedIds: Set<string> | null
}

export function PlantMap({
  tables,
  updatedAt,
  animationRunning,
  tracking,
  matchedIds,
}: PlantMapProps) {
  return (
    <section className="flex min-w-0 max-w-full flex-col rounded-xl border border-border bg-card" aria-label="Plant overview">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base leading-none font-semibold text-foreground">Plant Overview</h2>
          <p className="text-sm text-muted-foreground">
            {matchedIds
              ? `${matchedIds.size} of ${tables.length} tables match the active filters`
              : "Official Main production flow"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="tabular text-xs text-muted-foreground">
            Last update: {updatedAt ? formatClock(updatedAt) : "Pending"}
          </span>
          <TrackingSyncBadge tracking={tracking} />
        </div>
      </header>

      <div
        className="max-w-full overflow-x-auto overscroll-x-contain p-4"
        tabIndex={0}
        aria-label="Scrollable plant floor diagram"
      >
        <p className="mb-2 text-xs text-muted-foreground 2xl:hidden">
          Scroll horizontally to view the complete layout.
        </p>
        <MainSchematic
          animationRunning={animationRunning}
          matchedIds={matchedIds}
          showDemoData={tracking.mode === "mock"}
        />
      </div>

      {/* Legend */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {LEGEND.map((item) => (
            <li key={item.status} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn("size-2 rounded-full", STATUS_META[item.status].dot)} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Network className="size-3.5" aria-hidden />
          {tracking.mode === "mock"
            ? "Simulated preview data"
            : "API tracking data; equipment motion is illustrative"}
        </span>
      </footer>
    </section>
  )
}
