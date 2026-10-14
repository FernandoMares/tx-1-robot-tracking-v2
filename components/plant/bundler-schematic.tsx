"use client"

import {
  BUNDLER_SCHEMATIC_WIDTH,
  MAIN_SCHEMATIC_HEIGHT,
  MainSchematic,
} from "@/components/plant/main-schematic"
import { SchematicScreen } from "@/components/plant/schematic-screen"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import type { BundlesByZone } from "@/lib/tracking-zone-layout"

interface BundlerSchematicProps {
  updatedAt: Date | null
  animationRunning: boolean
  matchedIds?: Set<string> | null
  tracking: TrackingRuntimeState
  /** Shared CurrentZone grouping from the single dashboard polling loop. */
  bundlesByZone: BundlesByZone
}

/** Overview layout with only Stackers, STRT1/2 and LFRT1/2/3 omitted. */
export function BundlerSchematic({
  updatedAt,
  animationRunning,
  matchedIds = null,
  tracking,
  bundlesByZone,
}: BundlerSchematicProps) {
  return (
    <SchematicScreen
      title="Bundler"
      description="Overview layout · Bundler, scale and tracking sections · Stacker branch hidden"
      updatedAt={updatedAt}
      animationRunning={animationRunning}
      tracking={tracking}
      canvasWidth={BUNDLER_SCHEMATIC_WIDTH}
      canvasHeight={MAIN_SCHEMATIC_HEIGHT}
      maxScale={1.3}
      muted={Boolean(matchedIds && !matchedIds.has("bundler-1"))}
    >
      <MainSchematic
        variant="bundler"
        animationRunning={animationRunning}
        bundlesByZone={bundlesByZone}
        hasSnapshot={tracking.mode === "mock" || tracking.trackingState !== null}
      />
    </SchematicScreen>
  )
}
