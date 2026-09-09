"use client"

import { RobotCard } from "@/components/plant/robot-card"
import { SchematicScreen } from "@/components/plant/schematic-screen"
import { TrackingZoneSlot } from "@/components/plant/tracking-zone-slot"
import { DiagramArrow } from "@/components/plant/zoom-schematic-primitives"
import { ROBOT_2_UNKNOWN } from "@/lib/mock-data"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import type {
  BundlesByZone,
  TrackingZoneName,
} from "@/lib/tracking-zone-layout"

interface BayTwoSchematicProps {
  updatedAt: Date | null
  animationRunning: boolean
  matchedIds: Set<string> | null
  tracking: TrackingRuntimeState
  bundlesByZone: BundlesByZone
}

interface ZonePosition {
  zoneName: TrackingZoneName
  left: number
  top: number
}

const STK_ROUTE_ZONES: readonly ZonePosition[] = [
  { zoneName: "SGRT1A", left: 290, top: 104 },
  { zoneName: "LCH1A", left: 540, top: 104 },
  { zoneName: "CCH1A", left: 790, top: 104 },
  { zoneName: "SGRT1B", left: 290, top: 220 },
  { zoneName: "LCH1B", left: 540, top: 220 },
  { zoneName: "CCH1B", left: 790, top: 220 },
]

const FINAL_ROUTE_ZONES: readonly ZonePosition[] = [
  { zoneName: "SGRT2A", left: 540, top: 492 },
  { zoneName: "LCH2A", left: 790, top: 492 },
  { zoneName: "CCH2A", left: 1040, top: 492 },
  { zoneName: "SGRT2B", left: 540, top: 608 },
  { zoneName: "LCH2B", left: 790, top: 608 },
  { zoneName: "CCH2B", left: 1040, top: 608 },
]

function Zone({
  zoneName,
  bundlesByZone,
  hasSnapshot,
  left,
  top,
  width = 180,
}: ZonePosition & { bundlesByZone: BundlesByZone; hasSnapshot: boolean; width?: number }) {
  return (
    <TrackingZoneSlot
      zoneName={zoneName}
      bundles={bundlesByZone[zoneName] ?? []}
      hasSnapshot={hasSnapshot}
      compact
      className="absolute z-20"
      style={{ left, top, width }}
    />
  )
}

function RightFlowArrows({ top }: { top: number }) {
  return (
    <>
      <DiagramArrow direction="right" left={488} top={top} size={42} />
      <DiagramArrow direction="right" left={738} top={top} size={42} />
    </>
  )
}

/**
 * Bay 2 is rendered as the two A/B paths in the Exit Tracking Layout. IMRT1
 * enters from STK, IMRT2 joins from BUND, and both ultimately use the matching
 * SGRT2/LCH2/CCH2 final lane. No robot state is inferred from tracking data.
 */
export function BayTwoSchematic({
  updatedAt,
  animationRunning,
  matchedIds,
  tracking,
  bundlesByZone,
}: BayTwoSchematicProps) {
  const muted = Boolean(matchedIds && !matchedIds.has("bay2-t3"))
  const hasSnapshot = tracking.mode === "mock" || tracking.trackingState !== null

  return (
    <SchematicScreen
      title="Bay 2"
      description="IMRT1 and IMRT2 handoffs through the A/B tracking routes"
      updatedAt={updatedAt}
      animationRunning={animationRunning}
      tracking={tracking}
      canvasWidth={1480}
      canvasHeight={790}
      muted={muted}
    >
      <div className="absolute top-7 left-10 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        <span>Material flow</span>
        <span aria-hidden>Left to right</span>
      </div>

      <section
        className="absolute rounded-lg border border-slate-200 bg-slate-50/45"
        style={{ left: 50, top: 60, width: 952, height: 292 }}
        aria-label="STK to Bay 2 tracking section"
      >
        <h3 className="absolute top-4 right-5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          STK to Bay 2
        </h3>
        <span className="absolute top-[67px] right-3 text-[10px] font-bold text-slate-400">A</span>
        <span className="absolute top-[183px] right-3 text-[10px] font-bold text-slate-400">B</span>
      </section>

      <Zone zoneName="IMRT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={70} top={158} width={170} />
      <DiagramArrow direction="right" left={244} top={117} size={42} />
      <DiagramArrow direction="right" left={244} top={233} size={42} />

      {STK_ROUTE_ZONES.map((zone) => (
        <Zone key={zone.zoneName} {...zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
      ))}
      <RightFlowArrows top={118} />
      <RightFlowArrows top={234} />

      <div
        className="absolute z-10 flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-4 py-2 text-center text-[10px] leading-4 font-medium text-slate-500"
        style={{ left: 540, top: 372, width: 430 }}
      >
        STK lane A/B continues from CCH1A/B into the corresponding final A/B route below.
      </div>
      <DiagramArrow direction="down" left={890} top={416} size={40} />
      <DiagramArrow direction="down" left={590} top={416} size={40} />

      <section
        className="absolute rounded-lg border border-slate-200 bg-slate-50/45"
        style={{ left: 50, top: 450, width: 1202, height: 274 }}
        aria-label="Final Bay 2 tracking section"
      >
        <h3 className="absolute top-4 right-5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          Final Bay 2 transfer
        </h3>
        <span className="absolute top-[59px] right-3 text-[10px] font-bold text-slate-400">A</span>
        <span className="absolute top-[175px] right-3 text-[10px] font-bold text-slate-400">B</span>
      </section>

      <Zone zoneName="IMRT2" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={180} top={550} width={180} />
      <span
        className="absolute z-10 text-[10px] font-semibold tracking-wide text-slate-400 uppercase"
        style={{ left: 195, top: 526 }}
      >
        Handoff from Bundler
      </span>
      <DiagramArrow direction="right" left={488} top={506} size={42} />
      <DiagramArrow direction="right" left={488} top={622} size={42} />

      {FINAL_ROUTE_ZONES.map((zone) => (
        <Zone key={zone.zoneName} {...zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
      ))}
      <DiagramArrow direction="right" left={738} top={506} size={42} />
      <DiagramArrow direction="right" left={988} top={506} size={42} />
      <DiagramArrow direction="right" left={738} top={622} size={42} />
      <DiagramArrow direction="right" left={988} top={622} size={42} />

      <div className="absolute z-20" style={{ left: 1284, top: 500 }}>
        <RobotCard robot={ROBOT_2_UNKNOWN} className="h-[10.5rem] w-[9.5rem] bg-white/95" />
      </div>
      <p
        className="absolute z-20 max-w-[160px] text-center text-[10px] leading-4 text-slate-500"
        style={{ left: 1280, top: 690 }}
      >
        Robot status is not provided by the tracking API.
      </p>
    </SchematicScreen>
  )
}
