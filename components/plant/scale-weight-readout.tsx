import type { TrackedBundleDto } from "@/lib/tracking-api"
import { getActiveBundles } from "@/lib/tracking-api/bundle-lifecycle"
import {
  displayBundleIdentity,
  INTERNAL_IDENTIFIER_LABEL,
  isInternalIdentifierBundle,
} from "@/lib/tracking-api/bundle-presentation"
import { cn } from "@/lib/utils"

interface ScaleWeightReadoutProps {
  bundles: readonly TrackedBundleDto[]
  hasSnapshot: boolean
  compact?: boolean
}

/** The scale displays only Weight from bundles currently reported in SGRT2. */
export function ScaleWeightReadout({
  bundles: suppliedBundles,
  hasSnapshot,
  compact = false,
}: ScaleWeightReadoutProps) {
  const bundles = getActiveBundles(suppliedBundles)
  return (
    <div
      className={cn("min-w-0 text-center text-slate-700", compact ? "text-[9px] leading-3" : "text-[11px] leading-4")}
      aria-label="SGRT2 bundle weight"
    >
      <p className="font-semibold uppercase">SGRT2 weight</p>
      {!hasSnapshot ? (
        <p className="text-slate-500">Waiting for tracking data</p>
      ) : bundles.length === 0 ? (
        <p className="text-slate-500">No bundle in SGRT2</p>
      ) : (
        <ul className="max-h-8 overflow-y-auto">
          {bundles.map((bundle, index) => (
            <li
              key={`${bundle.TrackingId}-${index}`}
              className="flex flex-wrap items-baseline justify-center gap-x-2"
              title={`Bundle ${displayBundleIdentity(bundle)}${isInternalIdentifierBundle(bundle) ? ` · ${INTERNAL_IDENTIFIER_LABEL}` : ""}: ${bundle.Weight == null ? "weight unavailable" : `weight ${bundle.Weight}`}`}
            >
              <span className="whitespace-nowrap tabular-nums">{displayBundleIdentity(bundle)}</span>
              <strong className={cn("whitespace-nowrap tabular-nums", compact && "text-[11px]")}>
                Weight: {bundle.Weight == null ? "unavailable" : bundle.Weight}
              </strong>
              {isInternalIdentifierBundle(bundle) && <span className="w-full text-emerald-800">{INTERNAL_IDENTIFIER_LABEL}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
