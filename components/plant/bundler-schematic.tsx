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

interface BundlerSchematicProps {
  updatedAt: Date | null
  animationRunning: boolean
  matchedIds?: Set<string> | null
  tracking: TrackingRuntimeState
  /** Shared CurrentZone grouping from the single dashboard polling loop. */
  bundlesByZone: BundlesByZone
}

interface PositionedZone {
  zoneName: TrackingZoneName
  left: number
  top: number
  width: number
  compact?: boolean
}

const SOURCE_ZONES = TRACKING_ZONES_BY_GROUP["bundler-source"]
const COMMON_LINE_ZONES = TRACKING_ZONES_BY_GROUP["bundler-line"]

const SOURCE_POSITIONS: PositionedZone[] = SOURCE_ZONES.map((zoneName, index) => ({
  zoneName,
  left: 40 + index * 140,
  top: 140,
  width: 130,
}))

const COMMON_LINE_POSITIONS: PositionedZone[] = COMMON_LINE_ZONES.map((zoneName, index) => ({
  zoneName,
  left: 700 + index * 240,
  top: 150,
  width: 180,
  compact: true,
}))

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

/** Live zone-level rendering of the official BUND tracking sections. */
export function BundlerSchematic({
  updatedAt,
  animationRunning,
  matchedIds = null,
  tracking,
  bundlesByZone,
}: BundlerSchematicProps) {
  const muted = Boolean(matchedIds && !matchedIds.has("bundler-1"))
  const hasSnapshot = tracking.mode === "mock" || tracking.trackingState !== null
  return (
    <SchematicScreen
      title="Bundler"
      description="BUND source sections, bander roll tables and Bay 2 handoff"
      updatedAt={updatedAt}
      animationRunning={animationRunning}
      tracking={tracking}
      canvasWidth={1400}
      canvasHeight={420}
      muted={muted}
    >
      <section
        className="absolute rounded-lg border border-emerald-300 bg-emerald-50/25 shadow-sm"
        style={{ left: 20, top: 24, width: 620, height: 270 }}
        aria-label="Bundler source sections"
      />
      <EquipmentHeader label="BUND BUNDLERS" left={40} top={42} width={550} />

      {/* LMD labels describe equipment only; RTOUT* are the tracking zones. */}
      <div
        className="absolute grid grid-cols-4 gap-2"
        style={{ left: 40, top: 102, width: 550 }}
        aria-label="Bundler equipment"
      >
        {["LMD 1", "LMD 2", "LMD 3", "LMD 4"].map((label) => (
          <span
            key={label}
            className="flex h-6 items-center justify-center rounded-sm bg-slate-600 text-[10px] font-bold text-white"
          >
            {label}
          </span>
        ))}
      </div>

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
        style={{ left: 40, top: 252, width: 550 }}
      >
        Four bundler outputs feed the shared Bay 2 transfer route
      </p>

      <DiagramArrow direction="right" left={654} top={168} size={32} />
      <span
        className="absolute text-[10px] font-bold tracking-wide text-slate-500 uppercase"
        style={{ left: 700, top: 122 }}
      >
        Bay 2 transfer flow
      </span>

      {COMMON_LINE_POSITIONS.map((position, index) => (
        <div key={position.zoneName}>
          <ZoneSlot position={position} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          {index > 0 && (
            <DiagramArrow
              direction="right"
              left={position.left - 46}
              top={168}
              size={32}
            />
          )}
        </div>
      ))}

      <span
        className="absolute text-center text-[10px] font-bold tracking-wide text-slate-500 uppercase"
        style={{ left: 1180, top: 122, width: 180 }}
      >
        Bay 2 handoff
      </span>
      <p
        className="absolute rounded-md border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2 text-[10px] text-slate-500"
        style={{ left: 700, top: 264, width: 660 }}
      >
        Equipment is contextual; live placement is determined only by CurrentZone
      </p>
    </SchematicScreen>
  )
}
