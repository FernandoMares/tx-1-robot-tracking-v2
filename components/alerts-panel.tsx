"use client"

import { Bell, ChevronRight } from "lucide-react"

import { ALERT_META, formatAge } from "@/lib/status"
import type { PlantAlert } from "@/lib/types"
import { cn } from "@/lib/utils"

interface AlertsPanelProps {
  alerts: PlantAlert[]
  onViewAll?: () => void
}

export function AlertsPanel({ alerts, onViewAll }: AlertsPanelProps) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="Alerts">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Bell className="size-4 text-muted-foreground" aria-hidden />
        Alerts
      </h2>

      <ul className="flex flex-col gap-2">
        {alerts.map((alert) => {
          const meta = ALERT_META[alert.severity]
          return (
            <li key={alert.id}>
              <div className={cn("flex flex-col gap-1 rounded-lg border px-3 py-2.5", meta.surface)}>
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("text-xs font-semibold", meta.source)}>{alert.source}</span>
                  <span className="tabular shrink-0 text-[0.6875rem] text-muted-foreground">
                    {formatAge(alert.ageMin)}
                  </span>
                </div>
                <span className="text-sm text-foreground">{alert.message}</span>
              </div>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={onViewAll}
        className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        View all alerts
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </button>
    </section>
  )
}
