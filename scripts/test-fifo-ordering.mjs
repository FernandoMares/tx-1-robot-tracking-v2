// Run: node scripts/test-fifo-ordering.mjs
// Uses actual TypeScript sources and owned loopback simulators only. No plant
// URL, existing server, environment file, or write endpoint is used.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { dirname, resolve, sep } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const requirePackage = createRequire(import.meta.url)
function loadTypeScript(relativePath) {
  const cache = new Map()
  function load(filename) {
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
          assert.ok(["react", "react/jsx-runtime", "clsx", "tailwind-merge", "lucide-react", "@base-ui/react/button", "class-variance-authority"].includes(specifier), "Unexpected package: " + specifier)
          return requirePackage(specifier)
        }
        const path = resolve(specifier.startsWith("@/") ? root : dirname(filename), specifier.startsWith("@/") ? specifier.slice(2) : specifier)
        const target = [path + ".ts", path + ".tsx", resolve(path, "index.ts")].find(existsSync)
        assert.ok(target, "Module not found: " + specifier)
        return load(target)
      },
    }, { filename })
    return exports
  }
  return load(resolve(root, relativePath))
}

const { isTrackedBundleDto, isTrackingStateDto } = loadTypeScript("lib/tracking-api/validation.ts")
const { getFifoMembership, orderBundlesByLogicalFifo } = loadTypeScript("lib/tracking-fifo.ts")
const { groupTrackingBundlesByZone } = loadTypeScript("lib/tracking-zone-layout.ts")
const { TrackingZoneSlot } = loadTypeScript("components/plant/tracking-zone-slot.tsx")
const { MainSchematic } = loadTypeScript("components/plant/main-schematic.tsx")
const { BayTwoSchematic } = loadTypeScript("components/plant/bay-two-schematic.tsx")

function bundle(TrackingId, extra = {}) {
  return {
    ...Object.fromEntries([
      "BundleId", "SourceArea", "RouteName", "BundleType", "Destination", "MillOrder1", "MillOrder2",
      "MillOrder3", "MillOrder4", "MillOrder5", "Disposition", "HoldCode", "Status", "CorrelationStatus",
      "CreatedUtc", "LastUpdateUtc", "PrinterId", "Weight", "L2Id", "TagNumber", "PieceCount1", "PieceCount2",
      "PieceCount3", "PieceCount4", "PieceCount5", "TagCopy",
    ].map((field) => [field, null])),
    ScenarioName: "FIFO_TEST", TrackingId, CurrentZone: "CCH2A", ...extra,
  }
}
function member(id, sequence, bufferName = "CCH2A", extra = {}) {
  return bundle(id, { LogicalBufferName: bufferName, QueueSequence: sequence, ...extra })
}
const ids = (bundles) => Array.from(bundles, (entry) => entry.TrackingId)

test("FIFO DTO additions accept legacy/null and finite numbers but reject wrong types", () => {
  const legacy = bundle("LEGACY")
  assert.equal(isTrackedBundleDto(legacy), true)
  for (const fields of [
    { LogicalBufferName: null, QueueSequence: null }, { LogicalBufferName: "CCH2A" },
    { QueueSequence: 0 }, { QueueSequence: 1.5 }, { QueueSequence: Number.MAX_SAFE_INTEGER + 1 },
    { LogicalBufferName: "CCH2A", QueueSequence: 5161 },
  ]) assert.equal(isTrackedBundleDto({ ...legacy, ...fields }), true)
  for (const QueueSequence of [NaN, Infinity, -Infinity, "5161", true, [], {}]) {
    assert.equal(isTrackedBundleDto({ ...legacy, QueueSequence }), false, String(QueueSequence))
  }
  for (const LogicalBufferName of [42, true, [], {}]) {
    assert.equal(isTrackedBundleDto({ ...legacy, LogicalBufferName }), false)
  }
})

test("membership requires a nonblank exact buffer name and safe integer sequence including zero", () => {
  for (const sequence of [0, 5161, -1, Number.MAX_SAFE_INTEGER]) {
    const result = getFifoMembership(member("VALID", sequence))
    assert.equal(result.bufferName, "CCH2A")
    assert.equal(result.sequence, sequence)
  }
  for (const sequence of [null, undefined, NaN, Infinity, -Infinity, "5161", 1.5, Number.MAX_SAFE_INTEGER + 1, true]) {
    assert.equal(getFifoMembership(member("INVALID", sequence)), null, String(sequence))
  }
  for (const name of [null, undefined, "", " \t ", 42]) assert.equal(getFifoMembership({ ...member("INVALID", 1), LogicalBufferName: name }), null)
  assert.equal(getFifoMembership(bundle("ABSENT")), null)
})

test("commissioning example sorts by sequence, preserving input objects and array", () => {
  const input = Object.freeze([
    Object.freeze(member("A-TRACKING-ID", 5164, "CCH2A", { TagNumber: 101637552 })),
    Object.freeze(member("Z-TRACKING-ID", 5162, "CCH2A", { TagNumber: 101637550 })),
    Object.freeze(member("M-TRACKING-ID", 5161, "CCH2A", { TagNumber: 101637551 })),
    Object.freeze(member("B-TRACKING-ID", 5163, "CCH2A", { TagNumber: 101637553 })),
  ])
  const result = orderBundlesByLogicalFifo(input)
  assert.deepEqual(Array.from(result.bundles, (entry) => entry.TagNumber), [101637551, 101637550, 101637553, 101637552])
  assert.deepEqual(ids(input), ["A-TRACKING-ID", "Z-TRACKING-ID", "M-TRACKING-ID", "B-TRACKING-ID"])
  for (const [position, original] of [2, 1, 3, 0].entries()) assert.equal(result.bundles[position], input[original])
  assert.equal(result.hasFifoMembers, true)
  assert.equal(result.hasUnorderedMembers, false)
  assert.equal(result.hasDuplicateSequences, false)
})

test("sort is stable within each exact queue and leaves unordered original slots in place", () => {
  const input = Object.freeze([
    member("A5-FIRST", 5), member("B9", 9, "CCH2B"), bundle("NULL", { LogicalBufferName: null, QueueSequence: null }),
    member("A1", 1), member("CASE-DISTINCT", -100, "cch2a"), member("B2", 2, "CCH2B"),
    bundle("LEGACY"), member("A5-SECOND", 5), member("SPACE-DISTINCT", -200, " CCH2A "),
  ].map(Object.freeze))
  const result = orderBundlesByLogicalFifo(input)
  assert.deepEqual(ids(result.bundles), ["A1", "B2", "NULL", "A5-FIRST", "CASE-DISTINCT", "B9", "LEGACY", "A5-SECOND", "SPACE-DISTINCT"])
  assert.equal(result.bundles[2], input[2])
  assert.equal(result.bundles[6], input[6])
  assert.equal(result.hasFifoMembers, true)
  assert.equal(result.hasUnorderedMembers, true)
  assert.equal(result.hasDuplicateSequences, true)
  assert.equal(orderBundlesByLogicalFifo([member("A", 1, "A"), member("B", 1, "B")]).hasDuplicateSequences, false)
})

test("legacy/empty/malformed sequence lists retain receive order and report missing FIFO information", () => {
  const legacy = [bundle("B"), bundle("A", { LogicalBufferName: null, QueueSequence: null })]
  const result = orderBundlesByLogicalFifo(legacy)
  assert.deepEqual(ids(result.bundles), ["B", "A"])
  assert.equal(result.hasFifoMembers, false)
  assert.equal(result.hasUnorderedMembers, true)
  assert.equal(result.hasDuplicateSequences, false)
  const malformed = [NaN, Infinity, "1", Number.MAX_SAFE_INTEGER + 1].map((sequence, index) => member(String(index), sequence))
  assert.deepEqual(ids(orderBundlesByLogicalFifo(malformed).bundles), ["0", "1", "2", "3"])
  const empty = orderBundlesByLogicalFifo([])
  assert.equal(empty.bundles.length, 0)
  assert.equal(empty.hasFifoMembers, false)
  assert.equal(empty.hasUnorderedMembers, false)
  assert.equal(empty.hasDuplicateSequences, false)
})

test("logical FIFO membership does not relocate CurrentZone grouping", () => {
  const a = Object.freeze(member("PHYSICAL-A", 20, "CCH2B", { CurrentZone: "CCH2A" }))
  const b = Object.freeze(member("PHYSICAL-B", 10, "CCH2B", { CurrentZone: "CCH2B" }))
  const unknown = Object.freeze(member("UNKNOWN", 0, "CCH2A", { CurrentZone: "NOT_IN_LAYOUT" }))
  const absent = Object.freeze(member("NO_ZONE", 1, "CCH2A", { CurrentZone: null }))
  const grouped = groupTrackingBundlesByZone(orderBundlesByLogicalFifo([a, b, unknown, absent]).bundles)
  assert.deepEqual(ids(grouped.byZone.CCH2A), ["PHYSICAL-A"])
  assert.deepEqual(ids(grouped.byZone.CCH2B), ["PHYSICAL-B"])
  assert.deepEqual(ids(grouped.unknownZone), ["UNKNOWN"])
  assert.deepEqual(ids(grouped.withoutZone), ["NO_ZONE"])
  assert.equal(a.CurrentZone, "CCH2A")
  assert.equal(b.CurrentZone, "CCH2B")
})

function zoneMarkup(html, name) {
  const match = html.match(new RegExp('<section\\b(?=[^>]*data-zone-name="' + name + '")[\\s\\S]*?<\\/section>'))
  assert.ok(match, "Rendered zone must exist: " + name)
  return match[0]
}
function renderedIds(html) {
  return Array.from(html.matchAll(/data-tracking-id="([^"]+)"/g), (match) => match[1])
}
function verifyRenderedViews(snapshot) {
  const bundlesByZone = groupTrackingBundlesByZone(snapshot.Bundles).byZone
  const tracking = { mode: "live", syncStatus: "live", trackingState: snapshot }
  const views = [
    ["Overview", createElement(MainSchematic, { animationRunning: false, bundlesByZone, hasSnapshot: true })],
    ["Bay 2", createElement(BayTwoSchematic, { updatedAt: null, animationRunning: false, matchedIds: null, tracking, bundlesByZone })],
  ]
  for (const [name, view] of views) {
    const html = renderToStaticMarkup(view)
    const fifo = zoneMarkup(html, "CCH2A")
    assert.deepEqual(renderedIds(fifo), ["SIM-FIFO-5", "SIM-FIFO-2", "SIM-FIFO-3", "SIM-FIFO-7", "SIM-FIFO-1", "SIM-FIFO-6", "SIM-FIFO-8", "SIM-FIFO-4"], name)
    assert.match(fifo, /aria-label="8 bundles"/)
    assert.match(fifo, /overflow-y-auto/)
    assert.match(fifo, /height:120px/, "Five compact rows reserve 120px while retaining every bundle in the markup")
    assert.match(fifo, /data-fifo-order="partial"/)
    assert.match(fifo, /aria-label="FIFO order incomplete"/)
    assert.match(fifo, /title="FIFO members are shown by QueueSequence ascending/)
    assert.match(fifo, /Other bundles have no usable FIFO membership/)
    assert.deepEqual(Array.from(fifo.matchAll(/data-queue-sequence="(\d+)"/g), (match) => Number(match[1])), [5161, 5162, 5163, 5164, 5165, 5166])
    const legacyZone = zoneMarkup(html, "SGRT1B")
    assert.deepEqual(renderedIds(legacyZone), ["SIM-TRACK-HOLD"])
    assert.doesNotMatch(legacyZone, /data-fifo-order|FIFO/)
    assert.deepEqual(renderedIds(zoneMarkup(html, "SGRT2B")), ["SIM-TRACK-WARNING"])
    assert.deepEqual(renderedIds(zoneMarkup(html, "CCH2B")), [])
  }
}

test("actual zone renderer distinguishes complete, duplicate, legacy, empty and startup states", () => {
  const render = (bundles, props = {}) => renderToStaticMarkup(createElement(TrackingZoneSlot, { zoneName: "CCH2A", bundles, ...props }))
  const duplicate = render([member("FIRST", 2), member("SECOND", 2)])
  assert.deepEqual(renderedIds(duplicate), ["FIRST", "SECOND"])
  assert.match(duplicate, /data-fifo-order="partial"/)
  assert.match(duplicate, /Duplicate sequences: equal entries have no confirmed FIFO precedence/)
  const complete = render([member("LATER", 2), member("EARLIER", 0)])
  assert.deepEqual(renderedIds(complete), ["EARLIER", "LATER"])
  assert.match(complete, /data-fifo-order="ascending"/)
  assert.doesNotMatch(complete, /FIFO order incomplete/)
  const legacy = render([bundle("LEGACY-B"), bundle("LEGACY-A")])
  assert.deepEqual(renderedIds(legacy), ["LEGACY-B", "LEGACY-A"])
  assert.doesNotMatch(legacy, /data-fifo-order|FIFO/)
  assert.match(render([]), />Empty</)
  const startup = render([member("NOT_YET_VISIBLE", 1)], { hasSnapshot: false })
  assert.match(startup, />Waiting</)
  assert.doesNotMatch(startup, /data-fifo-order|data-tracking-id/)
})

async function startSimulator(fifoDemo, { disabledZones = "" } = {}) {
  const reservation = createServer()
  await new Promise((done, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", done) })
  const port = reservation.address().port
  await new Promise((done) => reservation.close(done))
  const baseUrl = "http://127.0.0.1:" + port
  const child = spawn(process.execPath, [resolve(root, "scripts/tracking-api-simulator.mjs")], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env, TRACKING_SIMULATOR_HOST: "127.0.0.1", TRACKING_SIMULATOR_PORT: String(port),
      TRACKING_SIMULATOR_STEP_MS: "3600000", TRACKING_SIMULATOR_BUFFER_DEMO: "false",
      TRACKING_SIMULATOR_FIFO_DEMO: String(fifoDemo), TRACKING_SIMULATOR_QMOS_CONNECTED: "true",
      TRACKING_SIMULATOR_OPC_CONNECTED: "true", TRACKING_SIMULATOR_LOG_REQUESTS: "false",
      TRACKING_SIMULATOR_DISABLED_ZONES: disabledZones,
    },
  })
  const kill = () => { if (child.exitCode === null && child.signalCode === null) child.kill() }
  process.once("exit", kill)
  let output = ""
  let timeout
  const exited = new Promise((done) => child.once("exit", done))
  try {
    await new Promise((done, reject) => {
      timeout = setTimeout(() => reject(new Error("Simulator startup timed out: " + output)), 10000)
      child.once("error", reject)
      child.once("exit", (code) => reject(new Error("Simulator exited before ready (" + code + "): " + output)))
      child.stderr.on("data", (data) => { output = (output + data).slice(-16000) })
      child.stdout.on("data", (data) => {
        output = (output + data).slice(-16000)
        if (output.includes("Tracking API simulator running at " + baseUrl)) done()
      })
    })
  } catch (error) {
    kill()
    process.removeListener("exit", kill)
    throw error
  } finally { clearTimeout(timeout) }
  return {
    async get(path) {
      const url = new URL(path, baseUrl)
      assert.equal(url.origin, baseUrl, "Only the owned loopback child may be contacted")
      assert.equal(child.exitCode, null)
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) })
      assert.equal(response.status, 200)
      return response.json()
    },
    async close() {
      kill()
      let timer
      try {
        await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Simulator did not exit")), 5000) })])
      } finally { clearTimeout(timer); process.removeListener("exit", kill) }
    },
  }
}

test("opt-in simulator fixture renders authoritative FIFO in Overview and Bay 2 with five-row overflow", { timeout: 20000 }, async () => {
  const legacy = await startSimulator(false)
  try {
    const snapshot = await legacy.get("/api/tracking/state")
    assert.equal(isTrackingStateDto(snapshot), true)
    assert.equal(snapshot.Bundles.length, 3)
    assert.ok(snapshot.Bundles.every((entry) => !Object.hasOwn(entry, "QueueSequence") && !Object.hasOwn(entry, "LogicalBufferName")))
    assert.equal((await legacy.get("/api/tracking/map")).Zones.find((zone) => zone.ZoneName === "CCH2A").Capacity, 1)
  } finally { await legacy.close() }

  const simulator = await startSimulator(true)
  try {
    const snapshot = await simulator.get("/api/tracking/state")
    assert.equal(isTrackingStateDto(snapshot), true)
    const cch2a = groupTrackingBundlesByZone(snapshot.Bundles).byZone.CCH2A
    assert.equal(cch2a.length, 8)
    const result = orderBundlesByLogicalFifo(cch2a)
    assert.deepEqual(Array.from(result.bundles.filter((entry) => getFifoMembership(entry)), (entry) => [entry.QueueSequence, entry.TagNumber]), [
      [5161, 101637551], [5162, 101637550], [5163, 101637553], [5164, 101637552], [5165, 101637554], [5166, 101637555],
    ])
    assert.notDeepEqual(ids(result.bundles), ids(cch2a), "Wire order must deliberately differ from FIFO")
    assert.equal(result.bundles[2], cch2a[2], "Explicit null entry keeps its original slot")
    assert.equal(result.bundles[5], cch2a[5], "Legacy absent entry keeps its original slot")
    assert.equal(result.hasUnorderedMembers, true)
    assert.equal(result.hasDuplicateSequences, false)
    assert.equal((await simulator.get("/api/tracking/map")).Zones.find((zone) => zone.ZoneName === "CCH2A").Capacity, 8)
    assert.deepEqual(await simulator.get("/api/tracking/bundles/" + encodeURIComponent(cch2a[0].TrackingId)), cch2a[0])
    verifyRenderedViews(snapshot)
  } finally { await simulator.close() }
})
