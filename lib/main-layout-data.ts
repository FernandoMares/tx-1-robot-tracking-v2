export interface TrackedLoad {
  id: string
  kind: "Bundle" | "Bundler"
  heat: string
  workOrder: string
  weight?: string
  lpn?: string
}

const COMMON_TRACE = {
  heat: "234567",
  workOrder: "1000056",
}

/** Traceability values shown in the official Main worksheet. */
export const MAIN_TRACKED_LOADS = {
  bundler505: {
    id: "505",
    kind: "Bundler",
    ...COMMON_TRACE,
  },
  bundler504: {
    id: "504",
    kind: "Bundler",
    ...COMMON_TRACE,
  },
  bundler501: {
    id: "501",
    kind: "Bundler",
    ...COMMON_TRACE,
  },
  bundler500: {
    id: "500",
    kind: "Bundler",
    ...COMMON_TRACE,
  },
  bundle499: {
    id: "499",
    kind: "Bundle",
    ...COMMON_TRACE,
    weight: "200.5 TN",
    lpn: "1000003456",
  },
  bundle497: {
    id: "497",
    kind: "Bundle",
    ...COMMON_TRACE,
    weight: "200.5 TN",
    lpn: "1000003456",
  },
} satisfies Record<string, TrackedLoad>
