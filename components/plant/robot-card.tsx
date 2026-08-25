"use client"

import { Bot } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Robot } from "@/lib/types"

interface RobotCardProps {
  robot: Robot
  className?: string
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

      <Bot
        className={cn("size-9", robot.online ? "text-cell-fill" : "text-muted-foreground")}
        strokeWidth={1.75}
        aria-hidden
      />

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
