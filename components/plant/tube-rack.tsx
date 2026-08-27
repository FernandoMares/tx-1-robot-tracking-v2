"use client"

import { useEffect, useRef, useState } from "react"

import {
  CONVEYOR_SPEED_PX_S,
  TUBE_BATCH_SPACING_PX,
} from "@/components/plant/conveyor-belt"
import { cn } from "@/lib/utils"

export type TubeDirection = "left" | "right" | "up" | "down"

interface TubeRackProps {
  direction?: TubeDirection
  running?: boolean
  empty?: boolean
  muted?: boolean
  className?: string
  label?: string
  style?: React.CSSProperties
}

const HORIZONTAL_LOAD_W = 116
const VERTICAL_LOAD_H = 58
const TUBE_ROWS = 7

function TubeLoad({ vertical }: { vertical: boolean }) {
  return (
    <span
      className={cn(
        "grid shrink-0 gap-1",
        vertical ? "h-[3.625rem] w-[calc(100%-1rem)]" : "h-[calc(100%-0.875rem)] w-[7.25rem]",
      )}
      style={{ gridTemplateRows: `repeat(${TUBE_ROWS}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {Array.from({ length: TUBE_ROWS }, (_, row) => (
        <span key={row} className="rounded-[2px] bg-cell-fill" />
      ))}
    </span>
  )
}

/**
 * A physical storage rack from the official workbook. Tube loads keep their
 * horizontal shape while travelling in the arrow direction through the rack.
 */
export function TubeRack({
  direction = "right",
  running = true,
  empty = false,
  muted = false,
  className,
  label = "Tube rack",
  style,
}: TubeRackProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [axisLength, setAxisLength] = useState(0)
  const vertical = direction === "up" || direction === "down"
  const loadLength = vertical ? VERTICAL_LOAD_H : HORIZONTAL_LOAD_W
  const pitch = loadLength + TUBE_BATCH_SPACING_PX

  useEffect(() => {
    const element = trackRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      setAxisLength(vertical ? entry.contentRect.height : entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [vertical])

  const loadCount = axisLength > 0 ? Math.ceil(axisLength / pitch) + 2 : 5
  const reverse = direction === "left" || direction === "up"

  return (
    <div
      ref={trackRef}
      className={cn(
        "tube-rack-lines relative overflow-hidden border border-slate-300 bg-white/90",
        muted && "opacity-35 saturate-50",
        className,
      )}
      style={style}
      role="img"
      aria-label={
        empty
          ? `${label}, empty`
          : `${label}, tubes, flow direction ${direction}${running ? "" : ", paused"}`
      }
    >
      {!empty && (
        <div
          className={cn(
            "tube-rack-stream absolute flex",
            vertical
              ? "inset-x-0 top-0 flex-col items-center"
              : "inset-y-0 left-0 items-center",
          )}
          style={
            {
              gap: `${TUBE_BATCH_SPACING_PX}px`,
              "--tube-rack-pitch": `${pitch}px`,
              "--tube-rack-duration": `${pitch / CONVEYOR_SPEED_PX_S}s`,
              animationName: vertical ? "tube-rack-y" : "tube-rack-x",
              animationPlayState: running ? "running" : "paused",
              animationDirection: reverse ? "reverse" : "normal",
            } as React.CSSProperties
          }
        >
          {Array.from({ length: loadCount }, (_, load) => (
            <TubeLoad key={load} vertical={vertical} />
          ))}
        </div>
      )}
    </div>
  )
}
