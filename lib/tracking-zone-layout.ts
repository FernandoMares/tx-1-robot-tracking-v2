import type { TrackedBundleDto, TrackingMapDto } from "@/lib/tracking-api"

export type TrackingDetailScreen = "stackers" | "bundler" | "bay-1" | "bay-2"

export type TrackingZoneGroup =
  | "stacker-source"
  | "stacker-line"
  | "bay-1-exit"
  | "bundler-source"
  | "bundler-line"
  | "bay-2-line-1"
  | "bay-2-line-2"

export interface TrackingZoneLayoutMeta {
  /** Detailed screen that owns the zone. Main can render every zone. */
  primaryScreen: TrackingDetailScreen
  /** Screens where the zone is useful either as content or handoff context. */
  screens: readonly TrackingDetailScreen[]
  group: TrackingZoneGroup
  /** Stable flow order currently supplied by /api/tracking/map. */
  order: number
  /** Operator-facing label. Kept equal to ZoneName to avoid ambiguous aliases. */
  label: string
}

/**
 * Approved ZoneName-to-layout catalog for TX1_TAGGER_TRACKING.
 *
 * PDF caveat: the lower Bay 2 row next to IMRT2 repeats SGRT1A/SGRT1B.
 * The API catalog and both BUND_TO_BAY2 route descriptions identify those
 * positions as SGRT2A/SGRT2B. We use the API names here while confirmation of
 * that apparent PDF label typo remains pending.
 */
export const TRACKING_ZONE_LAYOUT = {
  ERT1A: zone("stackers", ["stackers"], "stacker-source", 10, "ERT1A"),
  ERT1B: zone("stackers", ["stackers"], "stacker-source", 20, "ERT1B"),
  ERT2C: zone("stackers", ["stackers"], "stacker-source", 30, "ERT2C"),
  ERT2D: zone("stackers", ["stackers"], "stacker-source", 40, "ERT2D"),
  STRT1: zone("stackers", ["stackers"], "stacker-line", 50, "STRT1"),
  STRT2: zone("stackers", ["stackers"], "stacker-line", 60, "STRT2"),
  LFRT1: zone("stackers", ["stackers"], "stacker-line", 70, "LFRT1"),
  LFRT2: zone("stackers", ["stackers"], "stacker-line", 80, "LFRT2"),
  LFRT3: zone("stackers", ["stackers"], "stacker-line", 90, "LFRT3"),
  SGRT1: zone("stackers", ["stackers", "bay-1"], "stacker-line", 100, "SGRT1"),
  SGRT2: zone("stackers", ["stackers", "bay-1"], "stacker-line", 110, "SGRT2"),
  NCCT1: zone("bay-1", ["stackers", "bay-1"], "bay-1-exit", 120, "NCCT1"),
  NCCT2: zone("bay-1", ["stackers", "bay-1"], "bay-1-exit", 130, "NCCT2"),

  RTOUTA: zone("bundler", ["bundler"], "bundler-source", 210, "RTOUTA"),
  RTOUTB: zone("bundler", ["bundler"], "bundler-source", 220, "RTOUTB"),
  RTOUTC: zone("bundler", ["bundler"], "bundler-source", 230, "RTOUTC"),
  RTOUTD: zone("bundler", ["bundler"], "bundler-source", 240, "RTOUTD"),
  RTTY1: zone("bundler", ["bundler"], "bundler-line", 250, "RTTY1"),
  RTTY2: zone("bundler", ["bundler"], "bundler-line", 260, "RTTY2"),
  IMRT2: zone("bundler", ["bundler", "bay-2"], "bundler-line", 270, "IMRT2"),

  IMRT1: zone("bay-2", ["stackers", "bay-2"], "bay-2-line-1", 310, "IMRT1"),
  SGRT1A: zone("bay-2", ["bay-2"], "bay-2-line-1", 320, "SGRT1A"),
  SGRT1B: zone("bay-2", ["bay-2"], "bay-2-line-1", 330, "SGRT1B"),
  LCH1A: zone("bay-2", ["bay-2"], "bay-2-line-1", 340, "LCH1A"),
  LCH1B: zone("bay-2", ["bay-2"], "bay-2-line-1", 350, "LCH1B"),
  CCH1A: zone("bay-2", ["bay-2"], "bay-2-line-1", 360, "CCH1A"),
  CCH1B: zone("bay-2", ["bay-2"], "bay-2-line-1", 370, "CCH1B"),

  SGRT2A: zone("bay-2", ["bay-2"], "bay-2-line-2", 410, "SGRT2A"),
  SGRT2B: zone("bay-2", ["bay-2"], "bay-2-line-2", 420, "SGRT2B"),
  LCH2A: zone("bay-2", ["bay-2"], "bay-2-line-2", 430, "LCH2A"),
  LCH2B: zone("bay-2", ["bay-2"], "bay-2-line-2", 440, "LCH2B"),
  CCH2A: zone("bay-2", ["bay-2"], "bay-2-line-2", 450, "CCH2A"),
  CCH2B: zone("bay-2", ["bay-2"], "bay-2-line-2", 460, "CCH2B"),
} as const satisfies Record<string, TrackingZoneLayoutMeta>

export type TrackingZoneName = keyof typeof TRACKING_ZONE_LAYOUT

/** Loose lookup shape accepted by the schematic screens. */
export type BundlesByZone = Record<string, TrackedBundleDto[]>

export interface TrackingVisualZone extends TrackingZoneLayoutMeta {
  zoneName: TrackingZoneName
}

export interface GroupedTrackingBundles {
  /** Every configured visual zone is present, including empty arrays. */
  byZone: Record<TrackingZoneName, TrackedBundleDto[]>
  /** Bundles whose CurrentZone is non-null but absent from the visual catalog. */
  unknownZone: TrackedBundleDto[]
  /** Bundles for which the backend did not provide CurrentZone. */
  withoutZone: TrackedBundleDto[]
}

export interface TrackingLayoutValidation {
  valid: boolean
  catalogZoneCount: number
  enabledApiZoneCount: number
  duplicateApiZoneNames: string[]
  enabledApiZonesWithoutLayout: string[]
  layoutZonesMissingFromEnabledApi: TrackingZoneName[]
  displayOrderMismatches: Array<{
    zoneName: TrackingZoneName
    catalogOrder: number
    apiOrder: number | null
  }>
}

function zone(
  primaryScreen: TrackingDetailScreen,
  screens: readonly TrackingDetailScreen[],
  group: TrackingZoneGroup,
  order: number,
  label: string,
): TrackingZoneLayoutMeta {
  return { primaryScreen, screens, group, order, label }
}

export const TRACKING_ZONE_NAMES = Object.freeze(
  Object.keys(TRACKING_ZONE_LAYOUT) as TrackingZoneName[],
)

export const TRACKING_ZONES_BY_SCREEN = Object.freeze({
  stackers: TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].screens.includes("stackers")),
  bundler: TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].screens.includes("bundler")),
  "bay-1": TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].screens.includes("bay-1")),
  "bay-2": TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].screens.includes("bay-2")),
}) satisfies Readonly<Record<TrackingDetailScreen, readonly TrackingZoneName[]>>

export const TRACKING_ZONES_BY_GROUP = Object.freeze({
  "stacker-source": TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].group === "stacker-source"),
  "stacker-line": TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].group === "stacker-line"),
  "bay-1-exit": TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].group === "bay-1-exit"),
  "bundler-source": TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].group === "bundler-source"),
  "bundler-line": TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].group === "bundler-line"),
  "bay-2-line-1": TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].group === "bay-2-line-1"),
  "bay-2-line-2": TRACKING_ZONE_NAMES.filter((name) => TRACKING_ZONE_LAYOUT[name].group === "bay-2-line-2"),
}) satisfies Readonly<Record<TrackingZoneGroup, readonly TrackingZoneName[]>>

const TRACKING_ZONE_NAME_SET: ReadonlySet<string> = new Set(TRACKING_ZONE_NAMES)

export function isTrackingZoneName(value: string): value is TrackingZoneName {
  return TRACKING_ZONE_NAME_SET.has(value)
}

export function getTrackingVisualZone(zoneName: TrackingZoneName): TrackingVisualZone {
  return { zoneName, ...TRACKING_ZONE_LAYOUT[zoneName] }
}

export function getTrackingZonesForScreen(screen: TrackingDetailScreen): TrackingVisualZone[] {
  return TRACKING_ZONE_NAMES
    .filter((zoneName) => TRACKING_ZONE_LAYOUT[zoneName].screens.includes(screen))
    .map(getTrackingVisualZone)
    .sort((left, right) => left.order - right.order)
}

/** Groups by CurrentZone only; array order must never be interpreted as a physical slot. */
export function groupTrackingBundlesByZone(
  bundles: readonly TrackedBundleDto[],
): GroupedTrackingBundles {
  const byZone = Object.fromEntries(
    TRACKING_ZONE_NAMES.map((zoneName) => [zoneName, [] as TrackedBundleDto[]]),
  ) as Record<TrackingZoneName, TrackedBundleDto[]>
  const unknownZone: TrackedBundleDto[] = []
  const withoutZone: TrackedBundleDto[] = []

  for (const bundle of bundles) {
    if (!bundle.CurrentZone) {
      withoutZone.push(bundle)
    } else if (isTrackingZoneName(bundle.CurrentZone)) {
      byZone[bundle.CurrentZone].push(bundle)
    } else {
      unknownZone.push(bundle)
    }
  }

  return { byZone, unknownZone, withoutZone }
}

/** Checks that the runtime map still matches the approved 33-zone visual catalog. */
export function validateTrackingLayout(
  topology: Pick<TrackingMapDto, "Zones">,
): TrackingLayoutValidation {
  const enabledZones = topology.Zones.filter((zone) => zone.IsEnabled)
  const nameCounts = new Map<string, number>()

  for (const apiZone of enabledZones) {
    nameCounts.set(apiZone.ZoneName, (nameCounts.get(apiZone.ZoneName) ?? 0) + 1)
  }

  const duplicateApiZoneNames = [...nameCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([zoneName]) => zoneName)
    .sort()
  const enabledApiNameSet = new Set(enabledZones.map((zone) => zone.ZoneName))
  const enabledApiZonesWithoutLayout = [...enabledApiNameSet]
    .filter((zoneName) => !isTrackingZoneName(zoneName))
    .sort()
  const layoutZonesMissingFromEnabledApi = TRACKING_ZONE_NAMES.filter(
    (zoneName) => !enabledApiNameSet.has(zoneName),
  )
  const displayOrderMismatches = enabledZones.flatMap((apiZone) => {
    if (!isTrackingZoneName(apiZone.ZoneName)) return []
    const catalogOrder = TRACKING_ZONE_LAYOUT[apiZone.ZoneName].order
    return apiZone.DisplayOrder === catalogOrder
      ? []
      : [{ zoneName: apiZone.ZoneName, catalogOrder, apiOrder: apiZone.DisplayOrder }]
  })
  const valid =
    duplicateApiZoneNames.length === 0 &&
    enabledApiZonesWithoutLayout.length === 0 &&
    layoutZonesMissingFromEnabledApi.length === 0 &&
    displayOrderMismatches.length === 0

  return {
    valid,
    catalogZoneCount: TRACKING_ZONE_NAMES.length,
    enabledApiZoneCount: enabledZones.length,
    duplicateApiZoneNames,
    enabledApiZonesWithoutLayout,
    layoutZonesMissingFromEnabledApi,
    displayOrderMismatches,
  }
}
