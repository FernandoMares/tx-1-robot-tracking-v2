"use client"

import { TableCard } from "@/components/plant/table-card"
import { LEGEND, STATUS_META, formatClock } from "@/lib/status"
import type { TrackingSyncStatus } from "@/lib/tracking-api"
import type { PlantTable } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ZoneViewProps {
  title: string
  description: string
  tables: PlantTable[]
  updatedAt: Date | null
  selectedId: string | null
  onSelectTable: (table: PlantTable) => void
  showDemoData?: boolean
  liveBundleCount?: number | null
  liveSyncStatus?: TrackingSyncStatus
}

/** Single-zone screen used by the Stackers, Bundler, Bay 1 and Bay 2 tabs. */
export function ZoneView({
  title,
  description,
  tables,
  updatedAt,
  selectedId,
  onSelectTable,
  showDemoData = true,
  liveBundleCount = null,
  liveSyncStatus = "connecting",
}: ZoneViewProps) {
  const totalBundles = tables.reduce((sum, table) => sum + table.bundleCount, 0)
  const avgFill = tables.length
    ? Math.round(tables.reduce((sum, table) => sum + table.fillPct, 0) / tables.length)
    : 0

  return (
    <section className="flex flex-col rounded-xl border border-border bg-card" aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base leading-none font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="tabular text-xs text-muted-foreground">
          Last update: {updatedAt ? formatClock(updatedAt) : "Pending"}
        </span>
      </header>

      {showDemoData ? (
        <>
          <div className="grid gap-4 border-b border-border px-5 py-4 sm:grid-cols-3">
            {[
              { label: "Tables in zone", value: String(tables.length) },
              { label: "Bundles in zone", value: String(totalBundles) },
              { label: "Average fill", value: `${avgFill}%` },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1.5">
                <span className="kpi-label">{stat.label}</span>
                <span className="tabular text-2xl leading-none font-semibold text-foreground">{stat.value}</span>
              </div>
            ))}
          </div>

          {tables.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No tables in this zone match the active filters.
            </p>
          ) : (
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  showZoneLabel
                  selected={selectedId === table.id}
                  onSelect={onSelectTable}
                  className="min-h-[15rem]"
                />
              ))}
            </div>
          )}

          <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3">
            {LEGEND.map((item) => (
              <span key={item.status} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn("size-2 rounded-full", STATUS_META[item.status].dot)} aria-hidden />
                {item.label}
              </span>
            ))}
          </footer>
        </>
      ) : (
        <div className="flex min-h-[18rem] flex-col items-center justify-center gap-2 px-5 py-10 text-center">
          <span className="tabular text-4xl font-semibold text-foreground">
            {liveBundleCount ?? "—"}
          </span>
          <h3 className="text-sm font-semibold text-foreground">
            {liveSyncStatus === "live"
              ? "Active BUND tracking records"
              : liveBundleCount != null
                ? "Last known BUND tracking records"
                : "Waiting for BUND tracking records"}
          </h3>
          <p className="max-w-md text-sm text-muted-foreground">
            {liveSyncStatus === "live"
              ? "Records are being read from the API."
              : liveBundleCount != null
                ? "The API is not current, so this is the last valid snapshot."
                : "Waiting for the first valid API snapshot."} {" "}
            Visual placement stays hidden until each backend zone is approved against a schematic slot.
          </p>
        </div>
      )}
    </section>
  )
}
