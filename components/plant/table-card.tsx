"use client"

import { cn } from "@/lib/utils"
import { STATUS_META } from "@/lib/status"
import type { PlantTable } from "@/lib/types"

interface TableCardProps {
  table: PlantTable
  /** Renders the uppercase blue zone caption inside the card. */
  showZoneLabel?: boolean
  /** Omits the repeated table name when the zone caption is the visual title. */
  hideName?: boolean
  /** Dimmed because active filters exclude this table. */
  muted?: boolean
  selected?: boolean
  onSelect?: (table: PlantTable) => void
  className?: string
}

/**
 * One table (mesa). The cell grid is the primary read: filled cells are
 * derived from `fillPct` so the grid and the corner percentage always agree.
 */
export function TableCard({
  table,
  showZoneLabel,
  hideName,
  muted,
  selected,
  onSelect,
  className,
}: TableCardProps) {
  const meta = STATUS_META[table.status]
  const total = table.rows * table.columns
  const filled = Math.round((table.fillPct / 100) * total)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(table)}
      aria-label={`${table.zoneLabel} ${table.name}, ${table.bundleCount} bundles, ${table.fillPct}% full, ${meta.label}`}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-3 text-left transition",
        "hover:border-ring/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected ? "border-ring ring-2 ring-ring/25" : "border-border",
        muted && "opacity-35 saturate-50",
        className,
      )}
    >
      {showZoneLabel && <span className="zone-caption">{table.zoneLabel}</span>}

      {!hideName && <span className="text-lg leading-none font-semibold text-foreground">{table.name}</span>}

      <div className="flex items-center justify-between gap-1.5">
        <span className="text-xs whitespace-nowrap text-muted-foreground">{table.bundleCount} bundles</span>
        <span className={cn("flex shrink-0 items-center gap-1 text-xs font-medium whitespace-nowrap", meta.text)}>
          <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
          {meta.label}
        </span>
      </div>

      <div
        className="grid flex-1 content-start gap-1"
        style={{ gridTemplateColumns: `repeat(${table.columns}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {Array.from({ length: total }, (_, index) => {
          const isFilled = index < filled
          // The warning table shows its misaligned bundle in amber.
          const isFlagged = table.status === "warning" && index === filled - 1
          return (
            <span
              key={index}
              className={cn(
                "h-2 rounded-[2px] transition-colors duration-500",
                isFlagged ? "bg-warning" : isFilled ? "bg-cell-fill" : "bg-cell-empty",
              )}
            />
          )
        })}
      </div>

      <span className="tabular self-end text-xs font-semibold text-muted-foreground">{table.fillPct}%</span>
    </button>
  )
}
