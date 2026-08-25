"use client"

import { RotateCcw, SlidersHorizontal } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FILTER_OPTIONS } from "@/lib/mock-data"

export interface PlantFilters {
  table: string
  status: string
  shift: string
}

export const DEFAULT_FILTERS: PlantFilters = { table: "all", status: "all", shift: "all" }

interface FiltersPanelProps {
  filters: PlantFilters
  onChange: (filters: PlantFilters) => void
}

export function FiltersPanel({ filters, onChange }: FiltersPanelProps) {
  const groups = [
    { key: "table" as const, options: FILTER_OPTIONS.tables },
    { key: "status" as const, options: FILTER_OPTIONS.statuses },
    { key: "shift" as const, options: FILTER_OPTIONS.shifts },
  ]

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="Filters">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
        Filters
      </h2>

      {groups.map((group) => (
        <Select
          key={group.key}
          items={group.options}
          value={filters[group.key]}
          onValueChange={(value: string | null) => onChange({ ...filters, [group.key]: value ?? "all" })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {group.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      <button
        type="button"
        onClick={() => onChange(DEFAULT_FILTERS)}
        className="flex items-center gap-2 self-start rounded-md px-1 py-1 text-sm text-muted-foreground transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <RotateCcw className="size-3.5" aria-hidden />
        Clear filters
      </button>
    </section>
  )
}
