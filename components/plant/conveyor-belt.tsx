"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

/** Pieces carried side by side in one batch. */
const BATCH_SIZE = 5
/** Chip footprint and the spacing between chips of the same batch, in px. */
const PIECE_W = 14
const PIECE_GAP = 2
/** Clear space between consecutive batches. */
const BATCH_GAP = 44
/** Travel speed, identical on every belt regardless of its length. */
const SPEED_PX_S = 45

const BATCH_W = BATCH_SIZE * PIECE_W + (BATCH_SIZE - 1) * PIECE_GAP
/** Distance from one batch to the next, and the seamless loop step. */
const PITCH = BATCH_W + BATCH_GAP

interface ConveyorBeltProps {
  /** Direction in which both the bundles and arrow travel. */
  direction?: "left" | "right"
  /** Optional direction arrow before the moving track. */
  showStartArrow?: boolean
  /** Direction arrow after the moving track. */
  showEndArrow?: boolean
  /** Freezes travel when the board is paused. */
  running?: boolean
  className?: string
}

/**
 * A horizontal belt carrying batches of five bundles that move in parallel.
 * The row is two batches longer than the visible track and shifts by exactly
 * one pitch per cycle, so the stream repeats without gaps at the loop seam.
 */
export function ConveyorBelt({
  direction = "right",
  showStartArrow = false,
  showEndArrow = true,
  running = true,
  className,
}: ConveyorBeltProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [trackW, setTrackW] = useState(0)
  const DirectionIcon = direction === "left" ? ArrowLeft : ArrowRight

  // Belts vary from ~280px to ~2600px, so the batch count is measured rather
  // than configured; that also keeps px/s speed identical across all of them.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setTrackW(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Keep the first paint populated while ResizeObserver measures the track.
  // The stream is clipped, so this fallback also works for short conveyors.
  const batchCount = trackW > 0 ? Math.ceil(trackW / PITCH) + 2 : 8
  const inTransit = trackW > 0 ? Math.floor(trackW / PITCH) * BATCH_SIZE : BATCH_SIZE

  return (
    <div
      className={cn(
        "belt-ticks relative flex h-7 min-w-0 items-center gap-2 rounded-md border border-border bg-belt px-2",
        className,
      )}
      role="img"
      aria-label={`Conveyor with ${inTransit} bundles in transit, in batches of ${BATCH_SIZE}`}
    >
      {showStartArrow && (
        <DirectionIcon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2.5} aria-hidden />
      )}

      {/*
       * The batch row is absolutely positioned so it contributes no intrinsic
       * width. In flow it would widen the track, and an ancestor grid item's
       * `min-width: auto` would keep growing the column, feeding the measured
       * width back in and spawning ever more batches.
       */}
      <div ref={trackRef} className="relative h-full min-w-0 flex-1 overflow-hidden">
        <div
          className="belt-stream absolute inset-y-0 left-0 flex items-center"
          style={{
            gap: `${BATCH_GAP}px`,
            "--belt-pitch": `${PITCH}px`,
            "--belt-duration": `${PITCH / SPEED_PX_S}s`,
            animationPlayState: running ? "running" : "paused",
            animationDirection: direction === "left" ? "reverse" : "normal",
          } as React.CSSProperties}
        >
          {Array.from({ length: batchCount }, (_, batch) => (
            <span key={batch} className="flex shrink-0 items-center" style={{ gap: `${PIECE_GAP}px` }}>
              {Array.from({ length: BATCH_SIZE }, (_, piece) => (
                <span
                  key={piece}
                  className="h-3.5 shrink-0 rounded-[2px] bg-cell-fill"
                  style={{ width: `${PIECE_W}px` }}
                  aria-hidden
                />
              ))}
            </span>
          ))}
        </div>
      </div>

      {showEndArrow && (
        <DirectionIcon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2.5} aria-hidden />
      )}
    </div>
  )
}
