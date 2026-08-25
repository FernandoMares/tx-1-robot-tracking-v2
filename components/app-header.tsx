"use client"

import { Bell, LayoutGrid } from "lucide-react"

import { PLANT_NAME } from "@/lib/mock-data"
import type { PlantView } from "@/lib/types"
import { cn } from "@/lib/utils"

const TABS: { id: PlantView; label: string }[] = [
  { id: "overview", label: "Plant Overview" },
  { id: "stackers", label: "Stackers" },
  { id: "bundler", label: "Bundler" },
  { id: "bay-1", label: "Bay 1" },
  { id: "bay-2", label: "Bay 2" },
]

interface AppHeaderProps {
  view: PlantView
  onViewChange: (view: PlantView) => void
  live: boolean
  onToggleLive: () => void
  alertCount: number
  operatorInitials: string
}

/**
 * Scrollable view switcher. Rendered inline on wide screens and as a second
 * header row on narrow ones, where five tabs cannot share the top bar.
 */
function ViewTabs({
  view,
  onViewChange,
  className,
}: {
  view: PlantView
  onViewChange: (view: PlantView) => void
  className?: string
}) {
  return (
    <nav className={cn("items-center gap-1 overflow-x-auto", className)} aria-label="Plant views">
      {TABS.map((tab) => {
        const active = view === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onViewChange(tab.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition focus-visible:ring-2 focus-visible:ring-topbar-foreground/40 focus-visible:outline-none",
              active
                ? "bg-topbar-active font-medium text-topbar-foreground"
                : "text-topbar-muted hover:text-topbar-foreground",
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}

export function AppHeader({ view, onViewChange, live, onToggleLive, alertCount, operatorInitials }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-topbar text-topbar-foreground">
      <div className="flex h-14 items-center gap-4 px-4 sm:px-5">
        <LayoutGrid className="size-5 shrink-0" strokeWidth={2} aria-hidden />

        <span className="shrink-0 text-base font-semibold whitespace-nowrap">{PLANT_NAME}</span>

        <ViewTabs view={view} onViewChange={onViewChange} className="hidden min-w-0 flex-1 lg:flex" />

        <span className="flex-1 lg:hidden" aria-hidden />

        <button
          type="button"
          onClick={onToggleLive}
          aria-pressed={live}
          className="flex shrink-0 items-center gap-2 rounded-md border border-topbar-active px-2.5 py-1 text-xs font-medium transition hover:bg-topbar-active focus-visible:ring-2 focus-visible:ring-topbar-foreground/40 focus-visible:outline-none"
        >
          <span
            className={cn("size-1.5 rounded-full", live ? "animate-soft-pulse bg-active" : "bg-topbar-muted")}
            aria-hidden
          />
          {live ? "Live" : "Paused"}
        </button>

        <button
          type="button"
          className="relative shrink-0 rounded-md p-1.5 text-topbar-muted transition hover:text-topbar-foreground focus-visible:ring-2 focus-visible:ring-topbar-foreground/40 focus-visible:outline-none"
          aria-label={`Notifications, ${alertCount} unread`}
        >
          <Bell className="size-4" aria-hidden />
          {alertCount > 0 && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-error" aria-hidden />}
        </button>

        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-topbar-active text-xs font-semibold"
          aria-label={`Operator ${operatorInitials}`}
        >
          {operatorInitials}
        </span>
      </div>

      <ViewTabs
        view={view}
        onViewChange={onViewChange}
        className="flex border-t border-topbar-active px-4 py-2 lg:hidden"
      />
    </header>
  )
}
