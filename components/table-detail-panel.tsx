"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { STATUS_META } from "@/lib/status"
import type { PlantTable } from "@/lib/types"
import { cn } from "@/lib/utils"

interface TableDetailPanelProps {
  table: PlantTable | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TableDetailPanel({ table, open, onOpenChange }: TableDetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        {table && (
          <>
            <SheetHeader className="gap-1.5 border-b border-border px-5 py-4 text-left">
              <span className="zone-caption">{table.zoneLabel}</span>
              <SheetTitle className="text-xl">{table.name}</SheetTitle>
              <SheetDescription>
                {table.bundleCount} bundles · {table.fillPct}% full
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-5 py-5">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
                <span className="text-sm text-muted-foreground">Current status</span>
                <span
                  className={cn("flex items-center gap-2 text-sm font-medium", STATUS_META[table.status].text)}
                >
                  <span className={cn("size-2 rounded-full", STATUS_META[table.status].dot)} aria-hidden />
                  {STATUS_META[table.status].label}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-4">
                {[
                  ["Bundles", String(table.bundleCount)],
                  ["Fill", `${table.fillPct}%`],
                  ["Positions", String(table.rows * table.columns)],
                  ["Zone", table.zoneLabel],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-1.5">
                    <dt className="kpi-label">{label}</dt>
                    <dd className="tabular text-lg leading-none font-semibold text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-col gap-2">
                <span className="kpi-label">Position map</span>
                <div
                  className="grid gap-1.5 rounded-lg border border-border bg-muted/40 p-3"
                  style={{ gridTemplateColumns: `repeat(${table.columns}, minmax(0, 1fr))` }}
                  aria-hidden
                >
                  {Array.from({ length: table.rows * table.columns }, (_, index) => (
                    <span
                      key={index}
                      className={cn(
                        "h-3 rounded-[3px]",
                        index < Math.round((table.fillPct / 100) * table.rows * table.columns)
                          ? "bg-cell-fill"
                          : "bg-cell-empty",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
