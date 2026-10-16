// Run: node scripts/test-stacker-layout.mjs
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

const {
  MainSchematic, MAIN_SCHEMATIC_WIDTH, MAIN_SCHEMATIC_HEIGHT,
  BUNDLER_SCHEMATIC_WIDTH, STACKER_SCHEMATIC_WIDTH, STACKER_SCHEMATIC_HEIGHT,
} = load("components/plant/main-schematic.tsx")
const { StackerSchematic } = load("components/plant/stacker-schematic.tsx")
const { StackersSchematic } = load("components/plant/stackers-schematic.tsx")
const { BundlerSchematic } = load("components/plant/bundler-schematic.tsx")
const { BayOneSchematic } = load("components/plant/bay-one-schematic.tsx")
const {
  groupTrackingBundlesByZone, TRACKING_ZONE_LAYOUT, TRACKING_ZONE_NAMES,
  TRACKING_ZONES_BY_SCREEN, getTrackingZonesForScreen,
} = load("lib/tracking-zone-layout.ts")
const RETAINED_ZONES = [
  "ERT1A", "ERT1B", "ERT2C", "ERT2D", "STRT1", "STRT2", "LFRT1", "LFRT2", "LFRT3",
  "SGRT1", "SGRT2", "NCCT1", "NCCT2",
]
const BUNDLER_BRANCH = ["RTOUTA", "RTOUTB", "RTOUTC", "RTOUTD", "RTTY1", "RTTY2", "IMRT2"]
const BAY2_COLUMNS = ["SGRT1A", "SGRT1B", "CCH1A", "CCH1B", "SGRT2A", "SGRT2B", "CCH2A", "CCH2B"]
const OMITTED_ZONES = [...BUNDLER_BRANCH, "IMRT1", ...BAY2_COLUMNS]
const BUNDLER_ZONES = [...BUNDLER_BRANCH, "SGRT1", "SGRT2", "NCCT1", "NCCT2", "IMRT1", ...BAY2_COLUMNS]
const scenario = "STACKER_LAYOUT_TEST"
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
    stacker: render(StackerSchematic, shared),
    stackers: render(StackersSchematic, shared),
    bundler: render(BundlerSchematic, shared),
    bay1: render(BayOneSchematic, shared),
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

test("Stacker renders thirteen retained Overview zones and preserves the separate fourteen-zone Stackers view", () => {
  const { overview, stacker, stackers, bundler } = renderViews()
  assert.deepEqual(renderedZones(stacker), [...RETAINED_ZONES].sort())
  assert.deepEqual(renderedZones(stackers), [...RETAINED_ZONES, "IMRT1"].sort())
  assert.deepEqual(renderedZones(overview), [...RETAINED_ZONES, ...OMITTED_ZONES].sort())
  assert.deepEqual(renderedZones(bundler), [...BUNDLER_ZONES].sort())
  assert.match(stacker, /STK Stackers/)
  assert.match(stacker, /aria-label="SGRT2 bundle weight"/)
  assert.doesNotMatch(stacker, /BUND Bundler|Four bundler outputs|First tracking section|Second tracking section|Robot 2 physical equipment context|STACKER BANDERS|LMD [1-4]|Bay 2 handoff</)
  assert.match(stackers, /STACKER BANDERS/)
  assert.match(stackers, /Bay 2 handoff/)
  for (const html of [overview, stacker, stackers, bundler]) assert.doesNotMatch(html, /data-zone-name="LCH[12][AB]"/)
  assert.match(overview, /BUND Bundler/)
  assert.match(bundler, /BUND Bundler/)
  assert.equal(MAIN_SCHEMATIC_WIDTH, 1480)
  assert.equal(MAIN_SCHEMATIC_HEIGHT, 760)
  assert.equal(BUNDLER_SCHEMATIC_WIDTH, 1000)
  assert.equal(STACKER_SCHEMATIC_WIDTH, 1104)
  assert.equal(STACKER_SCHEMATIC_HEIGHT, 440)
  assert.match(stacker, /width:1104px;height:440px/)
  assert.match(stackers, /width:1440px;height:620px/)
  assert.match(overview, /width:1480px;height:760px/)
  assert.match(bundler, /width:1000px;height:760px/)
})

test("Stacker keeps only connected transfer and scale arrows, with no dangling Bay or Bundler arrows", () => {
  const { overview, stacker } = renderViews()
  assert.equal(arrows(stacker, "right"), 7, "One header arrow plus six stacker-route transfer arrows")
  assert.equal(arrows(stacker, "down"), 2, "Only SGRT1/2-to-NCCT1/2 arrows remain")
  assert.equal(arrows(stacker, "up"), 0, "No Bay 2 column arrows remain")
  assert.equal(arrows(overview, "right"), 14, "Overview keeps all its existing connections")
  assert.equal(arrows(overview, "up"), 6)
  assert.equal(arrows(overview, "down"), 2)
})

test("retained Stacker cards match Overview exactly and never modify their source snapshot", () => {
  const Bundles = Object.freeze([...RETAINED_ZONES, ...OMITTED_ZONES].map((name) => Object.freeze(bundle("VISIBLE-" + name, name))))
  const grouped = groupTrackingBundlesByZone(Bundles).byZone
  for (const list of Object.values(grouped)) Object.freeze(list)
  Object.freeze(grouped)
  const before = JSON.stringify({ Bundles, grouped })
  const { overview, stacker } = renderViews(Bundles, { bundlesByZone: grouped })
  for (const name of RETAINED_ZONES) {
    assert.equal(zoneMarkup(stacker, name), zoneMarkup(overview, name), name + " must keep its Overview card behavior")
  }
  for (const name of OMITTED_ZONES) {
    assert.ok(renderedIds(overview).includes("VISIBLE-" + name))
    assert.ok(!renderedIds(stacker).includes("VISIBLE-" + name))
  }
  assert.equal(JSON.stringify({ Bundles, grouped }), before)
})

test("Stacker and Bay 1 catalogs have thirteen zones while all API zones and other screens remain", () => {
  const expectedScreens = {
    stacker: RETAINED_ZONES,
    stackers: [...RETAINED_ZONES, "IMRT1"],
    bundler: BUNDLER_ZONES,
    "bay-1": RETAINED_ZONES,
    "bay-2": ["RTTY1", "RTTY2", "SGRT1", "SGRT2", "NCCT1", "NCCT2", "IMRT2", "IMRT1", "SGRT1A", "SGRT1B", "LCH1A", "LCH1B", "CCH1A", "CCH1B", "SGRT2A", "SGRT2B", "LCH2A", "LCH2B", "CCH2A", "CCH2B"],
  }
  for (const [screen, expected] of Object.entries(expectedScreens)) {
    assert.deepEqual(Array.from(TRACKING_ZONES_BY_SCREEN[screen]).sort(), [...expected].sort(), screen + " catalog")
    assert.deepEqual(Array.from(getTrackingZonesForScreen(screen), (zone) => zone.zoneName).sort(), [...expected].sort(), screen + " visual zones")
  }
  assert.equal(TRACKING_ZONE_NAMES.length, 33, "Hiding a zone in Stacker must not delete it from the API catalog")
  assert.equal(TRACKING_ZONE_LAYOUT.IMRT1.primaryScreen, "bay-2")
  assert.equal(TRACKING_ZONE_LAYOUT.IMRT1.group, "bay-2-line-1")
  assert.equal(TRACKING_ZONE_LAYOUT.IMRT1.order, 310)
  assert.equal(TRACKING_ZONE_LAYOUT.IMRT1.label, "IMRT1")
})

test("Stacker and Bay 1 use CurrentZone, not logical buffer membership or secondary occupied positions", () => {
  const { stacker, bay1 } = renderViews([
    bundle("PHYSICAL-SGRT1", "SGRT1", { LogicalBufferName: "SGRT2", QueueSequence: 1, OccupiedZones: ["SGRT1", "SGRT2"] }),
    bundle("EXCLUDED-IMRT1", "IMRT1", { LogicalBufferName: "SGRT2", QueueSequence: 2 }),
    bundle("UNKNOWN-POSITION", "NOT-A-ZONE"),
    bundle("WITHOUT-POSITION", null),
  ])
  for (const html of [stacker, bay1]) {
    assert.deepEqual(renderedIds(zoneMarkup(html, "SGRT1")), ["PHYSICAL-SGRT1"])
    assert.deepEqual(renderedIds(zoneMarkup(html, "SGRT2")), [])
    assert.doesNotMatch(html, /EXCLUDED-IMRT1|UNKNOWN-POSITION|WITHOUT-POSITION/)
  }
})

test("Stacker and Bay 1 hide REMOVED records and their weights even when supplied with lingering zone positions", () => {
  const removed = bundle("HIDE-REMOVED", "SGRT2", { Status: " removed ", Weight: 99999 })
  const active = bundle("ACTIVE-ZERO", "SGRT2", { Weight: 0 })
  // Deliberately bypass dashboard filtering to test the rendered card and scale guards.
  const { stacker, bay1 } = renderViews([removed, active], { bundlesByZone: { SGRT2: [removed, active] } })
  for (const html of [stacker, bay1]) {
    assert.doesNotMatch(html, /HIDE-REMOVED|99999/)
    assert.deepEqual(renderedIds(zoneMarkup(html, "SGRT2")), ["ACTIVE-ZERO"])
    assert.match(zoneMarkup(html, "SGRT2"), /aria-label="1 bundles"/)
    assert.match(html, /Weight: 0/)
  }
})

test("Stacker and Bay 1 scale reads only SGRT2 weight, preserving unavailable values without inventing units", () => {
  const { stacker, bay1 } = renderViews([
    bundle("SCALE-WEIGHED", "SGRT2", { Weight: 1234.5 }),
    bundle("SCALE-PENDING", "SGRT2"),
    bundle("NOT-SCALE", "SGRT1", { Weight: 98765 }),
  ])
  for (const html of [stacker, bay1]) {
    const scale = html.match(/<div\b[^>]*aria-label="SGRT2 bundle weight"[\s\S]*?<\/div>/)?.[0]
    assert.ok(scale, "The scale readout remains visible")
    assert.match(scale, /SCALE-WEIGHED/)
    assert.match(scale, /Weight: 1234\.5/)
    assert.match(scale, /SCALE-PENDING/)
    assert.match(scale, /Weight: unavailable/)
    assert.doesNotMatch(scale, /NOT-SCALE|98765|\bkg\b|\blbs\b/)
  }
})

test("Stacker distinguishes startup from a received empty snapshot", () => {
  const waiting = renderViews([bundle("NOT-YET-RECEIVED", "SGRT2", { Weight: 123 })], { hasSnapshot: false }).stacker
  assert.match(waiting, /Waiting for tracking data/)
  assert.match(zoneMarkup(waiting, "SGRT2"), />Waiting</)
  assert.doesNotMatch(waiting, /data-tracking-id|Weight: 123|NOT-YET-RECEIVED/)
  const empty = renderViews().stacker
  assert.match(zoneMarkup(empty, "SGRT2"), />Empty</)
  assert.match(empty, /No bundle in SGRT2/)
})

// Only the outer screen title/accessibility labels differ; the diagram itself
// remains Stacker's shared Overview variant, including all card behavior.
const normalizedBay1 = (html) => html.replaceAll("Bay 1", "Stacker")

test("Bay 1 mirrors the complete Stacker markup without modifying the snapshot or rendering legacy manual equipment", () => {
  const Bundles = Object.freeze([...RETAINED_ZONES, ...OMITTED_ZONES].map((name) => Object.freeze(bundle("VISIBLE-" + name, name))))
  const grouped = groupTrackingBundlesByZone(Bundles).byZone
  for (const list of Object.values(grouped)) Object.freeze(list)
  Object.freeze(grouped)
  const before = JSON.stringify({ Bundles, grouped })
  const { overview, stacker, bay1 } = renderViews(Bundles, { bundlesByZone: grouped })
  assert.match(bay1, /aria-label="Bay 1"/)
  assert.match(bay1, />Bay 1<\/h2>/)
  assert.match(bay1, /aria-label="Scrollable Bay 1 production diagram"/)
  assert.equal(normalizedBay1(bay1), stacker, "Only the screen title and matching shell labels may differ")
  assert.deepEqual(renderedZones(bay1), [...RETAINED_ZONES].sort())
  assert.doesNotMatch(bay1, /Bay 1 Manual Station|Bay 1 tracked positions|Handoff from Stackers|physical equipment context/i)
  for (const name of RETAINED_ZONES) assert.equal(zoneMarkup(bay1, name), zoneMarkup(overview, name))
  for (const name of OMITTED_ZONES) assert.ok(!renderedIds(bay1).includes("VISIBLE-" + name))
  assert.equal(JSON.stringify({ Bundles, grouped }), before)
})

test("Bay 1 matches Stacker in live startup, empty live state, and mock preview without a received API snapshot", () => {
  for (const options of [
    { mode: "live", hasSnapshot: false },
    { mode: "live", hasSnapshot: true },
    { mode: "mock", hasSnapshot: false },
  ]) {
    const populated = [bundle("STATE-SCALE", "SGRT2", { Weight: 4321 })]
    const { stacker, bay1 } = renderViews(populated, options)
    assert.equal(normalizedBay1(bay1), stacker)
    if (options.mode === "live" && !options.hasSnapshot) {
      assert.match(zoneMarkup(bay1, "SGRT2"), />Waiting</)
      assert.doesNotMatch(bay1, /data-tracking-id|Weight: 4321|STATE-SCALE/)
    } else {
      assert.deepEqual(renderedIds(zoneMarkup(bay1, "SGRT2")), ["STATE-SCALE"])
      assert.match(bay1, /Weight: 4321/)
    }
    const empty = renderViews([], options)
    assert.equal(normalizedBay1(empty.bay1), empty.stacker)
    if (options.mode === "mock" || options.hasSnapshot) {
      assert.match(zoneMarkup(empty.bay1, "SGRT2"), />Empty</)
      assert.match(empty.bay1, /No bundle in SGRT2/)
    }
  }
})

test("Bay 1 uses the same Stacker filter identities and motion state, without dropping zone cards", () => {
  for (const matchedIds of [null, new Set(), new Set(["stk-a"]), new Set(["bay1-t1"])]) {
    for (const animationRunning of [false, true]) {
      const { stacker, bay1 } = renderViews([], { matchedIds, animationRunning })
      assert.equal(normalizedBay1(bay1), stacker)
      assert.deepEqual(renderedZones(bay1), [...RETAINED_ZONES].sort())
      const muted = Boolean(matchedIds && !matchedIds.has("stk-a"))
      assert.equal(/opacity-30 saturate-50/.test(bay1), muted)
      assert.equal((bay1.match(/animate-soft-pulse/g) ?? []).length, animationRunning ? 9 : 0)
    }
  }
})
