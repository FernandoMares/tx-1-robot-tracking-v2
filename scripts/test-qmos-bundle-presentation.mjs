// Pure contract/presentation checks: no server, simulator or plant API is contacted.
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
  assert.ok(filename.startsWith(root + sep))
  if (cache.has(filename)) return cache.get(filename)
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  cache.set(filename, exports)
  runInNewContext(outputText, {
    exports,
    require(specifier) {
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return requirePackage(specifier)
      const path = resolve(specifier.startsWith("@/") ? root : dirname(filename), specifier.startsWith("@/") ? specifier.slice(2) : specifier)
      const target = [path + ".ts", path + ".tsx", resolve(path, "index.ts")].find(existsSync)
      assert.ok(target, "Missing source: " + specifier)
      return load(target)
    },
    fetch() { throw new Error("Network requests are forbidden in bundle presentation tests") },
  }, { filename })
  return exports
}

const {
  displayBundleIdentity, isInternalIdentifierBundle, isAwaitingQmosIdentifier,
  isQmosUnmatchedBundle, canPrintBundle, INTERNAL_IDENTIFIER_LABEL,
} = load("lib/tracking-api/bundle-presentation.ts")
const { TrackingZoneSlot } = load("components/plant/tracking-zone-slot.tsx")
const { ScaleWeightReadout } = load("components/plant/scale-weight-readout.tsx")
const { KpiCards } = load("components/kpi-cards.tsx")
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
function bundle(extra = {}) {
  return {
    ScenarioName: "PRESENTATION_TEST", TrackingId: "TRK-INTERNAL-001", BundleId: null,
    L2Id: 9001, TagNumber: null, CurrentZone: "CCH2A", OccupiedZones: ["CCH2A"],
    Status: "TRACKING", CorrelationStatus: "UNMATCHED", Weight: null, ...extra,
  }
}
function internal(extra = {}) {
  return bundle({ QmosLpnEnabled: false, IdentifierSource: "INTERNAL", DisplayId: "TRK-INTERNAL-001", CanPrint: false, ...extra })
}

test("v0.44 DisplayId is authoritative while OFF fallback uses TrackingId instead of L2Id", () => {
  assert.equal(displayBundleIdentity(bundle({ DisplayId: "LPN-DISPLAY", BundleId: "OLDER-ID", L2Id: 123 })), "LPN-DISPLAY")
  for (const DisplayId of [undefined, null, "", "  "]) {
    assert.equal(displayBundleIdentity(internal({ DisplayId, BundleId: "UNTRUSTED-OLD-LPN" })), "TRK-INTERNAL-001")
  }
  assert.equal(displayBundleIdentity(bundle({ IdentifierSource: "INTERNAL" })), "TRK-INTERNAL-001")
  assert.equal(displayBundleIdentity(bundle({ BundleId: "LEGACY-LPN" })), "LEGACY-LPN")
  assert.equal(displayBundleIdentity(bundle()), "9001")
  assert.equal(displayBundleIdentity(bundle({ L2Id: null })), "TRK-INTERNAL-001")
})

test("OFF unmatched is normal and contradictory permissions fail closed independently of global selection", () => {
  for (const value of [
    internal(),
    internal({ Status: "WAITING_QMOS_ID", CanPrint: true, TagNumber: 101 }),
    bundle({ QmosLpnEnabled: true, IdentifierSource: "INTERNAL", CanPrint: true, TagNumber: 101 }),
  ]) {
    assert.equal(isInternalIdentifierBundle(value), true)
    assert.equal(isAwaitingQmosIdentifier(value), false)
    assert.equal(isQmosUnmatchedBundle(value), false)
    assert.equal(canPrintBundle(value), false)
  }
  const on = bundle({ QmosLpnEnabled: true, IdentifierSource: "QMOS", TagNumber: 101, CanPrint: true })
  assert.equal(isAwaitingQmosIdentifier(on), true)
  assert.equal(isQmosUnmatchedBundle(on), true)
  assert.equal(canPrintBundle(on), true)
  assert.equal(isAwaitingQmosIdentifier(bundle()), true, "Legacy unmatched behavior is retained")
  assert.equal(isInternalIdentifierBundle(bundle()), false, "Missing policy never implies OFF")
  assert.equal(canPrintBundle(bundle({ CanPrint: true, TagNumber: 101 })), false)
  for (const TagNumber of [null, undefined, 0, -1, NaN, Infinity]) {
    assert.equal(canPrintBundle({ ...on, TagNumber }), false)
  }
  assert.equal(canPrintBundle({ ...on, CanPrint: false }), false)
})

test("OFF compact cards show the internal label without yellow QMOS waiting, preserving FIFO and five rows", () => {
  const bundles = Object.freeze([3, 1, 2, 5, 4, 6].map((QueueSequence) => Object.freeze(internal({
    TrackingId: "TRK-" + QueueSequence, DisplayId: "DISPLAY-" + QueueSequence,
    LogicalBufferName: "CCH2A", QueueSequence,
  }))))
  const before = JSON.stringify(bundles)
  const html = render(TrackingZoneSlot, { zoneName: "CCH2A", bundles, compact: true, compactVisibleRows: 5 })
  assert.match(html, /height:120px/)
  assert.match(html, /overflow-y-auto/)
  assert.match(html, /data-fifo-order="ascending"/)
  assert.match(html, /bg-emerald-700/)
  assert.doesNotMatch(html, /amber|>9001<|>UNMATCHED</)
  assert.equal((html.match(new RegExp(INTERNAL_IDENTIFIER_LABEL, "g")) ?? []).length, 12, "Each internal bundle has a visible label and a descriptive title")
  assert.deepEqual(Array.from(html.matchAll(/data-tracking-id="([^"]+)"/g), (match) => match[1]), [1, 2, 3, 4, 5, 6].map((id) => "TRK-" + id))
  for (const id of [1, 2, 3, 4, 5, 6]) assert.match(html, new RegExp(">DISPLAY-" + id + "<"))
  assert.equal(JSON.stringify(bundles), before)
})

test("mixed ON/OFF cards warn only for bundles still awaiting QMOS and continue to hide REMOVED", () => {
  const html = render(TrackingZoneSlot, {
    zoneName: "CCH2A", compact: false,
    bundles: [internal(), bundle({ TrackingId: "TRK-ON", DisplayId: "ON-DISPLAY", QmosLpnEnabled: true }),
      internal({ TrackingId: "TRK-REMOVED", DisplayId: "HIDDEN-REMOVED", Status: "REMOVED" })],
  })
  assert.match(html, /aria-label="2 bundles"/)
  assert.match(html, /bg-amber-600/)
  assert.match(html, /ID interno \/ sin LPN/)
  assert.match(html, />ON-DISPLAY</)
  assert.doesNotMatch(html, /HIDDEN-REMOVED|TRK-REMOVED/)
  const legacy = render(TrackingZoneSlot, { zoneName: "CCH2A", bundles: [bundle()] })
  assert.match(legacy, /bg-amber-600/)
  assert.match(legacy, />9001</)
  assert.doesNotMatch(legacy, /ID interno \/ sin LPN/)
})

test("scale uses DisplayId/internal TrackingId and preserves zero/null weight and removed filtering", () => {
  const html = render(ScaleWeightReadout, {
    hasSnapshot: true, compact: true,
    bundles: [internal({ DisplayId: null, Weight: 0 }),
      bundle({ TrackingId: "TRK-ON", DisplayId: "LPN-SCALE", Weight: null }),
      internal({ DisplayId: "HIDDEN-REMOVED", Status: "REMOVED", Weight: 99999 })],
  })
  assert.match(html, />TRK-INTERNAL-001</)
  assert.match(html, /ID interno \/ sin LPN/)
  assert.match(html, /Weight: 0/)
  assert.match(html, />LPN-SCALE</)
  assert.match(html, /Weight: unavailable/)
  assert.doesNotMatch(html, /9001|HIDDEN-REMOVED|99999|\bkg\b|\blbs\b/)
})

test("active KPI counts include OFF bundles but QMOS unmatched excludes them and removed records", () => {
  const html = render(KpiCards, {
    kpis: { totalBundles: 0, tablesActive: 0, bundlesInProcess: 0, bundlesCompleted: 0, completedTrendPct: 0 }, tracking: {
      mode: "live", topology: { Zones: [] },
      trackingState: { Bundles: [internal(), bundle({ TrackingId: "ON-1", QmosLpnEnabled: true }),
        bundle({ TrackingId: "LEGACY-1" }), internal({ Status: "REMOVED" })] },
    },
  })
  const metric = (label) => html.match(new RegExp(">" + label + "<\\/dt><dd[^>]*>([^<]+)<"))?.[1]
  assert.equal(metric("Active tracked bundles"), "3")
  assert.equal(metric("QMOS unmatched"), "2")
  assert.equal(metric("Occupied zones"), "1")
})
