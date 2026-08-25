"use client"

import { cn } from "@/lib/utils"
import type { Robot } from "@/lib/types"

interface RobotCardProps {
  robot: Robot
  className?: string
}

/** Compact industrial arm silhouette used by the plant-floor mockup. */
function RobotArmIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden
    >
      <path d="M11 53h26l3 6H8l3-6Z" fill="currentColor" opacity="0.92" />
      <path d="M17 49h15l2 4H15l2-4Z" fill="currentColor" />
      <path d="M22 47V36" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="24" cy="32" r="6" fill="white" stroke="currentColor" strokeWidth="4" />
      <path d="m28 28 12-12" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="43" cy="14" r="5" fill="white" stroke="currentColor" strokeWidth="4" />
      <path d="m47 17 8 7" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <circle cx="57" cy="27" r="3.5" fill="white" stroke="currentColor" strokeWidth="3" />
      <path d="m58 31-2 6m2-6 5 4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** A robot cell node, shown between the tables it feeds. */
export function RobotCard({ robot, className }: RobotCardProps) {
  return (
    <div
      className={cn("flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-3", className)}
      role="group"
      aria-label={`${robot.label}, ${robot.online ? "online" : "offline"}, ${robot.note}`}
    >
      <span className="zone-caption self-start">{robot.label}</span>

      <RobotArmIcon className={cn("size-12", robot.online ? "text-cell-fill" : "text-muted-foreground")} />

      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span
          className={cn("size-1.5 rounded-full", robot.online ? "bg-active" : "bg-idle")}
          aria-hidden
        />
        {robot.online ? "Online" : "Offline"}
      </span>

      <span className="text-xs text-muted-foreground">{robot.note}</span>
    </div>
  )
}
