import type { TrackedBundleDto } from "./types"

/** Only REMOVED is excluded; other/unknown statuses retain their existing meaning. */
export function isRemovedBundle(bundle: Pick<TrackedBundleDto, "Status">): boolean {
  return typeof bundle.Status === "string" && bundle.Status.trim().toUpperCase() === "REMOVED"
}

/** A presentation-only projection. Never replace the raw state used for command verification. */
export function getActiveBundles(bundles: readonly TrackedBundleDto[]): TrackedBundleDto[] {
  return bundles.filter((bundle) => !isRemovedBundle(bundle))
}
