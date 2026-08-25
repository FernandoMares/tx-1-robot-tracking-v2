import type { AlertSeverity, PlantStatus } from "@/lib/types"

/** Labels + colour classes for every table/equipment state. */
export const STATUS_META: Record<PlantStatus, { label: string; dot: string; text: string }> = {
  active: { label: "Active", dot: "bg-active", text: "text-active-fg" },
  warning: { label: "Warning", dot: "bg-warning", text: "text-warning-fg" },
  error: { label: "Error", dot: "bg-error", text: "text-error-fg" },
  empty: { label: "Empty", dot: "bg-idle", text: "text-muted-foreground" },
  offline: { label: "Offline", dot: "bg-offline", text: "text-offline" },
}

/** Bottom-of-screen legend, in the mockup's order. */
export const LEGEND: { status: PlantStatus; label: string }[] = [
  { status: "active", label: "Active" },
  { status: "warning", label: "Warning" },
  { status: "error", label: "Error" },
  { status: "empty", label: "Empty" },
  { status: "offline", label: "Offline" },
]

export const ALERT_META: Record<AlertSeverity, { surface: string; source: string }> = {
  error: { surface: "border-error-line bg-error-soft", source: "text-error-fg" },
  warning: { surface: "border-warning-line bg-warning-soft", source: "text-warning-fg" },
}

/** "2m ago" / "1h 5m ago" for the alert list. */
export function formatAge(minutes: number) {
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${Math.round(minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest === 0 ? `${hours}h ago` : `${hours}h ${rest}m ago`
}

export function formatCount(value: number) {
  return value.toLocaleString("en-US")
}

/** Wall clock in the mockup's format, e.g. "10:24:30 AM". */
export function formatClock(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })
}
