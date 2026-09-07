import { TrendingUp } from "lucide-react"

import { formatCount } from "@/lib/status"
import type { TrackingRuntimeState } from "@/lib/tracking-api"
import type { PlantKpis } from "@/lib/types"

interface KpiCardsProps {
  kpis: PlantKpis
  tracking: TrackingRuntimeState
}

interface KpiTile {
  label: string
  value: string
  footnote: string
  trend?: boolean
}

export function KpiCards({ kpis, tracking }: KpiCardsProps) {
  const liveBundles = tracking.trackingState?.Bundles ?? null
  const liveTiles: KpiTile[] = [
    {
      label: "Active tracked bundles",
      value: liveBundles ? formatCount(liveBundles.length) : "—",
      footnote: "Current /tracking/state snapshot",
    },
    {
      label: "Occupied zones",
      value: liveBundles
        ? formatCount(new Set(liveBundles.flatMap((bundle) => (bundle.CurrentZone ? [bundle.CurrentZone] : []))).size)
        : "—",
      footnote: "Zones containing tracked bundles",
    },
    {
      label: "Configured zones",
      value: tracking.topology
        ? formatCount(tracking.topology.Zones.filter((zone) => zone.IsEnabled).length)
        : "—",
      footnote: "Enabled in /tracking/map",
    },
    {
      label: "QMOS unmatched",
      value: liveBundles
        ? formatCount(liveBundles.filter((bundle) => bundle.CorrelationStatus === "UNMATCHED").length)
        : "—",
      footnote: "CorrelationStatus = UNMATCHED",
    },
  ]

  const mockTiles: KpiTile[] = [
    { label: "Total bundles", value: formatCount(kpis.totalBundles), footnote: "Demo · all tables" },
    { label: "Tables active", value: formatCount(kpis.tablesActive), footnote: "Demo · with bundles" },
    {
      label: "Bundles in process",
      value: formatCount(kpis.bundlesInProcess),
      footnote: "Demo · active on tables",
    },
    {
      label: "Bundles completed (today)",
      value: formatCount(kpis.bundlesCompleted),
      footnote: `Demo · ${kpis.completedTrendPct}% vs yesterday`,
      trend: true,
    },
  ]

  const tiles = tracking.mode === "live" ? liveTiles : mockTiles

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <article
          key={tile.label}
          className="flex flex-col gap-2 rounded-xl border border-border bg-card px-5 py-4"
        >
          <span className="kpi-label">{tile.label}</span>
          <span className="tabular text-3xl leading-none font-semibold text-foreground">{tile.value}</span>
          {tile.trend ? (
            <span className="flex items-center gap-1 text-xs font-medium text-active-fg">
              <TrendingUp className="size-3.5" aria-hidden />
              {tile.footnote}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{tile.footnote}</span>
          )}
        </article>
      ))}
    </div>
  )
}
