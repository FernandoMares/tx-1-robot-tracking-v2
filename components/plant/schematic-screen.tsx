"use client"

import type { ReactNode } from "react"
import { Network } from "lucide-react"

import { LEGEND, STATUS_META, formatClock } from "@/lib/status"
import { cn } from "@/lib/utils"

interface SchematicScreenProps {
  title: string
  description: string
  updatedAt: Date
  live: boolean
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
  live,
  canvasWidth,
  canvasHeight,
  muted = false,
  children,
}: SchematicScreenProps) {
  return (
    <section className="flex min-w-0 max-w-full flex-col rounded-xl border border-border bg-card" aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base leading-none font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular text-xs text-muted-foreground">Last update: {formatClock(updatedAt)}</span>
          <span
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium",
              live ? "border-active/30 bg-active/10 text-active-fg" : "border-border bg-muted text-muted-foreground",
            )}
          >
            {live ? "Live data" : "Paused"}
          </span>
        </div>
      </header>

      <div
        className="max-w-full overflow-x-auto overscroll-x-contain p-4"
        tabIndex={0}
        aria-label={`Scrollable ${title} production diagram`}
      >
        <p className="mb-2 text-xs text-muted-foreground 2xl:hidden">
          Scroll horizontally to view the complete layout.
        </p>
        <div
          className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
          style={{ width: canvasWidth, height: canvasHeight }}
          role="group"
          aria-label={`${title} official worksheet layout`}
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-zone via-cell-fill to-zone" aria-hidden />
          <div className={cn("absolute inset-0 transition", muted && "opacity-30 saturate-50")}>{children}</div>
        </div>
      </div>

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
          Real-time data from PLC
        </span>
      </footer>
    </section>
  )
}
