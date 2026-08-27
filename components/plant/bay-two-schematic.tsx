"use client"

import { RobotCard } from "@/components/plant/robot-card"
import { SchematicScreen } from "@/components/plant/schematic-screen"
import { TubeRack } from "@/components/plant/tube-rack"
import {
  DiagramArrow,
  EquipmentHeader,
  TraceabilityPanel,
} from "@/components/plant/zoom-schematic-primitives"
import { ROBOT_2 } from "@/lib/mock-data"
import { BAY_2_TRACKED_LOADS } from "@/lib/zone-layout-data"

interface BayTwoSchematicProps {
  updatedAt: Date
  live: boolean
  matchedIds: Set<string> | null
}

/** Detailed recreation of the workbook's BAY 2 worksheet. */
export function BayTwoSchematic({ updatedAt, live, matchedIds }: BayTwoSchematicProps) {
  const muted = Boolean(matchedIds && !matchedIds.has("bay2-t3"))

  return (
    <SchematicScreen
      title="Bay 2"
      description="Bundler transfers, weighing station and Robot 2 output"
      updatedAt={updatedAt}
      live={live}
      canvasWidth={1400}
      canvasHeight={760}
      muted={muted}
    >
      {/* The central storage cell receives both transfers and carries them up. */}
      <TubeRack
        direction="up"
        running={live}
        label="Bay 2 vertical transfer rack"
        className="absolute z-10 rounded-sm"
        style={{ left: 480, top: 52, width: 440, height: 530 }}
      />
      <DiagramArrow direction="up" left={676} top={300} size={48} />

      {/* Mid-level feed from the bundler station. */}
      <EquipmentHeader
        label="Station : Bundler Bund"
        left={44}
        top={184}
        width={300}
      />
      <TubeRack
        direction="right"
        running={live}
        label="Bundler station incoming rack"
        className="absolute z-10 rounded-sm"
        style={{ left: 44, top: 250, width: 380, height: 96 }}
      />
      <DiagramArrow left={430} top={274} size={48} />
      <TraceabilityPanel
        load={BAY_2_TRACKED_LOADS.incoming498}
        left={220}
        top={62}
        width={220}
      />

      {/* Lower feed from the scale enters the same vertical transfer cell. */}
      <EquipmentHeader
        label="Scale Weight Station"
        left={44}
        top={420}
        width={300}
        tone="scale"
      />
      <TubeRack
        direction="right"
        running={live}
        label="Scale weight station output rack"
        className="absolute z-10 rounded-sm"
        style={{ left: 44, top: 480, width: 380, height: 96 }}
      />
      <DiagramArrow left={430} top={504} size={48} />

      {/* Robot and currently tracked bundle at the upper output. */}
      <div className="absolute z-20" style={{ left: 970, top: 52 }}>
        <RobotCard robot={ROBOT_2} className="h-[11rem] w-[9rem] bg-white/95" />
      </div>
      <TraceabilityPanel
        load={BAY_2_TRACKED_LOADS.bundle497}
        left={1138}
        top={52}
        width={230}
      />

      {/* Finished locations shown below the shared Bay 2 rack. */}
      <TraceabilityPanel
        load={BAY_2_TRACKED_LOADS.output499}
        left={44}
        top={604}
        width={260}
      />
      <TraceabilityPanel
        load={BAY_2_TRACKED_LOADS.output498}
        left={550}
        top={604}
        width={310}
      />
    </SchematicScreen>
  )
}
