import type { ApiDateValue } from "./types"

/** Unix milliseconds used by .NET for DateTime.MinValue (0001-01-01 UTC). */
export const DOTNET_DATETIME_MIN_VALUE_MS = -62135596800000

const DOTNET_DATE_PATTERN = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/

function validDateOrNull(date: Date): Date | null {
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1) return null
  return date
}

/**
 * Parses both the legacy .NET `/Date(milliseconds)/` representation and ISO-8601.
 * Empty/invalid values and the DateTime.MinValue sentinel become null.
 */
export function parseApiDate(value: ApiDateValue | Date | undefined): Date | null {
  if (value == null) return null
  if (value instanceof Date) return validDateOrNull(new Date(value.getTime()))

  const normalized = value.trim()
  if (!normalized) return null

  const dotnetMatch = DOTNET_DATE_PATTERN.exec(normalized)
  if (dotnetMatch) {
    const milliseconds = Number(dotnetMatch[1])
    if (!Number.isFinite(milliseconds) || milliseconds === DOTNET_DATETIME_MIN_VALUE_MS) {
      return null
    }
    return validDateOrNull(new Date(milliseconds))
  }

  return validDateOrNull(new Date(normalized))
}
