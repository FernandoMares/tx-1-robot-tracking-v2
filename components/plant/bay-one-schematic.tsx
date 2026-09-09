"use client"

import { GitBranch } from "lucide-react"

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
 * Bay 1 mirrors the PDF's material flow from left to right. SGRT1/2 are shown as
 * incoming handoff context while NCCT1/2 remain the two owned Bay 1 zones.
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
      description="NCCT1 and NCCT2 tracking zones with Stackers handoff context"
      updatedAt={updatedAt}
      animationRunning={animationRunning}
      tracking={tracking}
      canvasWidth={1280}
      canvasHeight={540}
      muted={muted}
    >
      <div className="absolute top-8 left-12 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        <span>Material flow</span>
        <span aria-hidden>Left to right</span>
      </div>

      <div
        className="absolute rounded-lg border border-slate-200 bg-slate-50/45"
        style={{ left: 466, top: 70, width: 370, height: 410 }}
        aria-hidden
      />
      <span
        className="absolute z-10 text-[11px] font-bold tracking-wide text-slate-500 uppercase"
        style={{ left: 488, top: 86 }}
      >
        Bay 1 tracked positions
      </span>

      <span
        className="absolute z-10 text-[10px] font-semibold tracking-wide text-slate-400 uppercase"
        style={{ left: 129, top: 86 }}
      >
        Handoff from Stackers
      </span>

      <Zone zoneName="SGRT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={125} top={126} width={225} />
      <Zone zoneName="NCCT1" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={520} top={112} width={260} />

      <Zone zoneName="SGRT2" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={125} top={316} width={225} />
      <Zone zoneName="NCCT2" bundlesByZone={bundlesByZone} hasSnapshot={hasSnapshot} left={520} top={302} width={260} />

      <DiagramArrow direction="right" left={368} top={242} size={48} />
      <div
        className="absolute z-10 flex flex-col items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-center"
        style={{ left: 416, top: 216, width: 82 }}
      >
        <GitBranch className="size-5 text-slate-500" aria-hidden />
        <span className="text-[9px] font-semibold text-slate-500">Route choice</span>
      </div>
      <DiagramArrow direction="right" left={498} top={242} size={24} />
      <DiagramArrow direction="right" left={868} top={242} size={56} />

      <div
        className="absolute z-10 rounded-lg border border-dashed border-slate-300 bg-white/70"
        style={{ left: 960, top: 72, width: 286, height: 408 }}
      >
        <span className="absolute top-4 right-5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          Physical equipment context
        </span>
      </div>
      <EquipmentContext
        title="Bay 1 Manual Station"
        note="Equipment context; not a CurrentZone slot"
        left={988}
        top={126}
        width={230}
      />
      <EquipmentContext
        title="Scale Weight Station"
        note="Equipment context; tracking remains at zone level"
        left={988}
        top={316}
        width={230}
        tone="scale"
      />

      <p className="absolute bottom-6 left-[134px] max-w-[680px] text-[11px] leading-4 text-slate-500">
        Bundle placement comes from CurrentZone. The backend selects NCCT1 or NCCT2; the HMI does not infer a
        one-to-one pairing with SGRT1/2 or with the equipment cards.
      </p>
    </SchematicScreen>
  )
}
