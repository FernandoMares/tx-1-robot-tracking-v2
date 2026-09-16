"use client"

import { useMemo, useState } from "react"

import { AlertsPanel } from "@/components/alerts-panel"
import { AppHeader } from "@/components/app-header"
import { DEFAULT_FILTERS, FiltersPanel, type PlantFilters } from "@/components/filters-panel"
import { KpiCards } from "@/components/kpi-cards"
import { GlobalMillOrderPanel } from "@/components/mill-order-selection-panel"
import { BayOneSchematic } from "@/components/plant/bay-one-schematic"
import { BayTwoSchematic } from "@/components/plant/bay-two-schematic"
import { BundlerSchematic } from "@/components/plant/bundler-schematic"
import { PlantMap } from "@/components/plant/plant-map"
import { StackersSchematic } from "@/components/plant/stackers-schematic"
import { TrackingBundlesPanel } from "@/components/tracking-bundles-panel"
import { TrackingConnectionBanner } from "@/components/tracking-connection-banner"
import { usePlantState } from "@/hooks/use-plant-state"
import type { PlantView } from "@/lib/types"

export function Dashboard() {
  const {
    tables,
    alerts,
    kpis,
    updatedAt,
    animationRunning,
    setAnimationRunning,
    tracking,
    trackingConfig,
    bundlesByZone,
    trackingLayoutValidation,
    retryTracking,
  } = usePlantState()

  const [view, setView] = useState<PlantView>("overview")
  const [filters, setFilters] = useState<PlantFilters>(DEFAULT_FILTERS)

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

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader
        view={view}
        onViewChange={setView}
        animationRunning={animationRunning}
        onToggleAnimation={() => setAnimationRunning((previous) => !previous)}
        showAnimationControl
        alertCount={alerts.length}
        operatorInitials={tracking.mode === "mock" ? "RT" : null}
      />

      <div className="flex flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-2 px-2 py-2 sm:px-3">
          <TrackingConnectionBanner
            tracking={tracking}
            layoutValidation={trackingLayoutValidation}
            onRetry={retryTracking}
          />
          <KpiCards kpis={kpis} tracking={tracking} />

          <div
            className={
              tracking.mode === "mock"
                ? "grid items-start gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]"
                : "flex min-w-0 flex-col gap-2"
            }
          >
            <div
              className={
                tracking.mode === "mock"
                  ? "flex flex-col gap-4"
                  : "grid min-w-0 items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_auto]"
              }
            >
              {tracking.mode === "mock" ? (
                <>
                  <AlertsPanel alerts={alerts} />
                  <FiltersPanel filters={filters} onChange={setFilters} />
                </>
              ) : (
                <>
                  <GlobalMillOrderPanel tracking={tracking} config={trackingConfig} />
                  <TrackingBundlesPanel tracking={tracking} />
                </>
              )}
            </div>

            {view === "overview" && (
              <PlantMap
                tables={tables}
                updatedAt={updatedAt}
                animationRunning={animationRunning}
                tracking={tracking}
                matchedIds={matchedIds}
                bundlesByZone={bundlesByZone}
              />
            )}

            {view === "stackers" && (
              <StackersSchematic
                updatedAt={updatedAt}
                animationRunning={animationRunning}
                matchedIds={matchedIds}
                tracking={tracking}
                bundlesByZone={bundlesByZone}
              />
            )}

            {view === "bay-1" && (
              <BayOneSchematic
                updatedAt={updatedAt}
                animationRunning={animationRunning}
                matchedIds={matchedIds}
                tracking={tracking}
                bundlesByZone={bundlesByZone}
              />
            )}

            {view === "bay-2" && (
              <BayTwoSchematic
                updatedAt={updatedAt}
                animationRunning={animationRunning}
                matchedIds={matchedIds}
                tracking={tracking}
                bundlesByZone={bundlesByZone}
              />
            )}

            {view === "bundler" && (
              <BundlerSchematic
                updatedAt={updatedAt}
                animationRunning={animationRunning}
                matchedIds={matchedIds}
                tracking={tracking}
                bundlesByZone={bundlesByZone}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
