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

const SOURCE_ZONES = [...TRACKING_ZONES_BY_GROUP["bundler-source"]].reverse()
const COMMON_LINE_ZONES = TRACKING_ZONES_BY_GROUP["bundler-line"]

const SOURCE_POSITIONS: PositionedZone[] = SOURCE_ZONES.map((zoneName, index) => ({
  zoneName,
  left: 750 + index * 132,
  top: 132,
  width: 122,
}))

const COMMON_LINE_POSITIONS: PositionedZone[] = COMMON_LINE_ZONES.map((zoneName, index) => ({
  zoneName,
  left: 570 - index * 220,
  top: 315,
  width: 138,
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
      canvasWidth={1320}
      canvasHeight={480}
      muted={muted}
    >
      <EquipmentHeader label="BUND BUNDLERS" left={750} top={32} width={518} />

      {/* LMD labels describe equipment only; RTOUT* are the tracking zones. */}
      <div className="absolute top-[92px] left-[750px] grid w-[518px] grid-cols-4 gap-2" aria-label="Bundler equipment">
        {["LMD 4", "LMD 3", "LMD 2", "LMD 1"].map((label) => (
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

      {/* Four independent outputs converge before entering RTTY1. */}
      <div className="absolute top-[254px] left-[811px] w-[396px] border-t border-slate-400" aria-hidden />
      {SOURCE_POSITIONS.map((position) => (
        <span
          key={`${position.zoneName}-source-connector`}
          className="absolute top-[230px] h-6 border-l border-slate-400"
          style={{ left: position.left + 61 }}
          aria-hidden
        />
      ))}
      <div className="absolute top-[254px] left-[678px] w-[133px] border-t border-slate-400" aria-hidden />
      <DiagramArrow direction="left" left={677} top={233} size={44} />
      <div className="absolute top-[254px] left-[640px] h-[61px] border-l border-slate-400" aria-hidden />

      {COMMON_LINE_POSITIONS.map((position, index) => (
        <div key={position.zoneName}>
          <ZoneSlot position={position} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          {index > 0 && (
            <DiagramArrow
              direction="left"
              left={position.left + position.width + 35}
              top={326}
              size={42}
            />
          )}
        </div>
      ))}

      <span className="absolute top-[286px] left-[130px] text-[10px] font-bold tracking-wide text-slate-500 uppercase">
        Bay 2 handoff
      </span>
      <p className="absolute top-[412px] left-[750px] w-[518px] text-right text-[10px] text-slate-500">
        Equipment is contextual; live placement is determined only by CurrentZone
      </p>
    </SchematicScreen>
  )
}
