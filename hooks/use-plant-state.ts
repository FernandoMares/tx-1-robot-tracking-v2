"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { useTrackingApi } from "@/hooks/use-tracking-api"
import { ALL_TABLES, INITIAL_ALERTS } from "@/lib/mock-data"
import {
  groupTrackingBundlesByZone,
  validateTrackingLayout,
} from "@/lib/tracking-zone-layout"
import type { PlantKpis, PlantTable } from "@/lib/types"

const TICK_MS = 1200

interface PlantState {
  tables: PlantTable[]
  completed: number
  updatedAt: Date
}

function initialState(): PlantState {
  return {
    tables: ALL_TABLES,
    completed: 4051,
    // Fixed timestamp keeps the server and first client render identical.
    updatedAt: new Date(2026, 7, 24, 10, 24, 30),
  }
}

/**
 * Nudges table fill so the board feels live. Warning/error tables hold their
 * value: an operator watching an overloaded mesa should not see it drift.
 */
function driftTables(tables: PlantTable[], tick: number): PlantTable[] {
  return tables.map((table, index) => {
    if (table.status !== "active") return table
    // Deterministic per-table wave rather than Math.random, so the motion is smooth.
    const delta = Math.round(Math.sin((tick + index * 2) / 3) * 2)
    const fillPct = Math.min(97, Math.max(38, table.fillPct + delta))
    const capacity = Math.round((table.bundleCount / Math.max(table.fillPct, 1)) * 100)
    return { ...table, fillPct, bundleCount: Math.max(4, Math.round((capacity * fillPct) / 100)) }
  })
}

export function usePlantState() {
  const [state, setState] = useState<PlantState>(initialState)
  const [animationRunning, setAnimationRunning] = useState(true)
  const mockTick = useRef(0)
  const { tracking, retry, config } = useTrackingApi()

  useEffect(() => {
    if (tracking.mode !== "mock") return

    const timer = window.setInterval(() => {
      mockTick.current += 1
      setState((prev) => ({
        ...prev,
        tables: driftTables(prev.tables, mockTick.current),
        completed: prev.completed + (mockTick.current % 4 === 0 ? 1 : 0),
        updatedAt: new Date(),
      }))
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [tracking.mode])

  const kpis: PlantKpis = useMemo(() => {
    const onTables = state.tables.reduce((sum, table) => sum + table.bundleCount, 0)
    return {
      // Plant total includes yard stock beyond what the tables hold.
      totalBundles: 6481 + onTables,
      tablesActive: 105,
      bundlesInProcess: onTables + 180,
      bundlesCompleted: state.completed,
      completedTrendPct: 12,
    }
  }, [state.tables, state.completed])

  const bundlePlacement = useMemo(
    () => groupTrackingBundlesByZone(tracking.trackingState?.Bundles ?? []),
    [tracking.trackingState],
  )

  const trackingLayoutValidation = useMemo(
    () =>
      tracking.topology?.ScenarioName === "TX1_TAGGER_TRACKING"
        ? validateTrackingLayout(tracking.topology)
        : null,
    [tracking.topology],
  )

  return {
    tables: state.tables,
    alerts: tracking.mode === "mock" ? INITIAL_ALERTS : [],
    kpis,
    updatedAt: tracking.mode === "live" ? tracking.lastSuccessfulPollAt : state.updatedAt,
    animationRunning,
    setAnimationRunning,
    tracking,
    trackingConfig: config,
    bundlesByZone: bundlePlacement.byZone,
    bundlesWithoutZone: bundlePlacement.withoutZone,
    bundlesInUnknownZones: bundlePlacement.unknownZone,
    trackingLayoutValidation,
    retryTracking: retry,
  }
}
