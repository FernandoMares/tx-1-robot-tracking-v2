import type { TrackedBundleDto } from "./tracking-api/types"

export interface FifoMembership {
  bufferName: string
  sequence: number
}

export function getFifoMembership(bundle: TrackedBundleDto): FifoMembership | null {
  if (
    typeof bundle.LogicalBufferName !== "string" || !bundle.LogicalBufferName.trim() ||
    typeof bundle.QueueSequence !== "number" || !Number.isSafeInteger(bundle.QueueSequence)
  ) return null
  return { bufferName: bundle.LogicalBufferName, sequence: bundle.QueueSequence }
}

/**
 * Sort each logical FIFO's members only within that FIFO's existing display
 * positions. Never compare different buffers, coerce null to zero, guess a
 * sequence from IDs, relocate CurrentZone, or mutate the API snapshot.
 * Equal sequences remain stable but are flagged: their FIFO precedence is unknown.
 */
export function orderBundlesByLogicalFifo(bundles: readonly TrackedBundleDto[]) {
  const ordered = [...bundles]
  const groups = new Map<string, { indices: number[]; entries: Array<{ bundle: TrackedBundleDto; sequence: number }> }>()
  let hasUnorderedMembers = false
  let hasDuplicateSequences = false

  bundles.forEach((bundle, index) => {
    const membership = getFifoMembership(bundle)
    if (!membership) { hasUnorderedMembers = true; return }
    let group = groups.get(membership.bufferName)
    if (!group) {
      group = { indices: [], entries: [] }
      groups.set(membership.bufferName, group)
    }
    group.indices.push(index)
    group.entries.push({ bundle, sequence: membership.sequence })
  })

  for (const group of groups.values()) {
    group.entries.sort((left, right) => left.sequence - right.sequence)
    group.entries.forEach((entry, index) => {
      if (index > 0 && entry.sequence === group.entries[index - 1].sequence) hasDuplicateSequences = true
      ordered[group.indices[index]] = entry.bundle
    })
  }

  return { bundles: ordered, hasFifoMembers: groups.size > 0, hasUnorderedMembers, hasDuplicateSequences }
}
