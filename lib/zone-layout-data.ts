import type { TrackedLoad } from "@/lib/main-layout-data"

export type ZoneTrackedLoad = TrackedLoad & {
  disposition?: string
}

const COMMON_TRACE = {
  heat: "234567",
  workOrder: "1000056",
}

/** Values drawn in the STACKERS worksheet. */
export const STACKERS_TRACKED_LOADS = {
  bundler501: { id: "501", kind: "Bundler", ...COMMON_TRACE },
  bundler500: { id: "500", kind: "Bundler", ...COMMON_TRACE },
} satisfies Record<string, ZoneTrackedLoad>

/** Values drawn in the BAY 1 worksheet. */
export const BAY_1_TRACKED_LOADS = {
  bundle500: { id: "500", kind: "Bundle", ...COMMON_TRACE },
  bundle499: { id: "499", kind: "Bundle", ...COMMON_TRACE },
  bundle498: {
    id: "498",
    kind: "Bundle",
    ...COMMON_TRACE,
    weight: "200.5 TN",
    lpn: "1000003456",
  },
} satisfies Record<string, ZoneTrackedLoad>

/** Values drawn in the BAY 2 worksheet. Repeated IDs are separate locations. */
export const BAY_2_TRACKED_LOADS = {
  incoming498: { id: "498", kind: "Bundler", ...COMMON_TRACE },
  output499: {
    id: "499",
    kind: "Bundler",
    ...COMMON_TRACE,
    disposition: "PRIME",
  },
  output498: {
    id: "498",
    kind: "Bundler",
    ...COMMON_TRACE,
    disposition: "PRIME",
  },
  bundle497: {
    id: "497",
    kind: "Bundle",
    ...COMMON_TRACE,
    weight: "200.5 TN",
    lpn: "1000003456",
  },
} satisfies Record<string, ZoneTrackedLoad>
