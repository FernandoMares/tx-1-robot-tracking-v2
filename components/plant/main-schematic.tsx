"use client"

import type { ReactNode } from "react"
import { ArrowDown, ArrowLeft, ArrowUp, Bot, Scale, Tags } from "lucide-react"

import { TrackingZoneSlot } from "@/components/plant/tracking-zone-slot"
import type { BundlesByZone, TrackingZoneName } from "@/lib/tracking-zone-layout"
import { cn } from "@/lib/utils"

interface MainSchematicProps {
  animationRunning: boolean
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
}

const STACKER_SOURCES = ["ERT2D", "ERT2C", "ERT1B", "ERT1A"] as const
const BAY_2_LANE_A = ["CCH2A", "LCH2A", "SGRT2A", "CCH1A", "LCH1A", "SGRT1A"] as const
const BAY_2_LANE_B = ["CCH2B", "LCH2B", "SGRT2B", "CCH1B", "LCH1B", "SGRT1B"] as const
const BUNDLER_SOURCES = ["RTOUTD", "RTOUTC", "RTOUTB", "RTOUTA"] as const

function Area({
  label,
  description,
  className,
  children,
}: {
  label: string
  description: string
  className: string
  children: ReactNode
}) {
  return (
    <section className={cn("absolute rounded-lg border border-slate-300 bg-slate-50/80 p-4", className)}>
      <header className="mb-3 flex items-start justify-between gap-4 border-b border-slate-200 pb-2">
        <div>
          <h3 className="text-xs font-bold tracking-[0.08em] text-slate-800 uppercase">{label}</h3>
          <p className="mt-0.5 text-[10px] text-slate-500">{description}</p>
        </div>
        <span className="rounded bg-slate-700 px-2 py-1 text-[9px] font-bold tracking-wide text-white uppercase">
          Exit tracking
        </span>
      </header>
      {children}
    </section>
  )
}

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
      className={cn("w-[6.75rem] shrink-0", className)}
    />
  )
}

function InlineArrow({ running }: { running: boolean }) {
  return (
    <ArrowLeft
      className={cn("size-4 shrink-0 self-center text-slate-700", running && "animate-soft-pulse")}
      strokeWidth={3}
      aria-hidden
    />
  )
}

function ZoneSequence({
  zones,
  bundlesByZone,
  hasSnapshot,
  running,
  slotClassName,
}: {
  zones: readonly TrackingZoneName[]
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
  running: boolean
  slotClassName?: string
}) {
  return (
    <div className="flex items-stretch gap-1.5">
      {zones.map((zone, index) => (
        <div key={zone} className="contents">
          <Zone
            name={zone}
            bundlesByZone={bundlesByZone}
            hasSnapshot={hasSnapshot}
            className={slotClassName}
          />
          {index < zones.length - 1 && <InlineArrow running={running} />}
        </div>
      ))}
    </div>
  )
}

function EquipmentNote({
  icon: Icon,
  label,
  note,
}: {
  icon: typeof Bot
  label: string
  note: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white/80 px-3 py-2">
      <Icon className="size-4 shrink-0 text-slate-500" aria-hidden />
      <div>
        <p className="text-[10px] font-bold text-slate-700 uppercase">{label}</p>
        <p className="text-[9px] text-slate-500">{note}</p>
      </div>
    </div>
  )
}

/**
 * Physical overview from Exit Tracking Layout. API zones are discrete slots;
 * arrows describe the approved route but never infer movement between polls.
 */
export function MainSchematic({
  animationRunning,
  bundlesByZone,
  hasSnapshot,
}: MainSchematicProps) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      style={{ width: 1680, height: 1050 }}
      role="group"
      aria-label="Exit Tracking physical overview with 33 API tracking zones"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-zone via-cell-fill to-zone" aria-hidden />

      <div className="absolute top-5 left-6 flex items-center gap-2 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
        <ArrowLeft className={cn("size-4", animationRunning && "animate-soft-pulse")} aria-hidden />
        Principal material flow
      </div>

      <Area
        label="Bay 1"
        description="Manual destination branch from the STK line"
        className="top-12 left-8 h-[15rem] w-[34rem]"
      >
        <div className="flex h-[9.5rem] items-center justify-between gap-4">
          <EquipmentNote icon={Scale} label="Scale / manual station" note="Equipment context; not an API zone" />
          <ArrowLeft className={cn("size-7 shrink-0 text-slate-700", animationRunning && "animate-soft-pulse")} aria-hidden />
          <div className="flex gap-2">
            {(["NCCT2", "NCCT1"] as const).map((zone) => (
              <Zone
                key={zone}
                name={zone}
                bundlesByZone={bundlesByZone}
                hasSnapshot={hasSnapshot}
                className="w-[7.5rem]"
              />
            ))}
          </div>
        </div>
      </Area>

      <Area
        label="Stackers"
        description="Stacker exits and shared transfer route"
        className="top-12 right-8 h-[22rem] w-[64rem]"
      >
        <div className="flex items-end justify-end gap-3">
          <span className="mb-6 text-[9px] font-semibold tracking-wide text-slate-500 uppercase">Four source sections</span>
          <div className="flex gap-2">
            {STACKER_SOURCES.map((zone) => (
              <Zone
                key={zone}
                name={zone}
                bundlesByZone={bundlesByZone}
                hasSnapshot={hasSnapshot}
                className="w-[7.75rem]"
              />
            ))}
          </div>
        </div>

        <div className="relative mt-4 flex items-center justify-end gap-2">
          <div className="grid w-[7.25rem] gap-2">
            {(["SGRT2", "SGRT1"] as const).map((zone) => (
              <Zone key={zone} name={zone} bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} />
            ))}
          </div>
          <InlineArrow running={animationRunning} />
          <ZoneSequence
            zones={["LFRT3", "LFRT2", "LFRT1", "STRT2", "STRT1"]}
            bundlesByZone={bundlesByZone}
            hasSnapshot={hasSnapshot}
            running={animationRunning}
          />
          <ArrowDown
            className={cn("mb-14 ml-1 size-7 shrink-0 text-slate-700", animationRunning && "animate-soft-pulse")}
            aria-label="Stacker sources merge into STRT1"
          />
        </div>
      </Area>

      <div className="absolute top-[17.5rem] left-[35.75rem] flex w-[4.5rem] flex-col items-center gap-1 text-center text-[9px] font-semibold text-slate-500">
        STK branch
        <ArrowUp className={cn("size-7 text-slate-700", animationRunning && "animate-soft-pulse")} aria-hidden />
      </div>

      <div className="absolute top-[24.5rem] left-[44rem] flex items-center gap-2 text-[9px] font-semibold text-slate-500">
        <ArrowDown className={cn("size-7 text-slate-700", animationRunning && "animate-soft-pulse")} aria-hidden />
        STK to Bay 2
      </div>

      <Area
        label="Bay 2"
        description="Two parallel A/B lanes; BUND joins the second tracking section"
        className="bottom-8 left-8 h-[35rem] w-[70rem]"
      >
        <div className="absolute top-[5.25rem] right-4 flex items-center gap-2">
          <ArrowLeft className={cn("size-6 text-slate-700", animationRunning && "animate-soft-pulse")} aria-hidden />
          <Zone
            name="IMRT1"
            bundlesByZone={bundlesByZone}
            hasSnapshot={hasSnapshot}
            className="w-[7.5rem]"
          />
        </div>

        <div className="absolute top-[9rem] left-4 flex items-center gap-3">
          <div className="flex h-[10.75rem] w-[8rem] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-center">
            <Bot className="size-8 text-slate-500" aria-hidden />
            <strong className="mt-2 text-[10px] tracking-wide text-slate-700 uppercase">Robot 2</strong>
            <span className="mt-1 text-[9px] text-slate-500">Status unavailable</span>
          </div>
          <ArrowLeft className={cn("size-7 shrink-0 text-slate-700", animationRunning && "animate-soft-pulse")} aria-hidden />
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-[9px] font-bold tracking-wide text-slate-500 uppercase">Lane A · STK route</p>
              <ZoneSequence
                zones={BAY_2_LANE_A}
                bundlesByZone={bundlesByZone}
                hasSnapshot={hasSnapshot}
                running={animationRunning}
                slotClassName="w-[6.25rem]"
              />
            </div>
            <div>
              <p className="mb-1 text-[9px] font-bold tracking-wide text-slate-500 uppercase">Lane B · STK route</p>
              <ZoneSequence
                zones={BAY_2_LANE_B}
                bundlesByZone={bundlesByZone}
                hasSnapshot={hasSnapshot}
                running={animationRunning}
                slotClassName="w-[6.25rem]"
              />
            </div>
          </div>
        </div>

        <div className="absolute bottom-5 left-[12rem] right-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <EquipmentNote icon={Tags} label="Bay 2 robot tagging" note="Physical equipment · destination B2R" />
          <ArrowLeft className={cn("size-6 text-slate-700", animationRunning && "animate-soft-pulse")} aria-hidden />
          <EquipmentNote icon={Scale} label="Bay 2 scale / manual" note="Physical equipment · destinations B2M/B2P" />
        </div>

        <div className="absolute right-[22rem] bottom-[5.75rem] flex items-center gap-2 text-[9px] font-semibold text-slate-500">
          BUND joins at SGRT2A/B
          <ArrowUp className={cn("size-6 text-slate-700", animationRunning && "animate-soft-pulse")} aria-hidden />
        </div>
      </Area>

      <Area
        label="Bundler"
        description="Four bundler outputs feeding Bay 2"
        className="right-8 bottom-8 h-[29rem] w-[30rem]"
      >
        <EquipmentNote icon={Tags} label="BUND banders · LMD 1–4" note="Machine context; not tracking zones" />

        <p className="mt-5 mb-1 text-[9px] font-bold tracking-wide text-slate-500 uppercase">Bundler output sections</p>
        <div className="flex gap-2">
          {BUNDLER_SOURCES.map((zone) => (
            <Zone
              key={zone}
              name={zone}
              bundlesByZone={bundlesByZone}
              hasSnapshot={hasSnapshot}
              className="w-[6.5rem]"
            />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center">
          <ZoneSequence
            zones={["IMRT2", "RTTY2", "RTTY1"]}
            bundlesByZone={bundlesByZone}
            hasSnapshot={hasSnapshot}
            running={animationRunning}
            slotClassName="w-[7.25rem]"
          />
        </div>

        <p className="mt-7 text-center text-[9px] font-medium text-slate-500">
          IMRT2 continues left into the second Bay 2 section.
        </p>
      </Area>

      <div className="absolute right-[30rem] bottom-[8.5rem] flex items-center gap-2 text-[9px] font-semibold text-slate-500">
        <ArrowLeft className={cn("size-7 text-slate-700", animationRunning && "animate-soft-pulse")} aria-hidden />
        BUND to Bay 2
      </div>
    </div>
  )
}
