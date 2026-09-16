"use client"

import { useEffect, useRef, useState } from "react"
import { Network } from "lucide-react"

import {
  MAIN_SCHEMATIC_HEIGHT,
  MAIN_SCHEMATIC_WIDTH,
  MainSchematic,
} from "@/components/plant/main-schematic"
import { TrackingSyncBadge } from "@/components/tracking-connection-banner"
import { LEGEND, STATUS_META, formatClock } from "@/lib/status"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import type { BundlesByZone } from "@/lib/tracking-zone-layout"
import type { PlantTable } from "@/lib/types"
import { cn } from "@/lib/utils"

interface PlantMapProps {
  tables: PlantTable[]
  updatedAt: Date | null
  animationRunning: boolean
  tracking: TrackingRuntimeState
  /** Ids passing the active filters, or null when no filter is set. */
  matchedIds: Set<string> | null
  bundlesByZone: BundlesByZone
}

export function PlantMap({
  tables,
  updatedAt,
  animationRunning,
  tracking,
  matchedIds,
  bundlesByZone,
}: PlantMapProps) {
  const diagramViewportRef = useRef<HTMLDivElement>(null)
  const [diagramScale, setDiagramScale] = useState(1)

  useEffect(() => {
    const viewport = diagramViewportRef.current
    if (!viewport) return

    const observer = new ResizeObserver(([entry]) => {
      const availableWidth = entry.contentRect.width
      setDiagramScale(Math.min(1.25, Math.max(0.95, availableWidth / MAIN_SCHEMATIC_WIDTH)))
    })

    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="flex min-w-0 max-w-full flex-col rounded-xl border border-border bg-card" aria-label="Plant overview">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base leading-none font-semibold text-foreground">Plant Overview</h2>
          <p className="text-sm text-muted-foreground">
            {matchedIds
              ? `${matchedIds.size} of ${tables.length} tables match the active filters`
              : "Official Exit Tracking layout · 33 mapped zones"}
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
        className="max-w-full overflow-x-auto overscroll-x-contain px-2 py-3"
        tabIndex={0}
        aria-label="Scrollable plant floor diagram"
        ref={diagramViewportRef}
      >
        <p className="mb-2 text-xs text-muted-foreground 2xl:hidden">
          Scroll horizontally to view the complete layout.
        </p>
        <div
          style={{ width: MAIN_SCHEMATIC_WIDTH * diagramScale, height: MAIN_SCHEMATIC_HEIGHT * diagramScale }}
        >
          <div
            style={{
              width: MAIN_SCHEMATIC_WIDTH,
              height: MAIN_SCHEMATIC_HEIGHT,
              transform: `scale(${diagramScale})`,
              transformOrigin: "top left",
            }}
          >
            <MainSchematic
              animationRunning={animationRunning}
              bundlesByZone={bundlesByZone}
              hasSnapshot={tracking.mode === "mock" || tracking.trackingState !== null}
            />
          </div>
        </div>
      </div>

      {/* Legend */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2">
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
            : "Bundle positions come from CurrentZone; route motion is illustrative"}
        </span>
      </footer>
    </section>
  )
}
