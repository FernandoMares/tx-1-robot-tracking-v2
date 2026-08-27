"use client"

import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react"

import { TubeRack } from "@/components/plant/tube-rack"
import type { ZoneTrackedLoad } from "@/lib/zone-layout-data"
import { cn } from "@/lib/utils"

export interface DiagramPosition {
  left: number
  top: number
  width: number
}

export function TraceabilityPanel({
  load,
  left,
  top,
  width,
  muted,
}: DiagramPosition & { load: ZoneTrackedLoad; muted?: boolean }) {
  const rows = [
    `${load.kind} : ID # ${load.id}`,
    `Heat : ${load.heat}`,
    `WO : ${load.workOrder}`,
    ...(load.weight ? [`Weight : ${load.weight}`] : []),
    ...(load.lpn ? [`LPN : ${load.lpn}`] : []),
    ...(load.disposition ? [`Disposition : ${load.disposition}`] : []),
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
          key={`${index}-${row}`}
          className={cn(
            "block px-3 py-2 text-xs leading-4 font-semibold text-slate-800",
            index > 0 && "border-t border-emerald-900/20",
          )}
        >
          {row}
        </span>
      ))}
    </div>
  )
}

export function DiagramArrow({
  direction = "right",
  left,
  top,
  muted,
  size = 48,
}: {
  direction?: "right" | "down" | "up"
  left: number
  top: number
  muted?: boolean
  size?: number
}) {
  const Icon = direction === "down" ? ArrowDown : direction === "up" ? ArrowUp : ArrowRight
  return (
    <span
      className={cn("absolute z-10 flex items-center justify-center text-slate-900", muted && "opacity-35")}
      style={{ left, top, width: size, height: size }}
      aria-hidden
    >
      <Icon className="size-full" strokeWidth={3.5} />
    </span>
  )
}

export function EquipmentHeader({
  label,
  left,
  top,
  width,
  tone = "dark",
}: DiagramPosition & { label: string; tone?: "dark" | "scale" }) {
  return (
    <div
      className={cn(
        "absolute z-20 flex h-12 items-center justify-center rounded-sm px-3 text-center text-xs font-bold tracking-wide text-white uppercase shadow-sm",
        tone === "dark" ? "bg-slate-700" : "bg-slate-500",
      )}
      style={{ left, top, width }}
    >
      {label}
    </div>
  )
}

export function ModuleRack({
  title,
  modules,
  left,
  top,
  width,
  running,
  rackHeight = 96,
}: DiagramPosition & {
  title: string
  modules: string[]
  running: boolean
  rackHeight?: number
}) {
  return (
    <div className="absolute z-10" style={{ left, top, width }} role="group" aria-label={title}>
      <EquipmentHeader label={title} left={0} top={0} width={width} />
      <div
        className="absolute top-[3.75rem] left-0 grid w-full gap-6 px-2"
        style={{ gridTemplateColumns: `repeat(${modules.length}, minmax(0, 1fr))` }}
      >
        {modules.map((module) => (
          <span
            key={module}
            className="flex h-6 items-center justify-center rounded-[2px] bg-slate-700 text-[10px] font-bold text-white"
          >
            {module}
          </span>
        ))}
      </div>
      <TubeRack
        direction="right"
        running={running}
        label={`${title} rack`}
        className="absolute top-[5.25rem] left-0 w-full rounded-sm"
        style={{ height: rackHeight }}
      />
      <div
        className="absolute left-0 grid w-full gap-8 px-6"
        style={{
          top: 84 + rackHeight,
          gridTemplateColumns: `repeat(${modules.length}, minmax(0, 1fr))`,
        }}
        aria-hidden
      >
        {modules.map((module) => (
          <span key={module} className="mx-auto h-4 w-14 bg-slate-600" />
        ))}
      </div>
    </div>
  )
}
