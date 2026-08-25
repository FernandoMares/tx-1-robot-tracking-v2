"use client"

import { ArrowDown, ArrowRight, Network } from "lucide-react"

import { ConveyorBelt } from "@/components/plant/conveyor-belt"
import { RobotCard } from "@/components/plant/robot-card"
import { TableCard } from "@/components/plant/table-card"
import { LEGEND, STATUS_META, formatClock } from "@/lib/status"
import { ROBOT_1, ROBOT_2 } from "@/lib/mock-data"
import type { PlantTable } from "@/lib/types"
import { cn } from "@/lib/utils"

interface PlantMapProps {
  tables: PlantTable[]
  updatedAt: Date
  live: boolean
  selectedId: string | null
  onSelectTable: (table: PlantTable) => void
  /** Ids passing the active filters, or null when no filter is set. */
  matchedIds: Set<string> | null
}

/**
 * Column template shared by the entry row and the upper band. Keeping one
 * definition is what lets the entry belt stop exactly at the Bundler edge.
 */
const UPPER_COLS = "xl:grid-cols-[minmax(0,2.75fr)_minmax(0,0.58fr)_minmax(0,0.55fr)_minmax(0,0.68fr)]"

/** Uppercase caption used above a group of tables. */
function ZoneHeading({ children }: { children: string }) {
  return <span className="zone-caption">{children}</span>
}

export function PlantMap({
  tables,
  updatedAt,
  live,
  selectedId,
  onSelectTable,
  matchedIds,
}: PlantMapProps) {
  const table = (id: string) => tables.find((t) => t.id === id)
  // The map always draws the full plant; filtered-out tables are dimmed.
  const isMuted = (id: string) => (matchedIds ? !matchedIds.has(id) : false)

  const stackers = tables.filter((t) => t.zone === "stackers")
  const bundler = table("bundler-1")
  const bay2 = table("bay2-t3")
  const bay1a = table("bay1-t1")
  const bay1b = table("bay1-t2")

  return (
    <section className="flex flex-col rounded-xl border border-border bg-card" aria-label="Plant overview">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base leading-none font-semibold text-foreground">Plant Overview</h2>
          <p className="text-sm text-muted-foreground">
            {matchedIds
              ? `${matchedIds.size} of ${tables.length} tables match the active filters`
              : "Real-time status of every table in the plant"}
          </p>
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

      {/* Canvas */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-canvas m-4 p-4 lg:p-5">
        {/* Entry row. The belt spans the stackers and bundler columns. */}
        <div className={cn("grid items-center gap-4", UPPER_COLS)}>
          <div className="flex items-center gap-3 xl:col-span-2">
            <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground">ENTRY</span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.5} aria-hidden />
            <ConveyorBelt running={live} className="flex-1" />
          </div>
        </div>

        {/* Upper band: stackers group, bundler, robot 2, bay 2 */}
        <div className={cn("grid items-start gap-4", UPPER_COLS)}>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
            <ZoneHeading>Stackers</ZoneHeading>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {stackers.map((item) => (
                <TableCard
                  key={item.id}
                  table={item}
                  muted={isMuted(item.id)}
                  selected={selectedId === item.id}
                  onSelect={onSelectTable}
                  className="min-h-[13rem]"
                />
              ))}
            </div>
          </div>

          {bundler && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
              <ZoneHeading>Bundler</ZoneHeading>
              <TableCard
                table={bundler}
                muted={isMuted(bundler.id)}
                selected={selectedId === bundler.id}
                onSelect={onSelectTable}
                className="min-h-[13rem] border-transparent p-0 hover:shadow-none"
              />
            </div>
          )}

          {/* Robot 2 sits above the belt that carries bundles to Bay 2. */}
          <div className="flex flex-col gap-3">
            <RobotCard robot={ROBOT_2} />
            <ConveyorBelt running={live} />
          </div>

          {bay2 && (
            <TableCard
              table={bay2}
              showZoneLabel
              muted={isMuted(bay2.id)}
              selected={selectedId === bay2.id}
              onSelect={onSelectTable}
              className="min-h-[15rem]"
            />
          )}
        </div>

        {/* Cross conveyor */}
        <div className="flex flex-col gap-1.5">
          <span className="zone-caption self-center">Cross conveyor</span>
          <ConveyorBelt showTailArrow running={live} />
          <div className="flex items-start justify-between px-8" aria-hidden>
            <ArrowDown className="size-4 text-muted-foreground" strokeWidth={2.5} />
            <ArrowDown className="size-4 text-muted-foreground" strokeWidth={2.5} />
          </div>
        </div>

        {/* Lower band: bay 1 table, robot 1, bay 1 table */}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)_minmax(0,1fr)]">
          {bay1a && (
            <TableCard
              table={bay1a}
              showZoneLabel
              muted={isMuted(bay1a.id)}
              selected={selectedId === bay1a.id}
              onSelect={onSelectTable}
              className="min-h-[13rem]"
            />
          )}

          <div className="flex flex-col gap-3">
            <RobotCard robot={ROBOT_1} />
            <ConveyorBelt running={live} />
          </div>

          {bay1b && (
            <TableCard
              table={bay1b}
              showZoneLabel
              muted={isMuted(bay1b.id)}
              selected={selectedId === bay1b.id}
              onSelect={onSelectTable}
              className="min-h-[13rem]"
            />
          )}
        </div>
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
          Real-time data from PLC
        </span>
      </footer>
    </section>
  )
}
