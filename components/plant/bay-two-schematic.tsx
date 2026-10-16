"use client"

import {
  BAY_TWO_SCHEMATIC_WIDTH,
  MAIN_SCHEMATIC_HEIGHT,
  MainSchematic,
} from "@/components/plant/main-schematic"
import { SchematicScreen } from "@/components/plant/schematic-screen"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import type { BundlesByZone } from "@/lib/tracking-zone-layout"

interface BayTwoSchematicProps {
  updatedAt: Date | null
  animationRunning: boolean
  matchedIds: Set<string> | null
  tracking: TrackingRuntimeState
  /** Shared CurrentZone grouping from the single dashboard polling loop. */
  bundlesByZone: BundlesByZone
}

/** Right-hand Overview crop: tracking sections, transfers, scale and Robot 2. */
export function BayTwoSchematic({
  updatedAt,
  animationRunning,
  matchedIds,
  tracking,
  bundlesByZone,
}: BayTwoSchematicProps) {
  return (
    <SchematicScreen
      title="Bay 2"
      description="Overview layout · Transfers, tracking sections, scale and Robot 2"
      updatedAt={updatedAt}
      animationRunning={animationRunning}
      tracking={tracking}
      canvasWidth={BAY_TWO_SCHEMATIC_WIDTH}
      canvasHeight={MAIN_SCHEMATIC_HEIGHT}
      maxScale={1.3}
      muted={Boolean(matchedIds && !matchedIds.has("bay2-t3"))}
    >
      <MainSchematic
        variant="bay-2"
        animationRunning={animationRunning}
        bundlesByZone={bundlesByZone}
        hasSnapshot={tracking.mode === "mock" || tracking.trackingState !== null}
      />
    </SchematicScreen>
  )
}
