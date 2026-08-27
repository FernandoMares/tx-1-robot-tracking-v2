"use client"

import { SchematicScreen } from "@/components/plant/schematic-screen"
import { TubeRack } from "@/components/plant/tube-rack"
import {
  DiagramArrow,
  ModuleRack,
  TraceabilityPanel,
} from "@/components/plant/zoom-schematic-primitives"
import { STACKERS_TRACKED_LOADS } from "@/lib/zone-layout-data"

interface StackersSchematicProps {
  updatedAt: Date
  live: boolean
  matchedIds: Set<string> | null
}

/** Detailed recreation of the official STACKERS worksheet. */
export function StackersSchematic({ updatedAt, live, matchedIds }: StackersSchematicProps) {
  const muted = Boolean(
    matchedIds && ["stk-a", "stk-b", "stk-c", "stk-d"].every((id) => !matchedIds.has(id)),
  )

  return (
    <SchematicScreen
      title="Stackers"
      description="Detailed flow from Stackers A-D through the stacker banders"
      updatedAt={updatedAt}
      live={live}
      canvasWidth={1280}
      canvasHeight={430}
      muted={muted}
    >
      <div className="absolute z-10" style={{ left: 48, top: 36, width: 500 }} role="group" aria-label="Stackers A through D">
        <div className="flex h-12 items-center justify-center rounded-t-sm bg-slate-700 text-xs font-bold tracking-wide text-white uppercase shadow-sm">
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
          running={live}
          label="Stacker output rack"
          className="absolute top-[6.5rem] left-0 h-[8.125rem] w-full rounded-sm"
        />
      </div>

      <DiagramArrow left={590} top={176} size={64} />

      <ModuleRack
        title="Stacker Banders"
        modules={["LMD 1", "LMD 2", "LMD 3"]}
        left={688}
        top={60}
        width={544}
        running={live}
        rackHeight={130}
      />

      <TraceabilityPanel
        load={STACKERS_TRACKED_LOADS.bundler501}
        left={178}
        top={300}
        width={240}
      />
      <TraceabilityPanel
        load={STACKERS_TRACKED_LOADS.bundler500}
        left={840}
        top={300}
        width={240}
      />
    </SchematicScreen>
  )
}
