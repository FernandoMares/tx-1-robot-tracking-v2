// Run: node scripts/test-bundle-lifecycle.mjs
// Pure source/SSR checks only. No server, external requests, or plant writes.
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve, sep } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const requirePackage = createRequire(import.meta.url)
const cache = new Map()
function load(relativePath) {
  const filename = resolve(root, relativePath)
  assert.ok(filename.startsWith(root + sep), "Only project sources may be loaded")
  if (cache.has(filename)) return cache.get(filename)
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  cache.set(filename, exports)
  runInNewContext(outputText, {
    exports, JSON,
    require(specifier) {
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) {
        assert.ok(["react", "react/jsx-runtime", "clsx", "tailwind-merge", "lucide-react", "@base-ui/react/button", "class-variance-authority"].includes(specifier))
        return requirePackage(specifier)
      }
      const path = resolve(specifier.startsWith("@/") ? root : dirname(filename), specifier.startsWith("@/") ? specifier.slice(2) : specifier)
      const target = [path + ".ts", path + ".tsx", resolve(path, "index.ts")].find(existsSync)
      assert.ok(target, "Module not found: " + specifier)
      return load(target)
    },
    fetch() { throw new Error("Unexpected network request") },
  }, { filename })
  return exports
}

const { getActiveBundles, isRemovedBundle } = load("lib/tracking-api/bundle-lifecycle.ts")
const { groupTrackingBundlesByZone } = load("lib/tracking-zone-layout.ts")
const { manualOutcomeObserved, manualPreflightProblem, reportedZoneOccupants } = load("lib/tracking-api/manual-position.ts")
const { TrackingZoneSlot } = load("components/plant/tracking-zone-slot.tsx")
const { ScaleWeightReadout } = load("components/plant/scale-weight-readout.tsx")
const { KpiCards } = load("components/kpi-cards.tsx")
const { TrackingConnectionBanner } = load("components/tracking-connection-banner.tsx")
const scenario = "LIFECYCLE_TEST"
const ids = (bundles) => Array.from(bundles, (bundle) => bundle.TrackingId)
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
function bundle(TrackingId, extra = {}) {
  return {
    ScenarioName: scenario, TrackingId, BundleId: TrackingId, CurrentZone: "SGRT2",
    OccupiedZones: ["SGRT2"], Status: "TRACKING", CorrelationStatus: "MATCHED", Weight: 200,
    ...extra,
  }
}
function state(Bundles) {
  return { ScenarioName: scenario, LastUpdateUtc: null, Bundles }
}
function preflight(action) {
  const selected = bundle("SELECTED")
  const destination = { ZoneId: 2, ZoneName: "CCH2A", IsEnabled: true, ZoneType: "BUFFER", Capacity: 5, DisplayOrder: 2 }
  const displayedState = state([selected])
  return {
    action, selected, destination, displayedState, state: structuredClone(displayedState),
    service: { running: true, scenario }, capabilities: { commands: ["POST /api/tracking/correct"] },
    map: { ScenarioName: scenario, Zones: [destination] },
  }
}

test("only normalized exact REMOVED is excluded; unknown and other statuses remain", () => {
  for (const Status of ["REMOVED", "removed", " ReMoVeD\t"]) assert.equal(isRemovedBundle({ Status }), true)
  for (const Status of [null, undefined, "", "TRACKING", "WAITING_QMOS_ID", "TAGGED_COMPLETE", "REMOVED_PENDING", "REMOVE", "ARCHIVED"]) {
    assert.equal(isRemovedBundle({ Status }), false, String(Status))
  }
})

test("active projection preserves input/order/references and removes even records with lingering positions", () => {
  const current = bundle("KEEP-1")
  const removed = bundle("HIDE", { Status: "REMOVED" })
  const pending = bundle("KEEP-2", { Status: "WAITING_QMOS_ID", CurrentZone: null })
  const raw = Object.freeze([Object.freeze(current), Object.freeze(removed), Object.freeze(pending)])
  const active = getActiveBundles(raw)
  assert.deepEqual(ids(active), ["KEEP-1", "KEEP-2"])
  assert.equal(active[0], current)
  assert.equal(active[1], pending)
  assert.deepEqual(ids(raw), ["KEEP-1", "HIDE", "KEEP-2"])
  assert.notEqual(active, raw)
})

test("zone grouping hides removed known/unknown/no-zone records without losing other statuses", () => {
  const grouped = groupTrackingBundlesByZone([
    bundle("ACTIVE"), bundle("REMOVED-ZONE", { Status: "REMOVED" }),
    bundle("REMOVED-UNKNOWN", { Status: "REMOVED", CurrentZone: "API-EXTRA" }),
    bundle("REMOVED-EMPTY", { Status: "REMOVED", CurrentZone: null }),
    bundle("UNKNOWN", { CurrentZone: "API-EXTRA" }), bundle("WAITING", { CurrentZone: null, Status: "WAITING_QMOS_ID" }),
  ])
  assert.deepEqual(ids(grouped.byZone.SGRT2), ["ACTIVE"])
  assert.deepEqual(ids(grouped.unknownZone), ["UNKNOWN"])
  assert.deepEqual(ids(grouped.withoutZone), ["WAITING"])
})

test("zone cards and scale also exclude removed records when passed raw bundles directly", () => {
  const removed = bundle("HIDE-ME", { Status: "REMOVED", Weight: 99999, QueueSequence: 1, LogicalBufferName: "SGRT2" })
  const slot = render(TrackingZoneSlot, { zoneName: "SGRT2", bundles: [removed], hasSnapshot: true })
  assert.doesNotMatch(slot, /HIDE-ME|data-zone-occupied|data-fifo-order/)
  assert.match(slot, /0 bundles/)
  assert.match(slot, /Empty/)
  const scale = render(ScaleWeightReadout, { bundles: [removed], hasSnapshot: true })
  assert.doesNotMatch(scale, /HIDE-ME|99999/)
  assert.match(scale, /No bundle in SGRT2/)
  const mixed = render(ScaleWeightReadout, { bundles: [removed, bundle("ZERO", { Weight: 0 })], hasSnapshot: true })
  assert.match(mixed, /ZERO/)
  assert.match(mixed, /Weight: 0/)
  assert.doesNotMatch(mixed, /HIDE-ME|99999/)
})

test("active KPI and banner counts exclude removed raw records including unmatched/occupied ones", () => {
  const tracking = {
    mode: "live", syncStatus: "live", service: null, capabilities: null, error: null,
    lastSuccessfulPollAt: null, sourceUpdatedAt: null, topology: { ScenarioName: scenario, Zones: [] },
    trackingState: state([
      bundle("ACTIVE", { CurrentZone: null }),
      bundle("REMOVED-OCCUPIED", { Status: "REMOVED", CorrelationStatus: "UNMATCHED" }),
    ]),
  }
  const kpi = render(KpiCards, { tracking, kpis: {
    totalBundles: 0, tablesActive: 0, bundlesInProcess: 0, bundlesCompleted: 0, completedTrendPct: 0,
  } })
  assert.match(kpi, /Active tracked bundles<\/dt><dd[^>]*>1<\/dd>/)
  assert.match(kpi, /Occupied zones<\/dt><dd[^>]*>0<\/dd>/)
  assert.match(kpi, /QMOS unmatched<\/dt><dd[^>]*>0<\/dd>/)
  const banner = render(TrackingConnectionBanner, { tracking, onRetry() {} })
  assert.match(banner, /1 active bundles/)
  assert.equal(tracking.trackingState.Bundles.length, 2, "Raw state remains intact for verification")
})

test("both manual preflights reject removed displayed or freshly fetched selections", () => {
  for (const action of ["remove", "reposition"]) {
    const displayed = preflight(action)
    displayed.selected.Status = "removed"
    assert.match(manualPreflightProblem(displayed), /already been removed/)
    const fresh = preflight(action)
    fresh.state.Bundles[0].Status = " REMOVED "
    assert.match(manualPreflightProblem(fresh), /already been removed/)
    assert.equal(manualPreflightProblem(preflight(action)), null)
  }
})

test("raw removed footprints still affect reposition preflight occupancy safety", () => {
  const options = preflight("reposition")
  const removed = bundle("RETAINED", { Status: "REMOVED", CurrentZone: null, OccupiedZones: ["CCH2A"] })
  options.state.Bundles.push(removed)
  assert.deepEqual(ids(getActiveBundles(options.state.Bundles)), ["SELECTED"])
  assert.deepEqual(Array.from(reportedZoneOccupants(options.state, "CCH2A")), ["RETAINED"])
  assert.match(manualPreflightProblem(options), /occupancy changed/)
})

test("REMOVE confirmation accepts absence or one same-scenario REMOVED record with explicit empty positions", () => {
  assert.equal(manualOutcomeObserved("remove", "SELECTED", "", state([])), true)
  const retained = bundle("SELECTED", { Status: "REMOVED", CurrentZone: null, OccupiedZones: [] })
  assert.equal(manualOutcomeObserved("remove", "SELECTED", "", state([retained])), true)
  for (const extra of [
    { CurrentZone: "CCH2A" }, { CurrentZone: "" }, { CurrentZone: undefined },
    { OccupiedZones: ["SGRT2"] }, { OccupiedZones: undefined }, { OccupiedZones: null },
    { OccupiedZones: {} }, { Status: "TRACKING" }, { ScenarioName: "OTHER-SCENARIO" },
  ]) {
    assert.equal(manualOutcomeObserved("remove", "SELECTED", "", state([{ ...retained, ...extra }])), false, JSON.stringify(extra))
  }
  assert.equal(manualOutcomeObserved("remove", "SELECTED", "", state([retained, { ...retained }])), false, "Duplicate IDs are ambiguous")
  assert.equal(manualOutcomeObserved("remove", "SELECTED", "", state([retained, bundle("SELECTED")])), false)
})

test("reposition confirmation never accepts REMOVED, wrong-scenario or duplicate identities", () => {
  const moved = bundle("SELECTED", { CurrentZone: "CCH2A" })
  assert.equal(manualOutcomeObserved("reposition", "SELECTED", "CCH2A", state([moved])), true)
  for (const extra of [{ Status: "REMOVED" }, { ScenarioName: "OTHER-SCENARIO" }, { CurrentZone: "SGRT2" }]) {
    assert.equal(manualOutcomeObserved("reposition", "SELECTED", "CCH2A", state([{ ...moved, ...extra }])), false)
  }
  assert.equal(manualOutcomeObserved("reposition", "SELECTED", "CCH2A", state([moved, { ...moved }])), false)
})
