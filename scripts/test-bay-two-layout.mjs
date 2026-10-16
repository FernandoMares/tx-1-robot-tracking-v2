// Run: node scripts/test-bay-two-layout.mjs
// Pure source/SSR checks. No server, simulator, plant API, or mutation endpoint.
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
const moduleCache = new Map()
function load(relativePath) {
  const filename = resolve(root, relativePath)
  assert.ok(filename.startsWith(root + sep), "Only project sources may be loaded")
  if (moduleCache.has(filename)) return moduleCache.get(filename)
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  moduleCache.set(filename, exports)
  runInNewContext(outputText, {
    exports, JSON,
    require(specifier) {
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) {
        assert.ok([
          "react", "react/jsx-runtime", "clsx", "tailwind-merge", "lucide-react",
          "@base-ui/react/button", "class-variance-authority",
        ].includes(specifier), "Unexpected package: " + specifier)
        return requirePackage(specifier)
      }
      const path = resolve(specifier.startsWith("@/") ? root : dirname(filename), specifier.startsWith("@/") ? specifier.slice(2) : specifier)
      const target = [path + ".ts", path + ".tsx", resolve(path, "index.ts")].find(existsSync)
      assert.ok(target, "Module not found: " + specifier)
      return load(target)
    },
    fetch() { throw new Error("Network requests are forbidden in layout tests") },
  }, { filename })
  return exports
}

const { MainSchematic, MAIN_SCHEMATIC_WIDTH, MAIN_SCHEMATIC_HEIGHT, BAY_TWO_SCHEMATIC_WIDTH } = load("components/plant/main-schematic.tsx")
const { BayTwoSchematic } = load("components/plant/bay-two-schematic.tsx")
const { BayOneSchematic } = load("components/plant/bay-one-schematic.tsx")
const { StackerSchematic } = load("components/plant/stacker-schematic.tsx")
const { StackersSchematic } = load("components/plant/stackers-schematic.tsx")
const { BundlerSchematic } = load("components/plant/bundler-schematic.tsx")
const {
  groupTrackingBundlesByZone, TRACKING_ZONE_LAYOUT, TRACKING_ZONE_NAMES,
  TRACKING_ZONES_BY_SCREEN, getTrackingZonesForScreen,
} = load("lib/tracking-zone-layout.ts")
const STACKER_SOURCE = ["ERT1A", "ERT1B", "ERT2C", "ERT2D", "STRT1", "STRT2", "LFRT1", "LFRT2", "LFRT3"]
const BUNDLER_SOURCE = ["RTOUTA", "RTOUTB", "RTOUTC", "RTOUTD"]
const SCALE_ZONES = ["SGRT1", "SGRT2", "NCCT1", "NCCT2"]
const CCH_ZONES = ["CCH1A", "CCH1B", "CCH2A", "CCH2B"]
const HIDDEN_LCH = ["LCH1A", "LCH1B", "LCH2A", "LCH2B"]
const RETAINED_ZONES = [
  "RTTY1", "RTTY2", "IMRT2", ...SCALE_ZONES, "IMRT1",
  "SGRT1A", "SGRT1B", "SGRT2A", "SGRT2B", ...CCH_ZONES,
]
const OMITTED_ZONES = [...STACKER_SOURCE, ...BUNDLER_SOURCE]
const scenario = "BAY_TWO_LAYOUT_TEST"
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
function bundle(TrackingId, CurrentZone, extra = {}) {
  return {
    ScenarioName: scenario, TrackingId, BundleId: TrackingId, CurrentZone,
    OccupiedZones: CurrentZone ? [CurrentZone] : [], Status: "TRACKING",
    CorrelationStatus: "MATCHED", Weight: null, ...extra,
  }
}
function renderViews(Bundles = [], {
  hasSnapshot = true, bundlesByZone, mode = "live", matchedIds = null, animationRunning = false,
} = {}) {
  const grouped = bundlesByZone ?? groupTrackingBundlesByZone(Bundles).byZone
  const tracking = {
    mode, syncStatus: hasSnapshot ? "live" : "connecting",
    trackingState: hasSnapshot ? { ScenarioName: scenario, Bundles, LastUpdateUtc: null } : null,
  }
  const shared = { updatedAt: null, animationRunning, matchedIds, tracking, bundlesByZone: grouped }
  return {
    overview: render(MainSchematic, { animationRunning, bundlesByZone: grouped, hasSnapshot: mode === "mock" || hasSnapshot }),
    bay2: render(BayTwoSchematic, shared),
    bay1: render(BayOneSchematic, shared),
    stacker: render(StackerSchematic, shared),
    stackers: render(StackersSchematic, shared),
    bundler: render(BundlerSchematic, shared),
  }
}
function zoneMarkup(html, name) {
  const match = html.match(new RegExp('<section\\b(?=[^>]*data-zone-name="' + name + '")[\\s\\S]*?<\\/section>'))
  assert.ok(match, "Rendered zone must exist: " + name)
  return match[0]
}
const renderedZones = (html) => Array.from(html.matchAll(/data-zone-name="([^"]+)"/g), (match) => match[1]).sort()
const renderedIds = (html) => Array.from(html.matchAll(/data-tracking-id="([^"]+)"/g), (match) => match[1])
const arrows = (html, direction) => (html.match(new RegExp('class="[^"]*lucide-arrow-' + direction + '(?: |")', "g")) ?? []).length

test("Bay 2 renders exactly sixteen retained Overview zones while all other screen layouts stay intact", () => {
  const { overview, bay2, bay1, stacker, stackers, bundler } = renderViews()
  assert.deepEqual(renderedZones(bay2), [...RETAINED_ZONES].sort())
  assert.deepEqual(renderedZones(overview), [...RETAINED_ZONES, ...OMITTED_ZONES].sort())
  assert.deepEqual(renderedZones(bundler), [...RETAINED_ZONES, ...BUNDLER_SOURCE].sort())
  assert.deepEqual(renderedZones(stacker), [...STACKER_SOURCE, ...SCALE_ZONES].sort())
  assert.deepEqual(renderedZones(bay1), renderedZones(stacker))
  assert.deepEqual(renderedZones(stackers), [...STACKER_SOURCE, ...SCALE_ZONES, "IMRT1"].sort())
  assert.match(bay2, /aria-label="Bay 2"/)
  assert.match(bay2, />Bay 2<\/h2>/)
  assert.match(bay2, /aria-label="Scrollable Bay 2 production diagram"/)
  assert.doesNotMatch(bay2, /STK Stackers|BUND Bundler|Four source sections|Four bundler outputs|LMD [1-4]/)
  assert.match(overview, /STK Stackers/)
  assert.match(overview, /BUND Bundler/)
  for (const html of [overview, bay2, bay1, stacker, stackers, bundler]) assert.doesNotMatch(html, /data-zone-name="LCH[12][AB]"/)
  assert.equal(MAIN_SCHEMATIC_WIDTH, 1480)
  assert.equal(MAIN_SCHEMATIC_HEIGHT, 760)
  assert.equal(BAY_TWO_SCHEMATIC_WIDTH, 600)
  assert.match(bay2, /width:600px;height:760px/)
  assert.match(overview, /width:1480px;height:760px/)
})

test("Bay 2 keeps first/second tracking sections, scale and Robot 2 but no dangling source connectors", () => {
  const { bay2 } = renderViews()
  assert.match(bay2, /First tracking section/)
  assert.match(bay2, /Second tracking section/)
  assert.match(bay2, /aria-label="SGRT2 bundle weight"/)
  assert.match(bay2, /aria-label="Robot 2 physical equipment context"/)
  assert.match(bay2, /Not provided by tracking API/)
  assert.equal(arrows(bay2, "right"), 7, "Header, two RTTY-to-IMRT2 connectors, IMRT2-to-SGRT2A, SGRT2-to-IMRT1, IMRT1-to-SGRT1A, Robot")
  assert.equal(arrows(bay2, "down"), 2, "SGRT1/2-to-NCCT1/2 connectors")
  assert.equal(arrows(bay2, "up"), 6, "Both tracking columns and their section-to-section handoffs")
})

test("Bay 2 retained cards match Overview exactly and never mutate the shared state or grouping", () => {
  const Bundles = Object.freeze([...TRACKING_ZONE_NAMES].map((name) => Object.freeze(bundle("VISIBLE-" + name, name))))
  const grouped = groupTrackingBundlesByZone(Bundles).byZone
  for (const list of Object.values(grouped)) Object.freeze(list)
  Object.freeze(grouped)
  const before = JSON.stringify({ Bundles, grouped })
  const { overview, bay2 } = renderViews(Bundles, { bundlesByZone: grouped })
  for (const name of RETAINED_ZONES) assert.equal(zoneMarkup(bay2, name), zoneMarkup(overview, name))
  for (const name of [...OMITTED_ZONES, ...HIDDEN_LCH]) assert.ok(!renderedIds(bay2).includes("VISIBLE-" + name))
  assert.equal(JSON.stringify({ Bundles, grouped }), before)
})

test("Bay 2 preserves authoritative FIFO and five-row scrolling in all four CCH buffers", () => {
  const Bundles = CCH_ZONES.flatMap((name) => [
    bundle(name + "-LATE", name, { LogicalBufferName: name, QueueSequence: 6 }),
    bundle(name + "-THIRD", name, { LogicalBufferName: name, QueueSequence: 3 }),
    bundle(name + "-LEGACY", name),
    bundle(name + "-FIRST", name, { LogicalBufferName: name, QueueSequence: 1 }),
    bundle(name + "-SECOND", name, { LogicalBufferName: name, QueueSequence: 2 }),
    bundle(name + "-FOURTH", name, { LogicalBufferName: name, QueueSequence: 4 }),
    bundle(name + "-FIFTH", name, { LogicalBufferName: name, QueueSequence: 5 }),
  ])
  const before = JSON.stringify(Bundles)
  const { bay2, overview } = renderViews(Bundles)
  for (const name of CCH_ZONES) {
    const zone = zoneMarkup(bay2, name)
    assert.equal(zone, zoneMarkup(overview, name))
    assert.deepEqual(renderedIds(zone), ["FIRST", "SECOND", "LEGACY", "THIRD", "FOURTH", "FIFTH", "LATE"].map((suffix) => name + "-" + suffix))
    assert.match(zone, /aria-label="7 bundles"/)
    assert.match(zone, /overflow-y-auto/)
    assert.match(zone, /height:120px/)
    assert.match(zone, /data-fifo-order="partial"/)
    assert.match(zone, /aria-label="FIFO order incomplete"/)
  }
  assert.equal(JSON.stringify(Bundles), before)
})

test("Bay 2 places bundles by CurrentZone instead of logical buffer membership or secondary occupied zones", () => {
  const { bay2 } = renderViews([
    bundle("PHYSICAL-CCH1A", "CCH1A", { LogicalBufferName: "CCH2A", QueueSequence: 1, OccupiedZones: ["CCH1A", "CCH2A"] }),
    bundle("EXCLUDED-RTOUTA", "RTOUTA", { LogicalBufferName: "CCH2A", QueueSequence: 2 }),
    bundle("HIDDEN-LCH1A", "LCH1A"),
    bundle("UNKNOWN-POSITION", "NOT-A-ZONE"),
    bundle("WITHOUT-POSITION", null),
  ])
  assert.deepEqual(renderedIds(zoneMarkup(bay2, "CCH1A")), ["PHYSICAL-CCH1A"])
  assert.deepEqual(renderedIds(zoneMarkup(bay2, "CCH2A")), [])
  assert.doesNotMatch(bay2, /EXCLUDED-RTOUTA|HIDDEN-LCH1A|UNKNOWN-POSITION|WITHOUT-POSITION/)
})

test("Bay 2 hides REMOVED bundles and weights even when a raw grouping retains stale positions", () => {
  const removed = bundle("HIDE-REMOVED", "SGRT2", { Status: " removed ", Weight: 99999 })
  const active = bundle("ACTIVE-ZERO", "SGRT2", { Weight: 0 })
  const removedBuffer = bundle("HIDE-CCH-REMOVED", "CCH2A", { Status: "REMOVED", LogicalBufferName: "CCH2A", QueueSequence: 1 })
  const { bay2 } = renderViews([removed, active, removedBuffer], { bundlesByZone: { SGRT2: [removed, active], CCH2A: [removedBuffer] } })
  assert.doesNotMatch(bay2, /HIDE-REMOVED|HIDE-CCH-REMOVED|99999/)
  assert.deepEqual(renderedIds(zoneMarkup(bay2, "SGRT2")), ["ACTIVE-ZERO"])
  assert.match(zoneMarkup(bay2, "SGRT2"), /aria-label="1 bundles"/)
  assert.match(zoneMarkup(bay2, "CCH2A"), /aria-label="0 bundles"/)
  assert.match(bay2, /Weight: 0/)
})

test("Bay 2 scale reads SGRT2 weights only, preserving unavailable values without fabricated units", () => {
  const { bay2 } = renderViews([
    bundle("SCALE-WEIGHED", "SGRT2", { Weight: 1234.5 }),
    bundle("SCALE-PENDING", "SGRT2"),
    bundle("NOT-SCALE", "SGRT1", { Weight: 98765 }),
  ])
  const scale = bay2.match(/<div\b[^>]*aria-label="SGRT2 bundle weight"[\s\S]*?<\/div>/)?.[0]
  assert.ok(scale)
  assert.match(scale, /SCALE-WEIGHED/)
  assert.match(scale, /Weight: 1234\.5/)
  assert.match(scale, /SCALE-PENDING/)
  assert.match(scale, /Weight: unavailable/)
  assert.doesNotMatch(scale, /NOT-SCALE|98765|\bkg\b|\blbs\b/)
})

test("Bay 2 distinguishes live startup from empty state and supports mock data without a received API snapshot", () => {
  const Bundles = [bundle("STATE-SCALE", "SGRT2", { Weight: 4321 })]
  const waiting = renderViews(Bundles, { hasSnapshot: false }).bay2
  assert.match(waiting, /Waiting for tracking data/)
  assert.match(zoneMarkup(waiting, "SGRT2"), />Waiting</)
  assert.doesNotMatch(waiting, /data-tracking-id|Weight: 4321|STATE-SCALE/)
  const empty = renderViews().bay2
  assert.match(zoneMarkup(empty, "SGRT2"), />Empty</)
  assert.match(empty, /No bundle in SGRT2/)
  const mock = renderViews(Bundles, { mode: "mock", hasSnapshot: false }).bay2
  assert.deepEqual(renderedIds(zoneMarkup(mock, "SGRT2")), ["STATE-SCALE"])
  assert.match(mock, /Weight: 4321/)
  assert.match(mock, /Simulated preview data/)
})

test("Bay 2 metadata retains hidden LCH entries and the 33-zone API catalog without changing other screen memberships", () => {
  const expectedScreens = {
    "bay-2": [...RETAINED_ZONES, ...HIDDEN_LCH],
    "bay-1": [...STACKER_SOURCE, ...SCALE_ZONES],
    stacker: [...STACKER_SOURCE, ...SCALE_ZONES],
    stackers: [...STACKER_SOURCE, ...SCALE_ZONES, "IMRT1"],
    bundler: [...RETAINED_ZONES, ...BUNDLER_SOURCE],
  }
  for (const [screen, expected] of Object.entries(expectedScreens)) {
    assert.deepEqual(Array.from(TRACKING_ZONES_BY_SCREEN[screen]).sort(), [...expected].sort(), screen + " catalog")
    assert.deepEqual(Array.from(getTrackingZonesForScreen(screen), (zone) => zone.zoneName).sort(), [...expected].sort(), screen + " zone metadata")
  }
  assert.equal(TRACKING_ZONE_NAMES.length, 33)
  for (const [name, primary, group, order] of [
    ["RTTY1", "bundler", "bundler-line", 250], ["RTTY2", "bundler", "bundler-line", 260],
    ["SGRT1", "stackers", "stacker-line", 100], ["SGRT2", "stackers", "stacker-line", 110],
    ["NCCT1", "bay-1", "bay-1-exit", 120], ["NCCT2", "bay-1", "bay-1-exit", 130],
  ]) {
    assert.equal(TRACKING_ZONE_LAYOUT[name].primaryScreen, primary)
    assert.equal(TRACKING_ZONE_LAYOUT[name].group, group)
    assert.equal(TRACKING_ZONE_LAYOUT[name].order, order)
    assert.equal(TRACKING_ZONE_LAYOUT[name].label, name)
  }
})

test("Bay 2 preserves its original bay2-t3 filter identity and applies motion only to retained arrows", () => {
  for (const matchedIds of [null, new Set(), new Set(["bay2-t3"]), new Set(["stk-a"])]) {
    for (const animationRunning of [false, true]) {
      const { bay2 } = renderViews([], { matchedIds, animationRunning })
      assert.deepEqual(renderedZones(bay2), [...RETAINED_ZONES].sort())
      assert.equal(/opacity-30 saturate-50/.test(bay2), Boolean(matchedIds && !matchedIds.has("bay2-t3")))
      assert.equal((bay2.match(/animate-soft-pulse/g) ?? []).length, animationRunning ? 15 : 0)
    }
  }
})
