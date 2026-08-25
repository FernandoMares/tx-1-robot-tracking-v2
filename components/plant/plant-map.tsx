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

      {/*
       * The floor plan deliberately keeps a minimum width. Reflowing these
       * nodes would break the physical routes, so smaller screens scroll the
       * complete mockup horizontally instead.
       */}
      <div
        className="overflow-x-auto overscroll-x-contain p-4"
        tabIndex={0}
        aria-label="Scrollable plant floor diagram"
      >
        <div className="relative min-w-[73rem] rounded-lg border border-border bg-canvas p-4 lg:p-5">
          <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] grid-rows-[auto_auto_auto_auto] gap-x-3 gap-y-5">
            {/* Entry belt stops at the far edge of the bundler. */}
            <div className="col-[1/9] row-[1] flex items-center gap-3">
              <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground">ENTRY</span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.5} aria-hidden />
              <ConveyorBelt running={live} className="flex-1" />
            </div>

            {/* Upper process line. */}
            <div className="col-[1/7] row-[2] flex h-[14.5rem] flex-col gap-3 rounded-lg border border-border bg-card p-3">
              <ZoneHeading>Stackers</ZoneHeading>
              <div className="grid min-h-0 flex-1 grid-cols-4 gap-2.5">
                {stackers.map((item) => (
                  <TableCard
                    key={item.id}
                    table={item}
                    muted={isMuted(item.id)}
                    selected={selectedId === item.id}
                    onSelect={onSelectTable}
                    className="h-full min-w-0 gap-2.5 p-2.5"
                  />
                ))}
              </div>
            </div>

            {bundler && (
              <div className="col-[7/9] row-[2] flex h-[14.5rem] flex-col gap-3 rounded-lg border border-border bg-card p-3">
                <ZoneHeading>Bundler</ZoneHeading>
                <TableCard
                  table={bundler}
                  hideName
                  muted={isMuted(bundler.id)}
                  selected={selectedId === bundler.id}
                  onSelect={onSelectTable}
                  className="min-h-0 flex-1 gap-2.5 border-transparent p-0 hover:shadow-none"
                />
              </div>
            )}

            <div className="col-[9/12] row-[2] flex h-[14.5rem] flex-col justify-between gap-3">
              <RobotCard robot={ROBOT_2} className="mx-auto h-[10.5rem] w-36" />
              <ConveyorBelt running={live} />
            </div>

            {bay2 && (
              <TableCard
                table={bay2}
                showZoneLabel
                hideName
                muted={isMuted(bay2.id)}
                selected={selectedId === bay2.id}
                onSelect={onSelectTable}
                className="col-[12/15] row-[2] h-[14.5rem] gap-2.5 p-4"
              />
            )}

            {/* The central conveyor is the spine of the lower process. */}
            <div className="relative col-[1/-1] row-[3] pt-4">
              <span className="zone-caption absolute top-0 left-1/2 -translate-x-1/2">Cross conveyor</span>
              <ConveyorBelt
                direction="left"
                showStartArrow
                showEndArrow={false}
                running={live}
              />
              <span
                className="absolute top-full left-[11.5%] h-9 border-l border-border"
                aria-hidden
              >
                <ArrowDown
                  className="absolute -bottom-1 -left-2 size-4 text-muted-foreground"
                  strokeWidth={2.5}
                />
              </span>
            </div>

            {/* Lower line: two Bay 1 tables fed through Robot 1. */}
            {bay1a && (
              <TableCard
                table={bay1a}
                showZoneLabel
                hideName
                muted={isMuted(bay1a.id)}
                selected={selectedId === bay1a.id}
                onSelect={onSelectTable}
                className="col-[1/4] row-[4] h-[13rem] gap-2.5 p-4"
              />
            )}

            <ConveyorBelt
              direction="left"
              showStartArrow
              showEndArrow={false}
              running={live}
              className="col-[4/7] row-[4] self-center"
            />

            <RobotCard
              robot={ROBOT_1}
              className="col-[7/9] row-[4] h-40 self-center"
            />

            <ConveyorBelt
              running={live}
              className="col-[9/12] row-[4] self-center"
            />

            {bay1b && (
              <TableCard
                table={bay1b}
                showZoneLabel
                hideName
                muted={isMuted(bay1b.id)}
                selected={selectedId === bay1b.id}
                onSelect={onSelectTable}
                className="col-[12/15] row-[4] h-[13rem] gap-2.5 p-4"
              />
            )}
          </div>
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
