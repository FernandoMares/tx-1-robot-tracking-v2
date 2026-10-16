"use client"

import {
  MainSchematic,
  STACKER_SCHEMATIC_HEIGHT,
  STACKER_SCHEMATIC_WIDTH,
} from "@/components/plant/main-schematic"
import { SchematicScreen } from "@/components/plant/schematic-screen"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import type { BundlesByZone } from "@/lib/tracking-zone-layout"

interface StackerSchematicProps {
  /** Bay 1 temporarily shares this view, keeping its own tab/header identity. */
  title?: "Stacker" | "Bay 1"
  updatedAt: Date | null
  animationRunning: boolean
  matchedIds: Set<string> | null
  tracking: TrackingRuntimeState
  /** Shared CurrentZone grouping from the single dashboard polling loop. */
  bundlesByZone: BundlesByZone
}

/** Shared Stacker/Bay 1 view; the existing plural Stackers stays separate. */
export function StackerSchematic({
  title = "Stacker",
  updatedAt,
  animationRunning,
  matchedIds,
  tracking,
  bundlesByZone,
}: StackerSchematicProps) {
  return (
    <SchematicScreen
      title={title}
      description="Overview layout · Stacker route, SGRT scale and NCCT exits"
      updatedAt={updatedAt}
      animationRunning={animationRunning}
      tracking={tracking}
      canvasWidth={STACKER_SCHEMATIC_WIDTH}
      canvasHeight={STACKER_SCHEMATIC_HEIGHT}
      maxScale={1.3}
      muted={Boolean(matchedIds && ["stk-a", "stk-b", "stk-c", "stk-d"].every((id) => !matchedIds.has(id)))}
    >
      <MainSchematic
        variant="stacker"
        animationRunning={animationRunning}
        bundlesByZone={bundlesByZone}
        hasSnapshot={tracking.mode === "mock" || tracking.trackingState !== null}
      />
    </SchematicScreen>
  )
}
