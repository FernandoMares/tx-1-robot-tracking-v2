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

const SOURCE_ZONES = TRACKING_ZONES_BY_GROUP["stacker-source"]
const COMMON_LINE_ZONES = TRACKING_ZONES_BY_GROUP["stacker-line"]

const SOURCE_POSITIONS: PositionedZone[] = SOURCE_ZONES.map((zoneName, index) => ({
  zoneName,
  left: 60 + index * 150,
  top: 116,
  width: 140,
}))

// The API order is the process order. Increasing X renders the approved
// mirrored, left-to-right HMI orientation.
const COMMON_LINE_POSITIONS: PositionedZone[] = COMMON_LINE_ZONES.map((zoneName, index) => ({
  zoneName,
  left: 40 + index * 170,
  top: 310,
  width: 140,
  compact: true,
}))

const EXIT_POSITIONS = [
  { zoneName: "NCCT1", left: 890, top: 445, width: 140, compact: true },
  { zoneName: "NCCT2", left: 1060, top: 445, width: 140, compact: true },
  { zoneName: "IMRT1", left: 1230, top: 310, width: 140, compact: true },
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
      <section
        className="absolute rounded-lg border border-emerald-300 bg-emerald-50/25 shadow-sm"
        style={{ left: 40, top: 34, width: 630, height: 214 }}
        aria-label="Stacker source sections"
      />
      <EquipmentHeader label="STACKERS · SOURCE SECTIONS" left={60} top={52} width={590} />

      {SOURCE_POSITIONS.map((position) => (
        <ZoneSlot
          key={position.zoneName}
          position={position}
          bundlesByZone={bundlesByZone}
          hasSnapshot={hasSnapshot}
        />
      ))}

      <p
        className="absolute text-center text-[10px] text-slate-500"
        style={{ left: 60, top: 220, width: 590 }}
      >
        Four source sections feed the shared Stackers route
      </p>

      {/* The source group feeds one common left-to-right tracking route. */}
      <DiagramArrow direction="down" left={96} top={266} size={28} />
      <span
        className="absolute text-[10px] font-bold tracking-wide text-slate-500 uppercase"
        style={{ left: 132, top: 277 }}
      >
        Common roll-table flow
      </span>

      {COMMON_LINE_POSITIONS.map((position, index) => (
        <div key={position.zoneName}>
          <ZoneSlot position={position} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          {index > 0 && (
            <DiagramArrow
              direction="right"
              left={position.left - 27}
              top={332}
              size={24}
            />
          )}
        </div>
      ))}

      {/* SGRT1/2 feed the Bay 1 exits; SGRT2 continues to IMRT1 for Bay 2. */}
      <DiagramArrow direction="down" left={946} top={397} size={28} />
      <DiagramArrow direction="down" left={1116} top={397} size={28} />
      <DiagramArrow direction="right" left={1203} top={332} size={24} />

      <span
        className="absolute text-center text-[10px] font-bold tracking-wide text-slate-500 uppercase"
        style={{ left: 890, top: 424, width: 310 }}
      >
        Bay 1 exits
      </span>
      <span
        className="absolute text-center text-[10px] font-bold tracking-wide text-slate-500 uppercase"
        style={{ left: 1230, top: 286, width: 140 }}
      >
        Bay 2 handoff
      </span>
      {EXIT_POSITIONS.map((position) => (
        <ZoneSlot
          key={position.zoneName}
          position={position}
          bundlesByZone={bundlesByZone}
          hasSnapshot={hasSnapshot}
        />
      ))}

      {/* LMDs are equipment context only; they are not API tracking zones. */}
      <EquipmentHeader label="STACKER BANDERS" left={40} top={446} width={500} />
      <div
        className="absolute grid grid-cols-3 gap-3"
        style={{ left: 40, top: 506, width: 500 }}
        aria-label="Stacker bander equipment"
      >
        {["LMD 3", "LMD 2", "LMD 1"].map((label) => (
          <span
            key={label}
            className="flex h-7 items-center justify-center rounded-sm bg-slate-600 text-[10px] font-bold text-white"
          >
            {label}
          </span>
        ))}
      </div>
      <p
        className="absolute text-center text-[10px] text-slate-500"
        style={{ left: 40, top: 548, width: 500 }}
      >
        Equipment context · bundle position comes from the named zones above
      </p>
    </SchematicScreen>
  )
}
