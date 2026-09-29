"use client"

import type { CSSProperties, ReactNode } from "react"
import { ArrowDown, ArrowRight, ArrowUp, Scale } from "lucide-react"

import { RobotCard } from "@/components/plant/robot-card"
import { ScaleWeightReadout } from "@/components/plant/scale-weight-readout"
import { TrackingZoneSlot } from "@/components/plant/tracking-zone-slot"
import { ROBOT_2_UNKNOWN } from "@/lib/mock-data"
import type { BundlesByZone, TrackingZoneName } from "@/lib/tracking-zone-layout"
import { cn } from "@/lib/utils"

interface MainSchematicProps {
  animationRunning: boolean
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
}

export const MAIN_SCHEMATIC_WIDTH = 1480
export const MAIN_SCHEMATIC_HEIGHT = 760
const ZONE_WIDTH = 84
const BUNDLER_ROW_TOP = 250

const STACKER_SOURCES = ["ERT1A", "ERT1B", "ERT2C", "ERT2D"] as const
const STACKER_TRANSFERS = ["STRT1", "STRT2", "LFRT1", "LFRT2", "LFRT3"] as const
const BUNDLER_OUTPUTS = ["RTOUTA", "RTOUTB", "RTOUTC", "RTOUTD"] as const
const UPPER_TRACKING_COLUMNS = [
  ["CCH1A", "SGRT1A"],
  ["CCH1B", "SGRT1B"],
] as const
const LOWER_TRACKING_COLUMNS = [
  ["CCH2A", "SGRT2A"],
  ["CCH2B", "SGRT2B"],
] as const

function Zone({
  name,
  bundlesByZone,
  hasSnapshot,
  className,
}: {
  name: TrackingZoneName
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
  className?: string
}) {
  return (
    <TrackingZoneSlot
      zoneName={name}
      bundles={bundlesByZone[name]}
      compact
      compactVisibleRows={name.startsWith("CCH") ? 5 : undefined}
      hasSnapshot={hasSnapshot}
      className={cn("shrink-0", className)}
      style={{ width: ZONE_WIDTH }}
    />
  )
}

function ScaleContext({
  bundlesByZone,
  hasSnapshot,
}: {
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
}) {
  return (
    <aside
      className="flex h-20 flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-slate-400 bg-slate-50 px-1 py-1 text-center shadow-sm"
      style={{ gridColumn: "1 / -1" }}
      aria-label="Scale Weight Station, showing the weight reported for bundles in SGRT2"
      title="Physical scale; weights come from SGRT2 bundles in the tracking API"
    >
      <div className="flex items-center justify-center gap-1">
        <Scale className="size-4 shrink-0 text-slate-600" aria-hidden />
        <strong className="text-[9px] leading-3 tracking-wide text-slate-700 uppercase">
          Scale weight station
        </strong>
      </div>
      <ScaleWeightReadout bundles={bundlesByZone.SGRT2 ?? []} hasSnapshot={hasSnapshot} compact />
    </aside>
  )
}

function FlowArrow({
  running,
  direction = "right",
  className,
  style,
}: {
  running: boolean
  direction?: "right" | "down" | "up"
  className?: string
  style?: CSSProperties
}) {
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : ArrowRight

  return (
    <Icon
      className={cn(
        "size-4 shrink-0 self-center text-slate-600",
        running && "animate-soft-pulse",
        className,
      )}
      style={style}
      strokeWidth={3}
      aria-hidden
    />
  )
}

function HorizontalSequence({
  zones,
  bundlesByZone,
  hasSnapshot,
  running,
}: {
  zones: readonly TrackingZoneName[]
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
  running: boolean
}) {
  return (
    <div className="flex items-stretch gap-0.5">
      {zones.map((zone, index) => (
        <div key={zone} className="contents">
          <Zone name={zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          {index < zones.length - 1 && <FlowArrow running={running} className="size-2.5" />}
        </div>
      ))}
    </div>
  )
}

function VerticalSequence({
  zones,
  bundlesByZone,
  hasSnapshot,
  running,
  direction,
}: {
  zones: readonly TrackingZoneName[]
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
  running: boolean
  direction: "up" | "down"
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {zones.map((zone, index) => (
        <div key={zone} className="contents">
          <Zone name={zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          {index < zones.length - 1 && (
            <FlowArrow running={running} direction={direction} className="size-2.5" />
          )}
        </div>
      ))}
    </div>
  )
}

function VerticalSection({
  label,
  columns,
  bundlesByZone,
  hasSnapshot,
  running,
  direction = "down",
  className,
  style,
}: {
  label: string
  columns: readonly (readonly TrackingZoneName[])[]
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
  running: boolean
  direction?: "up" | "down"
  className?: string
  style?: CSSProperties
}) {
  return (
    <section className={cn("absolute", className)} style={style} aria-label={label}>
      <p className="mb-2 text-center text-[9px] font-bold tracking-[0.08em] text-slate-500 uppercase">
        {label}
      </p>
      <div className="flex gap-2">
        {columns.map((zones) => (
          <VerticalSequence
            key={zones[0]}
            zones={zones}
            bundlesByZone={bundlesByZone}
            hasSnapshot={hasSnapshot}
            running={running}
            direction={direction}
          />
        ))}
      </div>
    </section>
  )
}

function MachineOutline({
  label,
  detail,
  className,
  style,
  children,
}: {
  label: string
  detail: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        "absolute rounded-lg border border-emerald-300 bg-emerald-50/25 shadow-sm",
        className,
      )}
      style={style}
    >
      {children}
      <div className="absolute inset-x-4 bottom-10 text-center">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
      </div>
    </section>
  )
}

/**
 * Mirrored physical overview from Tracking Sections Overview. The mirror keeps
 * the approved left-to-right HMI flow while preserving the source document's
 * row/column relationships. API zones remain discrete slots and no position is
 * inferred from the visual order.
 */
export function MainSchematic({
  animationRunning,
  bundlesByZone,
  hasSnapshot,
}: MainSchematicProps) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      style={{ width: MAIN_SCHEMATIC_WIDTH, height: MAIN_SCHEMATIC_HEIGHT }}
      role="group"
      aria-label="Mirrored Exit Tracking physical overview"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-zone via-cell-fill to-zone" aria-hidden />

      <div className="absolute top-5 right-6 flex items-center gap-2 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
        Principal material flow
        <FlowArrow running={animationRunning} />
      </div>

      <p className="absolute top-5 left-7 text-xs font-bold tracking-[0.12em] text-slate-700 uppercase">
        Tracking sections overview
      </p>

      <MachineOutline
        label="STK Stackers"
        detail="Four source sections feeding the shared transfer route"
        style={{ left: 20, top: 502, width: 376, height: 218 }}
      >
        <div className="absolute top-3 left-3 flex gap-1">
          {STACKER_SOURCES.map((zone) => (
            <Zone key={zone} name={zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          ))}
        </div>
      </MachineOutline>

      <div className="absolute" style={{ left: 400, top: 542 }}>
        <FlowArrow running={animationRunning} className="size-3" />
      </div>

      <div className="absolute" style={{ left: 416, top: 514 }}>
        <HorizontalSequence
          zones={STACKER_TRANSFERS}
          bundlesByZone={bundlesByZone}
          hasSnapshot={hasSnapshot}
          running={animationRunning}
        />
      </div>

      <div className="absolute" style={{ left: 892, top: 540 }}>
        <FlowArrow running={animationRunning} className="size-4" />
      </div>

      <section
        className="absolute"
        style={{ left: 908, top: 395 }}
        aria-label="Scale Weight Station above SGRT1 and SGRT2, with NCCT1 and NCCT2 below"
      >
        <p className="mb-2 text-center text-[9px] font-bold tracking-[0.08em] text-slate-500 uppercase">
          Physical scale · SGRT above NCCT
        </p>
        <div
          className="grid gap-x-2 gap-y-5"
          style={{ gridTemplateColumns: `${ZONE_WIDTH}px ${ZONE_WIDTH}px` }}
        >
          <ScaleContext bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          <Zone name="SGRT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          <Zone name="SGRT2" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          <Zone name="NCCT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          <Zone name="NCCT2" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
        </div>
        <FlowArrow
          running={animationRunning}
          direction="down"
          className="absolute size-2.5"
          style={{ left: 37, top: 196 }}
        />
        <FlowArrow
          running={animationRunning}
          direction="down"
          className="absolute size-2.5"
          style={{ left: 129, top: 196 }}
        />
      </section>

      <div className="absolute" style={{ left: 1084, top: 540 }}>
        <FlowArrow running={animationRunning} className="size-4" />
      </div>

      <div className="absolute" style={{ left: 1100, top: 514 }}>
        <Zone name="IMRT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
      </div>

      <div className="absolute" style={{ left: 1184, top: 540 }}>
        <FlowArrow running={animationRunning} className="size-4" />
      </div>

      <VerticalSection
        label="First tracking section"
        columns={UPPER_TRACKING_COLUMNS}
        bundlesByZone={bundlesByZone}
        hasSnapshot={hasSnapshot}
        running={animationRunning}
        direction="up"
        style={{ left: 1200, top: 331 }}
      />

      <MachineOutline
        label="BUND Bundler"
        detail="Four bundler outputs feeding the second tracking section"
        style={{ left: 500, top: BUNDLER_ROW_TOP - 12, width: 376, height: 220 }}
      >
        <div className="absolute top-3 left-3 flex gap-1">
          {BUNDLER_OUTPUTS.map((zone) => (
            <Zone key={zone} name={zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          ))}
        </div>
      </MachineOutline>

      <div className="absolute" style={{ left: 880, top: BUNDLER_ROW_TOP + 28 }}>
        <FlowArrow running={animationRunning} className="size-3" />
      </div>

      <div className="absolute" style={{ left: 900, top: BUNDLER_ROW_TOP }}>
        <HorizontalSequence
          zones={["RTTY1", "RTTY2", "IMRT2"]}
          bundlesByZone={bundlesByZone}
          hasSnapshot={hasSnapshot}
          running={animationRunning}
        />
      </div>

      <div className="absolute" style={{ left: 1184, top: BUNDLER_ROW_TOP + 28 }}>
        <FlowArrow running={animationRunning} className="size-3" />
      </div>

      <VerticalSection
        label="Second tracking section"
        columns={LOWER_TRACKING_COLUMNS}
        bundlesByZone={bundlesByZone}
        hasSnapshot={hasSnapshot}
        running={animationRunning}
        direction="up"
        style={{ left: 1200, top: 64 }}
      />

      <div className="absolute" style={{ left: 1237, top: 320 }}>
        <FlowArrow running={animationRunning} direction="up" className="size-2.5" />
      </div>

      <div className="absolute" style={{ left: 1329, top: 320 }}>
        <FlowArrow running={animationRunning} direction="up" className="size-2.5" />
      </div>

      <div className="absolute" style={{ left: 1380, top: 157 }}>
        <FlowArrow running={animationRunning} className="size-3" />
      </div>

      <aside
        className="absolute"
        style={{ left: 1392, top: 70 }}
        aria-label="Robot 2 physical equipment context"
      >
        <RobotCard robot={ROBOT_2_UNKNOWN} className="h-40 w-20 gap-2 bg-white/95 p-2" />
      </aside>

      <div
        className="absolute bottom-5 max-w-[35rem] rounded-md border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2 text-[10px] text-slate-500"
        style={{ left: 520 }}
      >
        Operator view of the tracking sections. Zone occupancy comes only from the tracking API.
      </div>
    </div>
  )
}
