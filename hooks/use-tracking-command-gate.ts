"use client"

import { useCallback, useMemo, useRef, useState } from "react"

export type TrackingCommandOwner = "manual" | "reset"

export interface TrackingCommandGate {
  owner: TrackingCommandOwner | null
  tryAcquire: (owner: TrackingCommandOwner) => boolean
  release: (owner: TrackingCommandOwner) => void
}

/** One mounted dashboard's lock; not backend authorization or a multi-user lock. */
export function useTrackingCommandGate(): TrackingCommandGate {
  const currentOwner = useRef<TrackingCommandOwner | null>(null)
  const [owner, setOwner] = useState<TrackingCommandOwner | null>(null)
  const tryAcquire = useCallback((nextOwner: TrackingCommandOwner) => {
    if (currentOwner.current !== null) return false
    currentOwner.current = nextOwner
    setOwner(nextOwner)
    return true
  }, [])
  const release = useCallback((requestedOwner: TrackingCommandOwner) => {
    if (currentOwner.current !== requestedOwner) return
    currentOwner.current = null
    setOwner(null)
  }, [])
  return useMemo(() => ({ owner, tryAcquire, release }), [owner, tryAcquire, release])
}
