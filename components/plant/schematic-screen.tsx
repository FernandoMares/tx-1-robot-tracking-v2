"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Network } from "lucide-react"

import { TrackingSyncBadge } from "@/components/tracking-connection-banner"
import { LEGEND, STATUS_META, formatClock } from "@/lib/status"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import { cn } from "@/lib/utils"

interface SchematicScreenProps {
  title: string
  description: string
  updatedAt: Date | null
  animationRunning: boolean
  tracking: TrackingRuntimeState
  canvasWidth: number
  canvasHeight: number
  muted?: boolean
  children: ReactNode
}

/** Shared shell for the detailed worksheet screens. */
export function SchematicScreen({
  title,
  description,
  updatedAt,
  animationRunning,
  tracking,
  canvasWidth,
  canvasHeight,
  muted = false,
  children,
}: SchematicScreenProps) {
  const diagramViewportRef = useRef<HTMLDivElement>(null)
  const [diagramScale, setDiagramScale] = useState(1)

  useEffect(() => {
    const viewport = diagramViewportRef.current
    if (!viewport) return

    const observer = new ResizeObserver(([entry]) => {
      const availableWidth = entry.contentRect.width
      // Detailed views contain fewer, wider cards than the overview, so they
      // can safely grow further on control-room displays without crowding.
      setDiagramScale(Math.min(1.45, Math.max(0.9, availableWidth / canvasWidth)))
    })

    observer.observe(viewport)
    return () => observer.disconnect()
  }, [canvasWidth])

  return (
    <section className="flex min-w-0 max-w-full flex-col rounded-xl border border-border bg-card" aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3 py-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-base leading-none font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular text-xs text-muted-foreground">
            Last update: {updatedAt ? formatClock(updatedAt) : "Pending"}
          </span>
          <TrackingSyncBadge tracking={tracking} />
        </div>
      </header>

      <div
        className="max-w-full overflow-x-auto overscroll-x-contain px-1 py-2"
        tabIndex={0}
        aria-label={`Scrollable ${title} production diagram`}
        ref={diagramViewportRef}
      >
        <p className="mb-2 text-xs text-muted-foreground 2xl:hidden">
          Scroll horizontally to view the complete layout.
        </p>
        <div
          className="mx-auto shrink-0"
          style={{ width: canvasWidth * diagramScale, height: canvasHeight * diagramScale }}
        >
          <div
            className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${diagramScale})`,
              transformOrigin: "top left",
            }}
            role="group"
            aria-label={`${title} official worksheet layout`}
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-zone via-cell-fill to-zone" aria-hidden />
            <div className={cn("absolute inset-0 transition", muted && "opacity-30 saturate-50")}>{children}</div>
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-1.5">
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
          {!animationRunning && " · motion paused"}
        </span>
      </footer>
    </section>
  )
}
