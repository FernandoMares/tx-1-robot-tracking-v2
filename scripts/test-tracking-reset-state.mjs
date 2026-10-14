// Pure state guards only: no server, configured API, plant access or real reset.
// Run: node scripts/test-tracking-reset-state.mjs
import assert from "node:assert/strict"
import { test } from "node:test"
import { loadTypeScript } from "./tracking-api-test-helpers.mjs"

const { supportsTrackingReset, resetPreflightProblem, resetOutcomeObserved } = loadTypeScript("lib/tracking-api/tracking-reset.ts")
const scenario = "RESET_STATE_TEST"
const bundle = (TrackingId, extra = {}) => ({
  TrackingId, ScenarioName: scenario, Status: "TRACKING", CurrentZone: "CCH2A", OccupiedZones: ["CCH2A"], ...extra,
})
const snapshot = (Bundles) => ({ ScenarioName: scenario, LastUpdateUtc: "2000-01-01T00:00:00Z", Bundles })
const removed = (TrackingId, extra = {}) => bundle(TrackingId, { Status: "REMOVED", CurrentZone: null, OccupiedZones: [], ...extra })
function fixture() {
  const displayedState = snapshot([bundle("TEST-A"), bundle("TEST-B"), removed("HISTORICAL")])
  return {
    displayedState, state: structuredClone(displayedState),
    service: { running: true, scenario },
    capabilities: { commands: ["POST /api/tracking/reset"] },
  }
}

test("reset capability requires the exact path with POST or the bare advertised path", () => {
  assert.equal(supportsTrackingReset(null), false)
  for (const command of ["POST /api/tracking/reset", "/api/tracking/reset", " post   /api/tracking/reset "]) {
    assert.equal(supportsTrackingReset({ commands: [command] }), true, command)
  }
  for (const command of ["GET /api/tracking/reset", "PUT /api/tracking/reset", "/api/tracking/reset-extra", "POST /api/tracking/reset extra", "POST /api/tracking/reset?all=true", "POST /api/tracking/correct", ""]) {
    assert.equal(supportsTrackingReset({ commands: [command] }), false, command)
  }
})

test("reset preflight uses active identities and allows reordering or position changes", () => {
  const options = fixture()
  options.state.Bundles.reverse()
  options.state.Bundles[1].CurrentZone = "SGRT2A"
  options.state.Bundles[1].OccupiedZones = ["SGRT2A"]
  options.state.LastUpdateUtc = null
  assert.equal(resetPreflightProblem(options), null)
  options.state.Bundles = options.state.Bundles.filter((item) => item.Status !== "REMOVED")
  assert.equal(resetPreflightProblem(options), null, "Historical removed rows need not remain in a fresh snapshot")
  const empty = fixture()
  empty.displayedState.Bundles = []
  empty.state.Bundles = []
  assert.equal(resetPreflightProblem(empty), null, "Already empty requests can be accepted but cannot prove completion from state alone")
})

test("reset preflight rejects capability, service, scenario and identity ambiguity", () => {
  const cases = [
    ["stopped", (o) => { o.service.running = false }, /not running/],
    ["missing capability", (o) => { o.capabilities.commands = [] }, /advertises/],
    ["GET only", (o) => { o.capabilities.commands = ["GET /api/tracking/reset"] }, /advertises/],
    ["changed scenario", (o) => { o.state.ScenarioName = "OTHER" }, /scenario/],
    ["blank scenario", (o) => { o.state.ScenarioName = "" }, /scenario/],
    ["missing service scenario", (o) => { o.service.scenario = null }, /scenario/],
    ["changed service scenario", (o) => { o.service.scenario = "OTHER" }, /scenario/],
    ["foreign active row", (o) => { o.state.Bundles[0].ScenarioName = "OTHER" }, /identities/],
    ["foreign removed row", (o) => { o.state.Bundles[2].ScenarioName = "OTHER" }, /identities/],
    ["duplicate active", (o) => { o.state.Bundles.push(structuredClone(o.state.Bundles[0])) }, /identities/],
    ["duplicate removed", (o) => { o.state.Bundles.push(removed("TEST-A")) }, /identities/],
    ["blank identity", (o) => { o.state.Bundles[0].TrackingId = " " }, /identities/],
    ["ambiguous displayed state", (o) => { o.displayedState.Bundles.push(bundle("TEST-A")) }, /identities/],
    ["new incoming bundle", (o) => { o.state.Bundles.push(bundle("NEW")) }, /active bundles changed/],
    ["departed bundle", (o) => { o.state.Bundles.shift() }, /active bundles changed/],
    ["newly removed bundle", (o) => { o.state.Bundles[0] = removed("TEST-A") }, /active bundles changed/],
    ["same count different scope", (o) => { o.state.Bundles[0].TrackingId = "REPLACEMENT" }, /active bundles changed/],
  ]
  for (const [name, alter, pattern] of cases) {
    const options = fixture()
    alter(options)
    assert.match(resetPreflightProblem(options) ?? "", pattern, name)
  }
})

test("reset outcome requires a nonempty baseline and a subsequent fully cleared same-scenario state", () => {
  const baseline = fixture().state
  assert.equal(resetOutcomeObserved(baseline, snapshot([])), true)
  assert.equal(resetOutcomeObserved(baseline, snapshot([removed("TEST-A"), removed("TEST-B")])), true)
  assert.equal(resetOutcomeObserved(baseline, snapshot([removed("TEST-A", { Status: " removed " })])), true)
  assert.equal(resetOutcomeObserved(snapshot([]), snapshot([])), false)
  assert.equal(resetOutcomeObserved(snapshot([removed("OLD")]), snapshot([])), false)
  assert.equal(resetOutcomeObserved(baseline, baseline), false)
  assert.equal(resetOutcomeObserved(baseline, snapshot([bundle("NEW-INCOMING")])), false)
  assert.equal(resetOutcomeObserved(baseline, { ...snapshot([]), ScenarioName: "OTHER" }), false)
})

test("reset cannot confirm retained occupied, unknown, duplicate or foreign records", () => {
  const baseline = fixture().state
  const blockedRows = [
    removed("A", { CurrentZone: "CCH2A" }),
    removed("A", { CurrentZone: "" }),
    removed("A", { CurrentZone: undefined }),
    removed("A", { OccupiedZones: ["CCH2A"] }),
    removed("A", { OccupiedZones: null }),
    removed("A", { OccupiedZones: undefined }),
    removed("A", { OccupiedZones: { length: 0 } }),
    removed("A", { Status: null }),
    removed("A", { Status: "COMPLETE" }),
    removed("A", { ScenarioName: "OTHER" }),
    removed("A", { TrackingId: "" }),
  ]
  for (const row of blockedRows) assert.equal(resetOutcomeObserved(baseline, snapshot([row])), false, JSON.stringify(row))
  assert.equal(resetOutcomeObserved(baseline, snapshot([removed("A"), removed("A")])), false)
  const invalidBaseline = snapshot([bundle("A"), bundle("A")])
  assert.equal(resetOutcomeObserved(invalidBaseline, snapshot([])), false)
  assert.equal(resetOutcomeObserved({ ...baseline, ScenarioName: "" }, { ...snapshot([]), ScenarioName: "" }), false)
})
