"use client"

import { SchematicScreen } from "@/components/plant/schematic-screen"
import { TubeRack } from "@/components/plant/tube-rack"
import {
  DiagramArrow,
  EquipmentHeader,
  TraceabilityPanel,
} from "@/components/plant/zoom-schematic-primitives"
import { BAY_1_TRACKED_LOADS } from "@/lib/zone-layout-data"

interface BayOneSchematicProps {
  updatedAt: Date
  live: boolean
  matchedIds: Set<string> | null
}

interface StkBundStationProps {
  left: number
  top: number
  width: number
  running: boolean
}

/** STK BUND is drawn with three unlabelled machine pads in the workbook. */
function StkBundStation({
  left,
  top,
  width,
  running,
}: StkBundStationProps) {
  return (
    <div
      className="absolute z-10"
      style={{ left, top, width }}
      role="group"
      aria-label="STK BUND"
    >
      <EquipmentHeader label="STK BUND" left={0} top={0} width={width} />

      <div className="absolute top-[3.75rem] left-0 grid w-full grid-cols-3 gap-8 px-6" aria-hidden>
        {Array.from({ length: 3 }, (_, index) => (
          <span key={index} className="h-6 rounded-[2px] bg-slate-700" />
        ))}
      </div>

      <TubeRack
        direction="right"
        running={running}
        label="STK BUND rack"
        className="absolute top-[5.25rem] left-0 w-full rounded-sm"
        style={{ height: 116 }}
      />

      <div className="absolute top-[12.5rem] left-0 grid w-full grid-cols-3 gap-8 px-8" aria-hidden>
        {Array.from({ length: 3 }, (_, index) => (
          <span key={index} className="mx-auto h-4 w-16 bg-slate-600" />
        ))}
      </div>
    </div>
  )
}

/** Detailed recreation of the official BAY 1 worksheet. */
export function BayOneSchematic({ updatedAt, live, matchedIds }: BayOneSchematicProps) {
  const muted = Boolean(matchedIds && ["bay1-t1", "bay1-t2"].every((id) => !matchedIds.has(id)))

  return (
    <SchematicScreen
      title="Bay 1"
      description="Detailed flow through STK BUND and the scale weight station"
      updatedAt={updatedAt}
      live={live}
      canvasWidth={1500}
      canvasHeight={560}
      muted={muted}
    >
      <TubeRack
        direction="right"
        running={live}
        label="Bay 1 entry rack"
        className="absolute top-[180px] left-10 h-[116px] w-[250px] rounded-sm"
      />
      <DiagramArrow left={304} top={206} size={64} />

      <StkBundStation left={384} top={96} width={370} running={live} />
      <DiagramArrow left={765} top={206} size={64} />

      <TubeRack
        direction="right"
        running={live}
        empty
        label="Bay 1 transfer rack"
        className="absolute top-[180px] left-[840px] h-[116px] w-[200px] rounded-sm"
      />
      <DiagramArrow left={1047} top={206} size={64} />

      <EquipmentHeader
        label="SCALE WEIGHT STATION"
        left={1120}
        top={96}
        width={210}
        tone="scale"
      />
      <TubeRack
        direction="down"
        running={live}
        label="Bay 1 scale output rack"
        className="absolute top-[180px] left-[1120px] h-[344px] w-[210px] rounded-sm"
      />
      <DiagramArrow direction="down" left={1197} top={365} size={56} />

      <TraceabilityPanel
        load={BAY_1_TRACKED_LOADS.bundle500}
        left={50}
        top={348}
        width={240}
      />
      <TraceabilityPanel
        load={BAY_1_TRACKED_LOADS.bundle499}
        left={450}
        top={348}
        width={240}
      />
      <TraceabilityPanel
        load={BAY_1_TRACKED_LOADS.bundle498}
        left={1340}
        top={252}
        width={146}
      />
    </SchematicScreen>
  )
}
