"use client"

import { ArrowDown, ArrowRight } from "lucide-react"

import { RobotCard } from "@/components/plant/robot-card"
import { TubeRack, type TubeDirection } from "@/components/plant/tube-rack"
import { MAIN_TRACKED_LOADS, type TrackedLoad } from "@/lib/main-layout-data"
import { ROBOT_2 } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

interface MainSchematicProps {
  live: boolean
  matchedIds: Set<string> | null
}

interface PositionedProps {
  left: number
  top: number
  width: number
}

interface TraceabilityCardProps extends PositionedProps {
  load: TrackedLoad
  muted: boolean
}

function TraceabilityCard({
  load,
  muted,
  left,
  top,
  width,
}: TraceabilityCardProps) {
  const rows = [
    `${load.kind} : ID # ${load.id}`,
    `Heat : ${load.heat}`,
    `WO : ${load.workOrder}`,
    ...(load.weight ? [`Weight : ${load.weight}`] : []),
    ...(load.lpn ? [`LPN : ${load.lpn}`] : []),
  ]

  return (
    <div
      className={cn(
        "absolute z-20 overflow-hidden rounded-sm border border-emerald-900/25 bg-emerald-50 text-center shadow-sm",
        muted && "opacity-35 saturate-50",
      )}
      style={{ left, top, width }}
    >
      {rows.map((row, index) => (
        <span
          key={row}
          className={cn(
            "block px-2 py-1.5 text-[11px] leading-4 font-semibold text-slate-800",
            index > 0 && "border-t border-emerald-900/20",
          )}
        >
          {row}
        </span>
      ))}
    </div>
  )
}

function FlowArrow({
  direction = "right",
  left,
  top,
  muted,
}: {
  direction?: "right" | "down"
  left: number
  top: number
  muted?: boolean
}) {
  const Icon = direction === "right" ? ArrowRight : ArrowDown
  return (
    <span
      className={cn(
        "absolute z-10 flex size-10 items-center justify-center text-slate-800",
        muted && "opacity-35",
      )}
      style={{ left, top }}
      aria-hidden
    >
      <Icon className="size-9" strokeWidth={3.5} />
    </span>
  )
}

function ZoneMarker({ label, left, top }: { label: string; left: number; top: number }) {
  return (
    <span
      className="absolute z-30 rounded-sm bg-zone px-2.5 py-1 text-[10px] leading-none font-bold tracking-[0.08em] text-white uppercase shadow-sm"
      style={{ left, top }}
    >
      {label}
    </span>
  )
}

function BufferRack({
  left,
  top,
  width,
  height,
  direction = "right",
  running,
  empty,
  muted,
  label,
}: PositionedProps & {
  height: number
  direction?: TubeDirection
  running: boolean
  empty?: boolean
  muted?: boolean
  label: string
}) {
  return (
    <TubeRack
      direction={direction}
      running={running}
      empty={empty}
      muted={muted}
      label={label}
      className="absolute z-10 rounded-sm"
      style={{ left, top, width, height } as React.CSSProperties}
    />
  )
}

function ProcessStation({
  title,
  units,
  left,
  top,
  width,
  running,
  muted,
  label,
}: PositionedProps & {
  title: string
  units: string[]
  running: boolean
  muted?: boolean
  label: string
}) {
  return (
    <div
      className={cn("absolute z-10", muted && "opacity-35 saturate-50")}
      style={{ left, top, width }}
      role="group"
      aria-label={title}
    >
      <div className="flex h-9 items-center justify-center rounded-sm bg-slate-700 px-3 text-xs font-bold tracking-wide text-white uppercase shadow-sm">
        {title}
      </div>
      <div
        className="mt-2 grid gap-2 px-1"
        style={{ gridTemplateColumns: `repeat(${units.length}, minmax(0, 1fr))` }}
      >
        {units.map((unit) => (
          <span
            key={unit}
            className="flex h-5 items-center justify-center rounded-[2px] bg-slate-700 text-[10px] font-bold text-white"
          >
            {unit}
          </span>
        ))}
      </div>
      <TubeRack
        direction="right"
        running={running}
        label={label}
        className="mt-0 h-[4.5rem] rounded-sm"
      />
      <div
        className="mt-0 grid gap-8 px-4"
        style={{ gridTemplateColumns: `repeat(${units.length}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {units.map((unit) => (
          <span key={unit} className="mx-auto h-3 w-10 bg-slate-600" />
        ))}
      </div>
    </div>
  )
}

function StackerStation({
  left,
  top,
  width,
  running,
  muted,
}: PositionedProps & { running: boolean; muted?: boolean }) {
  return (
    <div
      className={cn("absolute z-10", muted && "opacity-35 saturate-50")}
      style={{ left, top, width }}
      role="group"
      aria-label="Stackers A through D"
    >
      <div className="flex h-8 items-center justify-center rounded-t-sm bg-slate-700 text-xs font-bold tracking-wide text-white uppercase">
        Stackers
      </div>
      <div className="grid h-9 grid-cols-4 border-x border-b border-slate-300 bg-white">
        {["A", "B", "C", "D"].map((stacker) => (
          <span
            key={stacker}
            className="flex items-center justify-center border-r border-slate-300 text-sm font-semibold text-slate-700 last:border-r-0"
          >
            {stacker}
          </span>
        ))}
      </div>
      <TubeRack
        direction="right"
        running={running}
        label="Stacker output rack"
        className="mt-5 h-[4.5rem] rounded-sm"
      />
    </div>
  )
}

function ScaleStation({
  left,
  top,
  width,
  muted,
}: PositionedProps & { muted?: boolean }) {
  return (
    <div
      className={cn("absolute z-10", muted && "opacity-35 saturate-50")}
      style={{ left, top, width }}
      role="group"
      aria-label="Scale weight station"
    >
      <div className="flex h-10 items-center justify-center rounded-sm bg-slate-500 px-1 text-center text-[10px] leading-3 font-bold text-white uppercase shadow-sm">
        Scale Weight Station
      </div>
      <div className="belt-ticks mt-3 h-[4.5rem] rounded-sm border border-slate-400 bg-slate-200" aria-hidden />
    </div>
  )
}

/** Fixed-coordinate recreation of the workbook's Main sheet. */
export function MainSchematic({
  live,
  matchedIds,
}: MainSchematicProps) {
  // Main shows physical zones, so a table filter keeps its complete shared
  // production cell visible instead of implying that a traced load is a table.
  const groupMuted = (ids: string[]) => Boolean(matchedIds && ids.every((id) => !matchedIds.has(id)))

  const upperMuted = groupMuted(["bundler-1"])
  const stackersMuted = groupMuted(["stk-a", "stk-b", "stk-c", "stk-d"])
  const bay1Muted = groupMuted(["bay1-t1", "bay1-t2"])
  const bay2Muted = groupMuted(["bay2-t3"])

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      style={{ width: 1508, height: 680 }}
      role="group"
      aria-label="Official Main production layout with two lines feeding Bay 2 and Robot 2"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-zone via-cell-fill to-zone" aria-hidden />

      {/* Upper production line: bundlers, LMD 1-4 and scale. */}
      <TraceabilityCard
        load={MAIN_TRACKED_LOADS.bundler505}
        muted={upperMuted}
        left={340}
        top={92}
        width={225}
      />
      <BufferRack
        left={340}
        top={208}
        width={270}
        height={72}
        running={live}
        muted={upperMuted}
        label="Bundler input rack"
      />
      <FlowArrow left={611} top={224} muted={upperMuted} />
      <ProcessStation
        title="Bund Bundlers"
        units={["LMD 1", "LMD 2", "LMD 3", "LMD 4"]}
        left={656}
        top={151}
        width={340}
        running={live}
        muted={upperMuted}
        label="Bund bundlers output rack"
      />
      <TraceabilityCard
        load={MAIN_TRACKED_LOADS.bundler504}
        muted={upperMuted}
        left={710}
        top={306}
        width={200}
      />
      <FlowArrow left={997} top={224} muted={upperMuted} />
      <ScaleStation left={1025} top={168} width={115} muted={upperMuted} />
      <FlowArrow left={1123} top={224} muted={upperMuted || bay2Muted} />

      {/* The tall Bay 2 rack receives both production lines and travels up. */}
      <ZoneMarker label="Bay 2" left={1165} top={8} />
      <BufferRack
        left={1165}
        top={24}
        width={180}
        height={462}
        direction="up"
        running={live}
        muted={bay2Muted}
        label="Bay 2 vertical rack"
      />
      <div className={cn("absolute z-20", bay2Muted && "opacity-35 saturate-50")} style={{ left: 1362, top: 35 }}>
        <RobotCard robot={ROBOT_2} className="h-[9.75rem] w-[7.25rem] bg-white/95" />
      </div>
      <TraceabilityCard
        load={MAIN_TRACKED_LOADS.bundle497}
        muted={bay2Muted}
        left={1355}
        top={216}
        width={145}
      />

      {/* Lower production line: stackers, banders, scale and down branch. */}
      <StackerStation left={20} top={354} width={286} running={live} muted={stackersMuted} />
      <TraceabilityCard
        load={MAIN_TRACKED_LOADS.bundler501}
        muted={stackersMuted}
        left={136}
        top={533}
        width={170}
      />
      <FlowArrow left={307} top={435} muted={stackersMuted} />
      <ProcessStation
        title="Stacker Banders"
        units={["LMD 1", "LMD 2", "LMD 3"]}
        left={354}
        top={354}
        width={310}
        running={live}
        muted={stackersMuted}
        label="Stacker banders output rack"
      />
      <TraceabilityCard
        load={MAIN_TRACKED_LOADS.bundler500}
        muted={stackersMuted}
        left={395}
        top={533}
        width={225}
      />
      <FlowArrow left={665} top={435} muted={stackersMuted} />
      <BufferRack
        left={710}
        top={421}
        width={165}
        height={72}
        running={live}
        empty
        muted={bay1Muted}
        label="Bay 1 transfer rack"
      />
      <FlowArrow left={876} top={435} muted={bay1Muted} />
      <ScaleStation left={920} top={372} width={180} muted={bay1Muted} />
      <FlowArrow left={1104} top={435} muted={bay1Muted || bay2Muted} />

      <ZoneMarker label="Bay 1" left={920} top={507} />
      <FlowArrow direction="down" left={990} top={493} muted={bay1Muted} />
      <BufferRack
        left={920}
        top={530}
        width={180}
        height={135}
        direction="down"
        running={live}
        muted={bay1Muted}
        label="Bay 1 down rack"
      />
      <TraceabilityCard
        load={MAIN_TRACKED_LOADS.bundle499}
        muted={bay1Muted}
        left={1120}
        top={526}
        width={155}
      />
    </div>
  )
}
