import { TrendingUp } from "lucide-react"

import { formatCount } from "@/lib/status"
import type { PlantKpis } from "@/lib/types"

interface KpiCardsProps {
  kpis: PlantKpis
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const tiles = [
    { label: "Total bundles", value: formatCount(kpis.totalBundles), footnote: "All tables" },
    { label: "Tables active", value: formatCount(kpis.tablesActive), footnote: "With bundles" },
    { label: "Bundles in process", value: formatCount(kpis.bundlesInProcess), footnote: "Active on tables" },
    {
      label: "Bundles completed (today)",
      value: formatCount(kpis.bundlesCompleted),
      footnote: `${kpis.completedTrendPct}% vs yesterday`,
      trend: true,
    },
  ]

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
