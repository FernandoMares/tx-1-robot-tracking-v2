// Run: node scripts/test-bundler-layout.mjs
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

const { MainSchematic, MAIN_SCHEMATIC_WIDTH, MAIN_SCHEMATIC_HEIGHT, BUNDLER_SCHEMATIC_WIDTH } = load("components/plant/main-schematic.tsx")
const { BundlerSchematic } = load("components/plant/bundler-schematic.tsx")
const { groupTrackingBundlesByZone, TRACKING_ZONES_BY_SCREEN, getTrackingZonesForScreen } = load("lib/tracking-zone-layout.ts")
const BLUE_ZONES = ["ERT1A", "ERT1B", "ERT2C", "ERT2D", "STRT1", "STRT2", "LFRT1", "LFRT2", "LFRT3"]
const RETAINED_ZONES = [
  "RTOUTA", "RTOUTB", "RTOUTC", "RTOUTD", "RTTY1", "RTTY2", "IMRT2",
  "SGRT1", "SGRT2", "NCCT1", "NCCT2", "IMRT1",
  "SGRT1A", "SGRT1B", "CCH1A", "CCH1B", "SGRT2A", "SGRT2B", "CCH2A", "CCH2B",
]
const scenario = "BUNDLER_LAYOUT_TEST"
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
function bundle(TrackingId, CurrentZone, extra = {}) {
  return {
    ScenarioName: scenario, TrackingId, BundleId: TrackingId, CurrentZone,
    OccupiedZones: CurrentZone ? [CurrentZone] : [], Status: "TRACKING",
    CorrelationStatus: "MATCHED", Weight: null, ...extra,
  }
}
function renderViews(Bundles = [], { hasSnapshot = true, bundlesByZone } = {}) {
  const grouped = bundlesByZone ?? groupTrackingBundlesByZone(Bundles).byZone
  const tracking = {
    mode: "live", syncStatus: hasSnapshot ? "live" : "connecting",
    trackingState: hasSnapshot ? { ScenarioName: scenario, Bundles, LastUpdateUtc: null } : null,
  }
  return {
    overview: render(MainSchematic, { animationRunning: false, bundlesByZone: grouped, hasSnapshot }),
    bundler: render(BundlerSchematic, { updatedAt: null, animationRunning: false, tracking, bundlesByZone: grouped }),
  }
}
function zoneMarkup(html, name) {
  const match = html.match(new RegExp('<section\\b(?=[^>]*data-zone-name="' + name + '")[\\s\\S]*?<\\/section>'))
  assert.ok(match, "Rendered zone must exist: " + name)
  return match[0]
}
const renderedZones = (html) => Array.from(html.matchAll(/data-zone-name="([^"]+)"/g), (match) => match[1]).sort()
const renderedIds = (html) => Array.from(html.matchAll(/data-tracking-id="([^"]+)"/g), (match) => match[1])

test("Bundler renders exactly Overview minus the nine blue-area zones; Overview retains them", () => {
  const { overview, bundler } = renderViews()
  assert.deepEqual(renderedZones(bundler), [...RETAINED_ZONES].sort())
  assert.deepEqual(renderedZones(overview), [...RETAINED_ZONES, ...BLUE_ZONES].sort())
  assert.match(overview, /STK Stackers/)
  assert.doesNotMatch(bundler, /STK Stackers|Four source sections feeding the shared transfer route|LMD [1-4]/)
  const arrows = (html, direction) => (html.match(new RegExp('class="[^"]*lucide-arrow-' + direction + '(?: |")', "g")) ?? []).length
  assert.equal(arrows(overview, "right") - arrows(bundler, "right"), 6, "Remove four transfer arrows and both stacker-route connectors")
  assert.equal(arrows(bundler, "up"), arrows(overview, "up"), "Tracking-section connections remain")
  assert.equal(arrows(bundler, "down"), arrows(overview, "down"), "Scale/NCCT connections remain")
  for (const html of [overview, bundler]) {
    assert.doesNotMatch(html, /data-zone-name="LCH[12][AB]"/)
    assert.match(html, /BUND Bundler/)
    assert.match(html, /First tracking section/)
    assert.match(html, /Second tracking section/)
    assert.match(html, /aria-label="Robot 2 physical equipment context"/)
    assert.match(html, /aria-label="SGRT2 bundle weight"/)
  }
  assert.equal(MAIN_SCHEMATIC_WIDTH, 1480)
  assert.equal(MAIN_SCHEMATIC_HEIGHT, 760)
  assert.equal(BUNDLER_SCHEMATIC_WIDTH, 1000)
  assert.match(overview, /width:1480px;height:760px/)
  assert.match(bundler, /width:1000px;height:760px/)
})

test("retained cards match Overview exactly and the shared source snapshot is never changed", () => {
  const Bundles = Object.freeze([...RETAINED_ZONES, ...BLUE_ZONES].map((name) => Object.freeze(bundle("VISIBLE-" + name, name))))
  const grouped = groupTrackingBundlesByZone(Bundles).byZone
  for (const list of Object.values(grouped)) Object.freeze(list)
  Object.freeze(grouped)
  const before = JSON.stringify({ Bundles, grouped })
  const { overview, bundler } = renderViews(Bundles, { bundlesByZone: grouped })
  for (const name of RETAINED_ZONES) {
    assert.equal(zoneMarkup(bundler, name), zoneMarkup(overview, name), name + " must retain the same live card behavior")
  }
  for (const name of BLUE_ZONES) {
    assert.ok(renderedIds(overview).includes("VISIBLE-" + name))
    assert.ok(!renderedIds(bundler).includes("VISIBLE-" + name))
  }
  assert.equal(JSON.stringify({ Bundles, grouped }), before)
})

test("screen catalogs match the expanded Bundler view without changing other screens", () => {
  const expectedScreens = {
    bundler: RETAINED_ZONES,
    stackers: [...BLUE_ZONES, "SGRT1", "SGRT2", "NCCT1", "NCCT2", "IMRT1"],
    "bay-1": ["SGRT1", "SGRT2", "NCCT1", "NCCT2"],
    "bay-2": ["IMRT2", "IMRT1", "SGRT1A", "SGRT1B", "LCH1A", "LCH1B", "CCH1A", "CCH1B", "SGRT2A", "SGRT2B", "LCH2A", "LCH2B", "CCH2A", "CCH2B"],
  }
  for (const [screen, expected] of Object.entries(expectedScreens)) {
    assert.deepEqual(Array.from(TRACKING_ZONES_BY_SCREEN[screen]).sort(), [...expected].sort(), screen + " catalog")
    assert.deepEqual(Array.from(getTrackingZonesForScreen(screen), (zone) => zone.zoneName).sort(), [...expected].sort(), screen + " visual zones")
  }
})

test("all four CCH buffers preserve authoritative FIFO and five-row scrolling", () => {
  const Bundles = ["CCH1A", "CCH1B", "CCH2A", "CCH2B"].flatMap((name) => [
    bundle(name + "-LATE", name, { LogicalBufferName: name, QueueSequence: 6 }),
    bundle(name + "-THIRD", name, { LogicalBufferName: name, QueueSequence: 3 }),
    bundle(name + "-LEGACY", name),
    bundle(name + "-FIRST", name, { LogicalBufferName: name, QueueSequence: 1 }),
    bundle(name + "-SECOND", name, { LogicalBufferName: name, QueueSequence: 2 }),
    bundle(name + "-FOURTH", name, { LogicalBufferName: name, QueueSequence: 4 }),
    bundle(name + "-FIFTH", name, { LogicalBufferName: name, QueueSequence: 5 }),
  ])
  const { bundler, overview } = renderViews(Bundles)
  for (const html of [bundler, overview]) {
    for (const name of ["CCH1A", "CCH1B", "CCH2A", "CCH2B"]) {
      const zone = zoneMarkup(html, name)
      assert.deepEqual(renderedIds(zone), ["FIRST", "SECOND", "LEGACY", "THIRD", "FOURTH", "FIFTH", "LATE"].map((suffix) => name + "-" + suffix))
      assert.match(zone, /aria-label="7 bundles"/)
      assert.match(zone, /overflow-y-auto/)
      assert.match(zone, /height:120px/)
      assert.match(zone, /data-fifo-order="partial"/)
      assert.match(zone, /aria-label="FIFO order incomplete"/)
    }
  }
})

test("Bundler keeps CurrentZone placement instead of relocating logical FIFO membership", () => {
  const physical = bundle("PHYSICAL-CCH1A", "CCH1A", { LogicalBufferName: "CCH2A", QueueSequence: 1 })
  const { bundler } = renderViews([physical])
  assert.deepEqual(renderedIds(zoneMarkup(bundler, "CCH1A")), ["PHYSICAL-CCH1A"])
  assert.deepEqual(renderedIds(zoneMarkup(bundler, "CCH2A")), [])
})

test("Bundler and Overview hide REMOVED records even if directly supplied with lingering positions", () => {
  const removed = bundle("HIDE-REMOVED", "SGRT2", { Status: " removed ", Weight: 99999 })
  const active = bundle("ACTIVE-ZERO", "SGRT2", { Weight: 0 })
  // Deliberately bypass dashboard filtering to exercise the rendered cards' defenses.
  const { overview, bundler } = renderViews([removed, active], { bundlesByZone: { SGRT2: [removed, active] } })
  for (const html of [overview, bundler]) {
    assert.doesNotMatch(html, /HIDE-REMOVED|99999/)
    assert.deepEqual(renderedIds(zoneMarkup(html, "SGRT2")), ["ACTIVE-ZERO"])
    assert.match(zoneMarkup(html, "SGRT2"), /aria-label="1 bundles"/)
    assert.match(html, /Weight: 0/)
  }
})

test("Bundler scale reads only SGRT2 weight, preserves unavailable values, and never fabricates a unit", () => {
  const { bundler } = renderViews([
    bundle("SCALE-WEIGHED", "SGRT2", { Weight: 1234.5 }),
    bundle("SCALE-PENDING", "SGRT2"),
    bundle("NOT-SCALE", "SGRT1", { Weight: 98765 }),
  ])
  const scale = bundler.match(/<div\b[^>]*aria-label="SGRT2 bundle weight"[\s\S]*?<\/div>/)?.[0]
  assert.ok(scale, "The scale readout must remain visible")
  assert.match(scale, /SCALE-WEIGHED/)
  assert.match(scale, /Weight: 1234\.5/)
  assert.match(scale, /SCALE-PENDING/)
  assert.match(scale, /Weight: unavailable/)
  assert.doesNotMatch(scale, /NOT-SCALE|98765|\bkg\b|\blbs\b/)
})

test("Bundler distinguishes startup from an empty received snapshot", () => {
  const waiting = renderViews([bundle("NOT-YET-RECEIVED", "SGRT2", { Weight: 123 })], { hasSnapshot: false }).bundler
  assert.match(waiting, /Waiting for tracking data/)
  assert.match(zoneMarkup(waiting, "SGRT2"), />Waiting</)
  assert.doesNotMatch(waiting, /data-tracking-id|Weight: 123|NOT-YET-RECEIVED/)
  const empty = renderViews().bundler
  assert.match(zoneMarkup(empty, "SGRT2"), />Empty</)
  assert.match(empty, /No bundle in SGRT2/)
})
