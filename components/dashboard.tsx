"use client"

import { useMemo, useState } from "react"

import { AlertsPanel } from "@/components/alerts-panel"
import { AppHeader } from "@/components/app-header"
import { DEFAULT_FILTERS, FiltersPanel, type PlantFilters } from "@/components/filters-panel"
import { KpiCards } from "@/components/kpi-cards"
import { BayOneSchematic } from "@/components/plant/bay-one-schematic"
import { BayTwoSchematic } from "@/components/plant/bay-two-schematic"
import { PlantMap } from "@/components/plant/plant-map"
import { StackersSchematic } from "@/components/plant/stackers-schematic"
import { ZoneView } from "@/components/plant/zone-view"
import { SideRail } from "@/components/side-rail"
import { TableDetailPanel } from "@/components/table-detail-panel"
import { TrackingBundlesPanel } from "@/components/tracking-bundles-panel"
import { TrackingConnectionBanner } from "@/components/tracking-connection-banner"
import { usePlantState } from "@/hooks/use-plant-state"
import type { PlantTable, PlantView } from "@/lib/types"

const BUNDLER_VIEW = {
  title: "Bundler",
  description: "Bundler table and its current fill",
} as const

export function Dashboard() {
  const {
    tables,
    alerts,
    kpis,
    updatedAt,
    animationRunning,
    setAnimationRunning,
    tracking,
    retryTracking,
  } = usePlantState()

  const [view, setView] = useState<PlantView>("overview")
  const [filters, setFilters] = useState<PlantFilters>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<PlantTable | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const filtersActive = filters.table !== "all" || filters.status !== "all"

  /**
   * Filters narrow which tables are considered. Zone views drop non-matching
   * tables; the map keeps the full plant layout and dims the rest instead.
   */
  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      if (filters.table !== "all" && table.id !== filters.table) return false
      if (filters.status !== "all" && table.status !== filters.status) return false
      return true
    })
  }, [tables, filters])

  const matchedIds = useMemo(
    () => (filtersActive ? new Set(filteredTables.map((table) => table.id)) : null),
    [filtersActive, filteredTables],
  )

  const handleSelectTable = (table: PlantTable) => {
    setSelected(table)
    setDetailOpen(true)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader
        view={view}
        onViewChange={setView}
        animationRunning={animationRunning}
        onToggleAnimation={() => setAnimationRunning((previous) => !previous)}
        showAnimationControl={view !== "bundler"}
        alertCount={alerts.length}
        operatorInitials={tracking.mode === "mock" ? "RT" : null}
      />

      <div className="flex flex-1">
        <SideRail />

        <main className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-5">
          <TrackingConnectionBanner tracking={tracking} onRetry={retryTracking} />
          <KpiCards kpis={kpis} tracking={tracking} />

          <div className="grid items-start gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              {tracking.mode === "mock" ? (
                <>
                  <AlertsPanel alerts={alerts} />
                  <FiltersPanel filters={filters} onChange={setFilters} />
                </>
              ) : (
                <TrackingBundlesPanel tracking={tracking} />
              )}
            </div>

            {view === "overview" && (
              <PlantMap
                tables={tables}
                updatedAt={updatedAt}
                animationRunning={animationRunning}
                tracking={tracking}
                matchedIds={matchedIds}
              />
            )}

            {view === "stackers" && (
              <StackersSchematic
                updatedAt={updatedAt}
                animationRunning={animationRunning}
                matchedIds={matchedIds}
                tracking={tracking}
              />
            )}

            {view === "bay-1" && (
              <BayOneSchematic
                updatedAt={updatedAt}
                animationRunning={animationRunning}
                matchedIds={matchedIds}
                tracking={tracking}
              />
            )}

            {view === "bay-2" && (
              <BayTwoSchematic
                updatedAt={updatedAt}
                animationRunning={animationRunning}
                matchedIds={matchedIds}
                tracking={tracking}
              />
            )}

            {view === "bundler" && (
              <ZoneView
                title={BUNDLER_VIEW.title}
                description={BUNDLER_VIEW.description}
                tables={filteredTables.filter((table) => table.zone === "bundler")}
                updatedAt={updatedAt}
                selectedId={selected?.id ?? null}
                onSelectTable={handleSelectTable}
                showDemoData={tracking.mode === "mock"}
                liveSyncStatus={tracking.syncStatus}
                liveBundleCount={
                  tracking.trackingState?.Bundles.filter((bundle) => bundle.SourceArea === "BUND").length ?? null
                }
              />
            )}
          </div>
        </main>
      </div>

      <TableDetailPanel table={selected} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  )
}
