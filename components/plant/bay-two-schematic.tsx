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
  width?: number
  visibleRows?: number
}

const STK_ROUTE_ZONES: readonly ZonePosition[] = [
  { zoneName: "SGRT1A", left: 322, top: 555, width: 194 },
  { zoneName: "CCH1A", left: 615, top: 522, width: 260, visibleRows: 5 },
  { zoneName: "SGRT1B", left: 322, top: 715, width: 194 },
  { zoneName: "CCH1B", left: 615, top: 682, width: 260, visibleRows: 5 },
]

const FINAL_ROUTE_ZONES: readonly ZonePosition[] = [
  { zoneName: "SGRT2A", left: 322, top: 136, width: 194 },
  { zoneName: "CCH2A", left: 615, top: 103, width: 260, visibleRows: 5 },
  { zoneName: "SGRT2B", left: 322, top: 296, width: 194 },
  { zoneName: "CCH2B", left: 615, top: 263, width: 260, visibleRows: 5 },
]

function Zone({
  zoneName,
  bundlesByZone,
  hasSnapshot,
  left,
  top,
  width = 180,
  visibleRows,
}: ZonePosition & { bundlesByZone: BundlesByZone; hasSnapshot: boolean }) {
  return (
    <TrackingZoneSlot
      zoneName={zoneName}
      bundles={bundlesByZone[zoneName] ?? []}
      hasSnapshot={hasSnapshot}
      compact
      compactVisibleRows={visibleRows}
      className="absolute z-20"
      style={{ left, top, width }}
    />
  )
}

function LaneFlowArrows({ top }: { top: number }) {
  return (
    <>
      <DiagramArrow direction="right" left={260} top={top} size={42} />
      <DiagramArrow direction="right" left={557} top={top} size={42} />
    </>
  )
}

/**
 * Bay 2 is rendered as the two A/B paths in the Exit Tracking Layout. IMRT1
 * enters from STK and IMRT2 joins from BUND. LCH positions are omitted from
 * this operator view; tracking data still determines each bundle's position.
 * No robot state is inferred from tracking data.
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
      canvasWidth={1200}
      canvasHeight={870}
      muted={muted}
    >
      <div className="absolute top-7 left-10 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        <span>Material flow</span>
        <span aria-hidden>Left to right</span>
      </div>

      <section
        className="absolute rounded-lg border border-slate-200 bg-slate-50/45"
        style={{ left: 50, top: 60, width: 870, height: 368 }}
        aria-label="Final Bay 2 tracking section"
      >
        <h3 className="absolute top-4 right-5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          Final Bay 2 transfer
        </h3>
        <span className="absolute top-[90px] right-3 text-[10px] font-bold text-slate-400">A</span>
        <span className="absolute top-[250px] right-3 text-[10px] font-bold text-slate-400">B</span>
      </section>

      <Zone zoneName="IMRT2" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={70} top={234} width={170} />
      <span
        className="absolute z-10 text-[10px] font-semibold tracking-wide text-slate-400 uppercase"
        style={{ left: 85, top: 210 }}
      >
        Handoff from Bundler
      </span>

      {FINAL_ROUTE_ZONES.map((zone) => (
        <Zone key={zone.zoneName} {...zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
      ))}
      <LaneFlowArrows top={149} />
      <LaneFlowArrows top={309} />

      <div className="absolute z-20" style={{ left: 972, top: 112 }}>
        <RobotCard robot={ROBOT_2_UNKNOWN} className="h-[10.5rem] w-[11rem] bg-white/95" />
      </div>
      <p
        className="absolute z-20 max-w-[180px] text-center text-[10px] leading-4 text-slate-500"
        style={{ left: 972, top: 302 }}
      >
        Robot status is not provided by the tracking API.
      </p>
      <DiagramArrow direction="right" left={925} top={153} size={34} />

      <div
        className="absolute z-10 flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-4 py-2 text-center text-[10px] leading-4 font-medium text-slate-500"
        style={{ left: 300, top: 435, width: 600 }}
      >
        ↑ CCH1A/B continues into the corresponding final Bay 2 transfer route above.
      </div>

      <section
        className="absolute rounded-lg border border-slate-200 bg-slate-50/45"
        style={{ left: 50, top: 480, width: 870, height: 370 }}
        aria-label="STK to Bay 2 tracking section"
      >
        <h3 className="absolute top-4 right-5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          STK to Bay 2
        </h3>
        <span className="absolute top-[90px] right-3 text-[10px] font-bold text-slate-400">A</span>
        <span className="absolute top-[250px] right-3 text-[10px] font-bold text-slate-400">B</span>
      </section>

      <Zone zoneName="IMRT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={70} top={663} width={170} />

      {STK_ROUTE_ZONES.map((zone) => (
        <Zone key={zone.zoneName} {...zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
      ))}
      <LaneFlowArrows top={568} />
      <LaneFlowArrows top={728} />

    </SchematicScreen>
  )
}
