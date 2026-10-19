import type { TrackedBundleDto } from "./types"

export const INTERNAL_IDENTIFIER_LABEL = "ID interno / sin LPN"

/** The bundle carries its own creation policy; the current global setting is irrelevant here. */
export function isInternalIdentifierBundle(bundle: TrackedBundleDto): boolean {
  return bundle.QmosLpnEnabled === false || bundle.IdentifierSource === "INTERNAL"
}

/** DisplayId is presentation only. Manual commands always continue to use TrackingId. */
export function displayBundleIdentity(bundle: TrackedBundleDto): string {
  if (typeof bundle.DisplayId === "string" && bundle.DisplayId.trim()) return bundle.DisplayId
  if (isInternalIdentifierBundle(bundle)) return bundle.TrackingId
  return bundle.BundleId ?? (bundle.L2Id != null ? String(bundle.L2Id) : bundle.TrackingId)
}

export function isQmosUnmatchedBundle(bundle: TrackedBundleDto): boolean {
  return !isInternalIdentifierBundle(bundle) && bundle.CorrelationStatus === "UNMATCHED"
}

export function isAwaitingQmosIdentifier(bundle: TrackedBundleDto): boolean {
  return !isInternalIdentifierBundle(bundle) &&
    (bundle.Status === "WAITING_QMOS_ID" || bundle.CorrelationStatus === "UNMATCHED")
}

/** A future bundle print action must satisfy both the service permission and the bundle policy. */
export function canPrintBundle(bundle: TrackedBundleDto): boolean {
  return !isInternalIdentifierBundle(bundle) && bundle.QmosLpnEnabled === true &&
    bundle.CanPrint === true && typeof bundle.TagNumber === "number" &&
    Number.isFinite(bundle.TagNumber) && bundle.TagNumber > 0
}
