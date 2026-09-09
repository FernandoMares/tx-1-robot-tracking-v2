"use client"

import { SchematicScreen } from "@/components/plant/schematic-screen"
import { TrackingZoneSlot } from "@/components/plant/tracking-zone-slot"
import {
  DiagramArrow,
  EquipmentHeader,
} from "@/components/plant/zoom-schematic-primitives"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import {
  TRACKING_ZONES_BY_GROUP,
  TRACKING_ZONES_BY_SCREEN,
  type BundlesByZone,
  type TrackingZoneName,
} from "@/lib/tracking-zone-layout"

interface StackersSchematicProps {
  updatedAt: Date | null
  animationRunning: boolean
  matchedIds: Set<string> | null
  tracking: TrackingRuntimeState
  /** Shared CurrentZone grouping from the single dashboard polling loop. */
  bundlesByZone: BundlesByZone
}

interface PositionedZone {
  zoneName: TrackingZoneName
  left: number
  top: number
  width?: number
  compact?: boolean
}

const SOURCE_ZONES = [...TRACKING_ZONES_BY_GROUP["stacker-source"]].reverse()
const COMMON_LINE_ZONES = TRACKING_ZONES_BY_GROUP["stacker-line"]
const HANDOFF_ZONES = TRACKING_ZONES_BY_SCREEN.stackers.filter(
  (zoneName) => !SOURCE_ZONES.includes(zoneName) && !COMMON_LINE_ZONES.includes(zoneName),
)

const SOURCE_POSITIONS: PositionedZone[] = SOURCE_ZONES.map((zoneName, index) => ({
  zoneName,
  left: 870 + index * 130,
  top: 104,
  width: 120,
}))

// The API order is the process order. Decreasing X turns it into the physical
// right-to-left flow shown in Tracking Sections Overview.
const COMMON_LINE_POSITIONS: PositionedZone[] = COMMON_LINE_ZONES.map((zoneName, index) => ({
  zoneName,
  left: 1260 - index * 145,
  top: 300,
  width: 120,
  compact: true,
}))

const HANDOFF_POSITIONS = [
  { zoneName: HANDOFF_ZONES[0], left: 42, top: 142, width: 128, compact: true },
  { zoneName: HANDOFF_ZONES[1], left: 42, top: 300, width: 128, compact: true },
  { zoneName: HANDOFF_ZONES[2], left: 42, top: 458, width: 128, compact: true },
] satisfies PositionedZone[]

function ZoneSlot({
  position,
  bundlesByZone,
  hasSnapshot,
}: {
  position: PositionedZone
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
}) {
  return (
    <TrackingZoneSlot
      zoneName={position.zoneName}
      bundles={bundlesByZone[position.zoneName]}
      compact={position.compact}
      hasSnapshot={hasSnapshot}
      className="absolute z-20"
      style={{ left: position.left, top: position.top, width: position.width }}
    />
  )
}

/** Live zone-level rendering of the official STK tracking sections. */
export function StackersSchematic({
  updatedAt,
  animationRunning,
  matchedIds,
  tracking,
  bundlesByZone,
}: StackersSchematicProps) {
  const muted = Boolean(
    matchedIds && ["stk-a", "stk-b", "stk-c", "stk-d"].every((id) => !matchedIds.has(id)),
  )
  const hasSnapshot = tracking.mode === "mock" || tracking.trackingState !== null
  return (
    <SchematicScreen
      title="Stackers"
      description="STK source sections, common roll-table path and Bay handoffs"
      updatedAt={updatedAt}
      animationRunning={animationRunning}
      tracking={tracking}
      canvasWidth={1440}
      canvasHeight={620}
      muted={muted}
    >
      <EquipmentHeader label="STACKERS · SOURCE SECTIONS" left={870} top={34} width={510} />

      {SOURCE_POSITIONS.map((position) => (
        <ZoneSlot
          key={position.zoneName}
          position={position}
          bundlesByZone={bundlesByZone}
          hasSnapshot={hasSnapshot}
        />
      ))}

      {/* The four source sections converge on the common STK path. */}
      <div className="absolute top-[205px] left-[930px] h-7 w-[390px] border-t border-slate-400" aria-hidden />
      {SOURCE_POSITIONS.map((position) => (
        <span
          key={`${position.zoneName}-source-connector`}
          className="absolute top-[198px] h-8 border-l border-slate-400"
          style={{ left: position.left + 60 }}
          aria-hidden
        />
      ))}
      <DiagramArrow direction="down" left={1299} top={218} size={42} />

      {COMMON_LINE_POSITIONS.map((position, index) => (
        <div key={position.zoneName}>
          <ZoneSlot position={position} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          {index > 0 && (
            <DiagramArrow
              direction="left"
              left={position.left + 120}
              top={322}
              size={25}
            />
          )}
        </div>
      ))}

      {/* SGRT2 fans out to the two Bay 1 sections and the Bay 2 handoff. */}
      <div className="absolute top-[181px] left-[216px] h-[344px] border-l border-slate-400" aria-hidden />
      <div className="absolute top-[340px] left-[216px] w-[174px] border-t border-slate-400" aria-hidden />
      <DiagramArrow direction="left" left={170} top={321} size={46} />
      <DiagramArrow direction="up" left={193} top={222} size={46} />
      <DiagramArrow direction="left" left={170} top={163} size={46} />
      <DiagramArrow direction="down" left={193} top={385} size={46} />
      <DiagramArrow direction="left" left={170} top={479} size={46} />

      <span className="absolute top-[112px] left-[42px] text-[10px] font-bold tracking-wide text-slate-500 uppercase">
        Bay 1 exits
      </span>
      <span className="absolute top-[428px] left-[42px] text-[10px] font-bold tracking-wide text-slate-500 uppercase">
        Bay 2 handoff
      </span>
      {HANDOFF_POSITIONS.map((position) => (
        <ZoneSlot
          key={position.zoneName}
          position={position}
          bundlesByZone={bundlesByZone}
          hasSnapshot={hasSnapshot}
        />
      ))}

      {/* LMDs are equipment context only; they are not API tracking zones. */}
      <EquipmentHeader label="STACKER BANDERS" left={955} top={446} width={330} />
      <div className="absolute top-[506px] left-[955px] grid w-[330px] grid-cols-3 gap-3" aria-label="Stacker bander equipment">
        {["LMD 1", "LMD 2", "LMD 3"].map((label) => (
          <span
            key={label}
            className="flex h-7 items-center justify-center rounded-sm bg-slate-600 text-[10px] font-bold text-white"
          >
            {label}
          </span>
        ))}
      </div>
      <p className="absolute top-[548px] left-[955px] w-[330px] text-center text-[10px] text-slate-500">
        Equipment context · bundle position comes from the named zones above
      </p>
    </SchematicScreen>
  )
}
