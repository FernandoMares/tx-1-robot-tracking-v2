import type { PlantAlert, PlantTable, Robot } from "@/lib/types"

export const PLANT_NAME = "Texas 1 Tracking"
export const ACTIVE_OPERATOR = { name: "R. Trevino", initials: "RT" }

/** The four stacker tables that share one group card. */
export const STACKER_TABLES: PlantTable[] = [
  {
    id: "stk-a",
    name: "A",
    zoneLabel: "Stackers",
    zone: "stackers",
    bundleCount: 24,
    fillPct: 85,
    status: "active",
    rows: 5,
    columns: 3,
  },
  {
    id: "stk-b",
    name: "B",
    zoneLabel: "Stackers",
    zone: "stackers",
    bundleCount: 28,
    fillPct: 93,
    status: "active",
    rows: 5,
    columns: 3,
  },
  {
    id: "stk-c",
    name: "C",
    zoneLabel: "Stackers",
    zone: "stackers",
    bundleCount: 26,
    fillPct: 75,
    status: "warning",
    rows: 5,
    columns: 3,
  },
  {
    id: "stk-d",
    name: "D",
    zoneLabel: "Stackers",
    zone: "stackers",
    bundleCount: 18,
    fillPct: 60,
    status: "active",
    rows: 5,
    columns: 3,
  },
]

export const BUNDLER_TABLE: PlantTable = {
  id: "bundler-1",
  name: "Bundler",
  zoneLabel: "Bundler",
  zone: "bundler",
  bundleCount: 22,
  fillPct: 73,
  status: "active",
  rows: 5,
  columns: 3,
}

export const BAY_2_TABLE: PlantTable = {
  id: "bay2-t3",
  name: "Table 3",
  zoneLabel: "Bay 2",
  zone: "bay-2",
  bundleCount: 18,
  fillPct: 60,
  status: "active",
  rows: 5,
  columns: 3,
}

/** Bay 1 runs two tables along the lower production line. */
export const BAY_1_TABLES: PlantTable[] = [
  {
    id: "bay1-t1",
    name: "Table 1",
    zoneLabel: "Bay 1",
    zone: "bay-1",
    bundleCount: 25,
    fillPct: 83,
    status: "active",
    rows: 5,
    columns: 4,
  },
  {
    id: "bay1-t2",
    name: "Table 2",
    zoneLabel: "Bay 1",
    zone: "bay-1",
    bundleCount: 23,
    fillPct: 77,
    status: "active",
    rows: 5,
    columns: 4,
  },
]

export const ALL_TABLES: PlantTable[] = [...STACKER_TABLES, BUNDLER_TABLE, BAY_2_TABLE, ...BAY_1_TABLES]

export const ROBOT_2: Robot = { id: "robot-2", label: "Robot 2", online: true, note: "Operational" }

export const INITIAL_ALERTS: PlantAlert[] = [
  { id: "al-1", source: "Bay 2 - Table 3", message: "Table overloaded", severity: "error", ageMin: 2 },
  { id: "al-2", source: "Stacker C", message: "Misaligned bundle", severity: "warning", ageMin: 5 },
  { id: "al-3", source: "Scale Weight Station", message: "Calibration check due", severity: "warning", ageMin: 12 },
]

/** Options backing the three filter selects in the left column. */
export const FILTER_OPTIONS = {
  tables: [
    { value: "all", label: "All tables" },
    ...ALL_TABLES.map((table) => ({ value: table.id, label: `${table.zoneLabel} · ${table.name}` })),
  ],
  statuses: [
    { value: "all", label: "All statuses" },
    { value: "active", label: "Active" },
    { value: "warning", label: "Warning" },
    { value: "error", label: "Error" },
    { value: "empty", label: "Empty" },
  ],
  shifts: [
    { value: "all", label: "All shifts" },
    { value: "a", label: "Shift A · 06:00 - 14:00" },
    { value: "b", label: "Shift B · 14:00 - 22:00" },
    { value: "c", label: "Shift C · 22:00 - 06:00" },
  ],
}
