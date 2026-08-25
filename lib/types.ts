/** Health of a table or piece of equipment, driving every status colour. */
export type PlantStatus = "active" | "warning" | "error" | "empty" | "offline"

/** Physical areas of the plant, matching the tab bar. */
export type ZoneId = "stackers" | "bundler" | "bay-1" | "bay-2"

/** Screens reachable from the top navigation. */
export type PlantView = "overview" | "stackers" | "bundler" | "bay-1" | "bay-2"

/**
 * A single table on the floor. `bundleCount` is what operators read, while
 * `fillPct` drives the cell grid so the two never disagree.
 */
export interface PlantTable {
  id: string
  /** Short name shown inside the card, e.g. "A" or "Table 1". */
  name: string
  /** Uppercase caption above the card, e.g. "BAY 2". */
  zoneLabel: string
  zone: ZoneId
  bundleCount: number
  /** Utilisation 0-100, rendered as the corner percentage. */
  fillPct: number
  status: PlantStatus
  /** Cell grid shape. */
  rows: number
  columns: number
}

/** A robot cell rendered as a node between tables. */
export interface Robot {
  id: string
  label: string
  online: boolean
  /** Sub-caption under the icon, e.g. "Operational". */
  note: string
}

export type AlertSeverity = "error" | "warning"

export interface PlantAlert {
  id: string
  /** Where it happened, e.g. "Bay 2 - Table 3". */
  source: string
  message: string
  severity: AlertSeverity
  /** Minutes since the alert was raised. */
  ageMin: number
}

export interface PlantKpis {
  totalBundles: number
  tablesActive: number
  bundlesInProcess: number
  bundlesCompleted: number
  /** Percent change versus yesterday for the completed figure. */
  completedTrendPct: number
}
