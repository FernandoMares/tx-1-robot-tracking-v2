"use client"

import { SchematicScreen } from "@/components/plant/schematic-screen"
import { TrackingZoneSlot } from "@/components/plant/tracking-zone-slot"
import { DiagramArrow } from "@/components/plant/zoom-schematic-primitives"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import type {
  BundlesByZone,
  TrackingZoneName,
} from "@/lib/tracking-zone-layout"
import { cn } from "@/lib/utils"

interface BayOneSchematicProps {
  updatedAt: Date | null
  animationRunning: boolean
  matchedIds: Set<string> | null
  tracking: TrackingRuntimeState
  bundlesByZone: BundlesByZone
}

interface EquipmentContextProps {
  title: string
  note: string
  left: number
  top: number
  width: number
  tone?: "manual" | "scale"
}

/** Physical equipment is context only; bundles are placed exclusively in API zones. */
function EquipmentContext({
  title,
  note,
  left,
  top,
  width,
  tone = "manual",
}: EquipmentContextProps) {
  return (
    <aside
      className="absolute z-10 overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50/80 shadow-sm"
      style={{ left, top, width }}
      aria-label={`${title}, physical equipment context`}
    >
      <div
        className={cn(
          "flex h-10 items-center justify-center px-3 text-center text-[11px] font-bold tracking-wide text-white uppercase",
          tone === "scale" ? "bg-slate-500" : "bg-slate-700",
        )}
      >
        {title}
      </div>
      <p className="px-3 py-2 text-center text-[10px] leading-4 text-slate-500">{note}</p>
    </aside>
  )
}

function Zone({
  zoneName,
  bundlesByZone,
  hasSnapshot,
  left,
  top,
  width,
}: {
  zoneName: TrackingZoneName
  bundlesByZone: BundlesByZone
  hasSnapshot: boolean
  left: number
  top: number
  width: number
}) {
  return (
    <TrackingZoneSlot
      zoneName={zoneName}
      bundles={bundlesByZone[zoneName] ?? []}
      hasSnapshot={hasSnapshot}
      className="absolute z-20"
      style={{ left, top, width }}
    />
  )
}

/**
 * Bay 1 mirrors the overview's physical alignment: the scale is above the
 * SGRT handoff zones, with the NCCT zones below. CurrentZone remains the only
 * source of bundle placement; visual columns do not create HMI routing logic.
 */
export function BayOneSchematic({
  updatedAt,
  animationRunning,
  matchedIds,
  tracking,
  bundlesByZone,
}: BayOneSchematicProps) {
  const muted = Boolean(matchedIds && ["bay1-t1", "bay1-t2"].every((id) => !matchedIds.has(id)))
  const hasSnapshot = tracking.mode === "mock" || tracking.trackingState !== null

  return (
    <SchematicScreen
      title="Bay 1"
      description="Stackers handoff, NCCT tracking zones and physical equipment context"
      updatedAt={updatedAt}
      animationRunning={animationRunning}
      tracking={tracking}
      canvasWidth={1100}
      canvasHeight={500}
      muted={muted}
    >
      <section
        className="absolute rounded-lg border border-slate-200 bg-slate-50/45"
        style={{ left: 30, top: 24, width: 620, height: 420 }}
        aria-label="Bay 1 tracked positions"
      />
      <span
        className="absolute z-10 text-[11px] font-bold tracking-wide text-slate-500 uppercase"
        style={{ left: 60, top: 42 }}
      >
        Bay 1 tracked positions
      </span>

      <EquipmentContext
        title="Scale Weight Station"
        note="Physical scale above the SGRT and NCCT tracking positions"
        left={80}
        top={72}
        width={520}
        tone="scale"
      />

      <span
        className="absolute z-10 text-[10px] font-semibold tracking-wide text-slate-400 uppercase"
        style={{ left: 80, top: 166 }}
      >
        Handoff from Stackers
      </span>
      <Zone zoneName="SGRT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={80} top={188} width={240} />
      <Zone zoneName="SGRT2" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={360} top={188} width={240} />

      <DiagramArrow direction="down" left={186} top={290} size={28} />
      <DiagramArrow direction="down" left={466} top={290} size={28} />

      <span
        className="absolute z-10 text-[10px] font-semibold tracking-wide text-slate-400 uppercase"
        style={{ left: 80, top: 320 }}
      >
        NCCT tracking zones
      </span>
      <Zone zoneName="NCCT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={80} top={340} width={240} />
      <Zone zoneName="NCCT2" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={360} top={340} width={240} />

      <section
        className="absolute rounded-lg border border-dashed border-slate-300 bg-white/70"
        style={{ left: 700, top: 92, width: 350, height: 250 }}
        aria-label="Physical equipment context"
      >
        <span className="absolute top-5 right-0 left-0 text-center text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          Physical equipment context
        </span>
      </section>
      <EquipmentContext
        title="Bay 1 Manual Station"
        note="Equipment context; not a CurrentZone slot"
        left={730}
        top={168}
        width={290}
      />

      <p
        className="absolute rounded-md border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2 text-[10px] leading-4 text-slate-500"
        style={{ left: 700, top: 366, width: 350 }}
      >
        Bundle placement comes from CurrentZone. The backend selects the active NCCT zone; the HMI does not infer
        routing or a physical slot.
      </p>
    </SchematicScreen>
  )
}
