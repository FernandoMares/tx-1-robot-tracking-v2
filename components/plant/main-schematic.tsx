"use client"

import type { CSSProperties, ReactNode } from "react"
import { ArrowDown, ArrowRight, Scale } from "lucide-react"

import { RobotCard } from "@/components/plant/robot-card"
import { TrackingZoneSlot } from "@/components/plant/tracking-zone-slot"
import { ROBOT_2_UNKNOWN } from "@/lib/mock-data"
import type { BundlesByZone, TrackingZoneName } from "@/lib/tracking-zone-layout"
import { cn } from "@/lib/utils"

interface MainSchematicProps {
  animationRunning: boolean
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
}

const STACKER_SOURCES = ["ERT1A", "ERT1B", "ERT2C", "ERT2D"] as const
const STACKER_TRANSFERS = ["STRT1", "STRT2", "LFRT1", "LFRT2", "LFRT3"] as const
const BUNDLER_OUTPUTS = ["RTOUTA", "RTOUTB", "RTOUTC", "RTOUTD"] as const
const UPPER_TRACKING_COLUMNS = [
  ["SGRT1A", "LCH1A", "CCH1A"],
  ["SGRT1B", "LCH1B", "CCH1B"],
] as const
const LOWER_TRACKING_COLUMNS = [
  ["SGRT2A", "LCH2A", "CCH2A"],
  ["SGRT2B", "LCH2B", "CCH2B"],
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
      hasSnapshot={hasSnapshot}
      className={cn("w-[4.5rem] shrink-0", className)}
    />
  )
}

function ScaleContext() {
  return (
    <aside
      className="flex h-[4.25rem] w-16 shrink-0 flex-col items-center justify-center rounded-sm border border-dashed border-slate-400 bg-slate-50 px-1 text-center shadow-sm"
      aria-label="Scale Weight Station, physical equipment context, not an API tracking zone"
      title="Physical equipment context; not an API tracking zone"
    >
      <Scale className="mb-1 size-4 text-slate-600" aria-hidden />
      <strong className="text-[7px] leading-[9px] tracking-wide text-slate-700 uppercase">
        Scale weight station
      </strong>
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
  direction?: "right" | "down"
  className?: string
  style?: CSSProperties
}) {
  const Icon = direction === "down" ? ArrowDown : ArrowRight

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
    <div className="flex items-stretch gap-1.5">
      {zones.map((zone, index) => (
        <div key={zone} className="contents">
          <Zone name={zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          {index < zones.length - 1 && <FlowArrow running={running} />}
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
}: {
  zones: readonly TrackingZoneName[]
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
  running: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {zones.map((zone, index) => (
        <div key={zone} className="contents">
          <Zone name={zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          {index < zones.length - 1 && <FlowArrow running={running} direction="down" className="size-3.5" />}
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
  className,
  style,
}: {
  label: string
  columns: readonly (readonly TrackingZoneName[])[]
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
  running: boolean
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
      style={{ width: 1480, height: 760 }}
      role="group"
      aria-label="Mirrored Exit Tracking physical overview with 33 API tracking zones"
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
        style={{ left: 28, top: 120, width: 340, height: 228 }}
      >
        <div className="absolute top-3 left-3 flex gap-2">
          {STACKER_SOURCES.map((zone) => (
            <Zone key={zone} name={zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          ))}
        </div>
      </MachineOutline>

      <div className="absolute" style={{ left: 376, top: 132 }}>
        <FlowArrow running={animationRunning} className="size-6" />
      </div>

      <div className="absolute" style={{ left: 400, top: 132 }}>
        <HorizontalSequence
          zones={STACKER_TRANSFERS}
          bundlesByZone={bundlesByZone}
          hasSnapshot={hasSnapshot}
          running={animationRunning}
        />
      </div>

      <div className="absolute" style={{ left: 880, top: 132 }}>
        <FlowArrow running={animationRunning} className="size-6" />
      </div>

      <section
        className="absolute"
        style={{ left: 912, top: 44 }}
        aria-label="NCCT zones above SGRT zones with the Scale Weight Station between SGRT1 and SGRT2"
      >
        <p className="mb-2 text-center text-[9px] font-bold tracking-[0.08em] text-slate-500 uppercase">
          NCCT above SGRT · physical scale context
        </p>
        <div className="grid gap-x-2 gap-y-5" style={{ gridTemplateColumns: "72px 64px 72px" }}>
          <Zone name="NCCT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          <span aria-hidden />
          <Zone name="NCCT2" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          <Zone name="SGRT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          <ScaleContext />
          <Zone name="SGRT2" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
        </div>
        <FlowArrow
          running={animationRunning}
          direction="down"
          className="absolute size-3.5"
          style={{ left: 29, top: 86 }}
        />
        <FlowArrow
          running={animationRunning}
          direction="down"
          className="absolute size-3.5"
          style={{ left: 181, top: 86 }}
        />
      </section>

      <div className="absolute" style={{ left: 1144, top: 132 }}>
        <FlowArrow running={animationRunning} className="size-6" />
      </div>

      <div className="absolute" style={{ left: 1168, top: 132 }}>
        <Zone name="IMRT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
      </div>

      <div className="absolute" style={{ left: 1244, top: 132 }}>
        <FlowArrow running={animationRunning} className="size-6" />
      </div>

      <VerticalSection
        label="First tracking section"
        columns={UPPER_TRACKING_COLUMNS}
        bundlesByZone={bundlesByZone}
        hasSnapshot={hasSnapshot}
        running={animationRunning}
        style={{ left: 1280, top: 92 }}
      />

      <MachineOutline
        label="BUND Bundler"
        detail="Four bundler outputs feeding the second tracking section"
        style={{ left: 384, top: 456, width: 340, height: 228 }}
      >
        <div className="absolute top-3 left-3 flex gap-2">
          {BUNDLER_OUTPUTS.map((zone) => (
            <Zone key={zone} name={zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
          ))}
        </div>
      </MachineOutline>

      <div className="absolute" style={{ left: 728, top: 468 }}>
        <FlowArrow running={animationRunning} className="size-6" />
      </div>

      <div className="absolute" style={{ left: 752, top: 468 }}>
        <HorizontalSequence
          zones={["RTTY1", "RTTY2", "IMRT2"]}
          bundlesByZone={bundlesByZone}
          hasSnapshot={hasSnapshot}
          running={animationRunning}
        />
      </div>

      <div className="absolute" style={{ left: 1032, top: 468 }}>
        <FlowArrow running={animationRunning} className="size-6" />
      </div>

      <VerticalSection
        label="Second tracking section"
        columns={LOWER_TRACKING_COLUMNS}
        bundlesByZone={bundlesByZone}
        hasSnapshot={hasSnapshot}
        running={animationRunning}
        style={{ left: 1072, top: 428 }}
      />

      <div className="absolute" style={{ left: 1228, top: 644 }}>
        <FlowArrow running={animationRunning} className="size-6" />
      </div>

      <aside
        className="absolute"
        style={{ left: 1256, top: 568 }}
        aria-label="Robot 2 physical equipment context"
      >
        <RobotCard robot={ROBOT_2_UNKNOWN} className="h-40 w-[6.75rem] bg-white/95 p-2" />
      </aside>

      <div className="absolute bottom-5 left-7 max-w-[35rem] rounded-md border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2 text-[10px] text-slate-500">
        Layout mirrors the approved Tracking Sections Overview for left-to-right reading. Zone occupancy comes only
        from the tracking API.
      </div>
    </div>
  )
}
