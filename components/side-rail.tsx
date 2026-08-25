"use client"

import { BarChart3, CircleHelp, ClipboardList, Layers, LayoutGrid, Settings } from "lucide-react"

import { cn } from "@/lib/utils"

const ITEMS = [
  { id: "overview", label: "Plant overview", icon: LayoutGrid },
  { id: "tables", label: "Tables", icon: Layers },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
]

/** Narrow icon rail on the far left, present on desktop only. */
export function SideRail() {
  return (
    <nav
      className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-4 lg:flex"
      aria-label="Main navigation"
    >
      {ITEMS.map((item, index) => {
        const Icon = item.icon
        const active = index === 0
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? "page" : undefined}
            title={item.label}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "bg-zone/10 text-zone"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-4.5" aria-hidden />
            <span className="sr-only">{item.label}</span>
          </button>
        )
      })}

      <button
        type="button"
        title="Help"
        className="mt-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <CircleHelp className="size-4.5" aria-hidden />
        <span className="sr-only">Help</span>
      </button>
    </nav>
  )
}
