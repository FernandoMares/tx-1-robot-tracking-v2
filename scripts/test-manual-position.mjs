// Run with: node scripts/test-manual-position.mjs
// Pure helper tests: no servers, network requests, timers, or plant access.
import assert from "node:assert/strict"
import { test } from "node:test"
import { loadTypeScript } from "./tracking-api-test-helpers.mjs"

const {
  getRepositionZones, supportsManualCorrection, reportedZoneOccupants,
  manualPreflightProblem, manualOutcomeObserved,
} = loadTypeScript("lib/tracking-api/manual-position.ts", {
  globals: { Date: class extends Date { static now() { return 9_000_000_000_000 } } },
})

const scenario = "MANUAL_POSITION_TEST"
function zone(ZoneName, extra = {}) {
  return {
    ZoneId: 1, ZoneName, ZoneType: "PROCESS", DisplayOrder: 1,
    Capacity: 1, Description: null, IsEnabled: true, ...extra,
  }
}
// These fixtures contain the position/identity fields read by the pure helpers;
// the API validators and full wire DTOs are covered by the integration runners.
function bundle(TrackingId = "TEST-SELECTED", extra = {}) {
  return {
    ScenarioName: scenario, TrackingId, CurrentZone: "SGRT1A",
    BundleId: "display-123", TagNumber: 123,
    OccupiedZones: ["SGRT1A", "LCH1A"], ...extra,
  }
}
function state(Bundles) {
  return { ScenarioName: scenario, LastUpdateUtc: "2000-01-01T00:00:00.000Z", Bundles }
}
function fixture() {
  const selected = bundle()
  const destination = zone("SGRT2A", { ZoneId: 2 })
  const displayedState = state([selected, bundle("TEST-OTHER", { CurrentZone: "CCH1A", OccupiedZones: [] })])
  return {
    action: "reposition", selected, displayedState, destination,
    service: { running: true, service: "test", apiVersion: "test", scenario, utc: null },
    capabilities: {
      apiVersion: "test", transport: "HTTP/JSON", hmiReadsDatabaseDirectly: false,
      commands: ["POST /api/tracking/correct"], reads: [], engineeringOpc: [],
      qmosCommands: [], engineeringSimulation: [],
    },
    map: { ScenarioName: scenario, GeneratedUtc: null, Zones: [zone("SGRT1A"), destination], Routes: [], Destinations: [] },
    state: structuredClone(displayedState),
  }
}

test("capabilities accept only the correction endpoint or POST correction", () => {
  assert.equal(supportsManualCorrection(null), false)
  for (const command of ["/api/tracking/correct", "POST /api/tracking/correct", " post   /api/tracking/correct "]) {
    assert.equal(supportsManualCorrection({ commands: [command] }), true, command)
  }
  for (const command of ["GET /api/tracking/correct", "PUT /api/tracking/correct", "POST /api/tracking/reset", "/api/tracking/correct-extra", "POST /api/tracking/correct extra", ""]) {
    assert.equal(supportsManualCorrection({ commands: [command] }), false, command)
  }
  assert.equal(supportsManualCorrection({ commands: [] }), false)
})

test("destination catalog uses enabled unambiguous API zones including hidden LCH", () => {
  const map = fixture().map
  map.Zones = [
    zone("LAST", { DisplayOrder: null }),
    zone("SGRT1A", { DisplayOrder: 3 }),
    zone("LCH1A", { DisplayOrder: 2 }),
    zone("API_EXTRA", { DisplayOrder: 4 }),
    zone("CCH1A", { IsEnabled: false }),
    zone("SGRT2A"), zone("SGRT2A", { ZoneId: 99, IsEnabled: false }),
    zone(" \t "),
  ]
  const original = structuredClone(map.Zones)
  assert.deepEqual(Array.from(getRepositionZones(map), (entry) => entry.ZoneName), ["LCH1A", "SGRT1A", "API_EXTRA", "LAST"])
  assert.deepEqual(map.Zones, original, "Sorting must not mutate the supplied map")
  assert.deepEqual(Array.from(getRepositionZones(null)), [])
})

test("reported occupancy includes CurrentZone and optional footprint, deduplicated by identity", () => {
  const snapshot = state([
    bundle("B", { CurrentZone: "SGRT2A", OccupiedZones: ["SGRT2A"] }),
    bundle("A", { CurrentZone: "SGRT1A", OccupiedZones: ["SGRT2A"] }),
    bundle("A", { CurrentZone: "SGRT2A" }),
    bundle("IGNORED", { CurrentZone: "SGRT2", OccupiedZones: { zone: "SGRT2A" } }),
  ])
  assert.deepEqual(Array.from(reportedZoneOccupants(snapshot, "SGRT2A")), ["A", "B"])
  assert.deepEqual(Array.from(reportedZoneOccupants(null, "SGRT2A")), [])
})

test("fresh preflight accepts unchanged positions after a long confirmation and unknown source zones", () => {
  const options = fixture()
  // Old source timestamps and an advanced local clock do not invalidate a newly
  // fetched state. The caller is responsible for fetching it after confirmation.
  assert.equal(manualPreflightProblem(options), null)
  options.state.Bundles[0].OccupiedZones.reverse()
  assert.equal(manualPreflightProblem(options), null, "Footprint ordering alone is not movement")
  for (const CurrentZone of [null, "UNMAPPED_SOURCE"]) {
    const unknown = fixture()
    unknown.selected.CurrentZone = CurrentZone
    unknown.state.Bundles[0].CurrentZone = CurrentZone
    assert.equal(manualPreflightProblem(unknown), null)
  }
  const occupied = fixture()
  occupied.destination.Capacity = 0
  occupied.displayedState.Bundles[1].CurrentZone = occupied.destination.ZoneName
  occupied.state = structuredClone(occupied.displayedState)
  assert.equal(manualPreflightProblem(occupied), null, "Reported occupancy/capacity does not invent a backend interlock")
  const removal = fixture()
  removal.action = "remove"
  removal.destination = null
  removal.map.Zones = []
  assert.equal(manualPreflightProblem(removal), null, "Removal has no destination requirement")
})

test("preflight rejects changed service, capability, scenario or selected bundle for either action", () => {
  const cases = [
    ["service down", (o) => { o.service.running = false }, /not running/],
    ["missing capability", (o) => { o.capabilities.commands = [] }, /advertises/],
    ["GET capability only", (o) => { o.capabilities.commands = ["GET /api/tracking/correct"] }, /advertises/],
    ["missing capabilities", (o) => { o.capabilities = null }, /advertises/],
    ["state scenario", (o) => { o.state.ScenarioName = "CHANGED" }, /scenario changed/],
    ["map scenario", (o) => { o.map.ScenarioName = "CHANGED" }, /scenario changed/],
    ["service scenario", (o) => { o.service.scenario = "CHANGED" }, /scenario changed/],
    ["selected scenario", (o) => { o.selected.ScenarioName = "CHANGED" }, /scenario changed/],
    ["current bundle scenario", (o) => { o.state.Bundles[0].ScenarioName = "CHANGED" }, /position changed/],
    ["missing selected", (o) => { o.state.Bundles.shift() }, /missing or ambiguous/],
    ["duplicate selected", (o) => { o.state.Bundles.push(structuredClone(o.state.Bundles[0])) }, /missing or ambiguous/],
    ["moved source", (o) => { o.state.Bundles[0].CurrentZone = "CCH1A" }, /position changed/],
    ["changed footprint", (o) => { o.state.Bundles[0].OccupiedZones.push("SGRT2A") }, /position changed/],
    ["lost footprint", (o) => { delete o.state.Bundles[0].OccupiedZones }, /position changed/],
  ]
  for (const action of ["remove", "reposition"]) {
    for (const [label, change, expected] of cases) {
      const options = fixture()
      options.action = action
      change(options)
      assert.match(manualPreflightProblem(options) ?? "", expected, action + ": " + label)
    }
  }
})

test("reposition preflight rejects changed destination map or reported occupancy", () => {
  const cases = [
    ["missing destination", (o) => { o.destination = null }, /not an enabled/],
    ["missing map zone", (o) => { o.map.Zones.pop() }, /not an enabled/],
    ["disabled zone", (o) => { o.map.Zones[1] = { ...o.destination, IsEnabled: false } }, /not an enabled/],
    ["duplicate zone", (o) => { o.map.Zones.push({ ...o.destination, ZoneId: 99 }) }, /not an enabled/],
    ["changed zone identity", (o) => { o.map.Zones[1] = { ...o.destination, ZoneId: 99 } }, /configuration changed/],
    ["changed capacity", (o) => { o.map.Zones[1] = { ...o.destination, Capacity: 2 } }, /configuration changed/],
    ["changed type", (o) => { o.map.Zones[1] = { ...o.destination, ZoneType: "BUFFER" } }, /configuration changed/],
    ["same zone", (o) => { o.selected.CurrentZone = o.destination.ZoneName; o.state.Bundles[0].CurrentZone = o.destination.ZoneName }, /already in/],
    ["new current occupant", (o) => { o.state.Bundles[1].CurrentZone = o.destination.ZoneName }, /occupancy changed/],
    ["new footprint occupant", (o) => { o.state.Bundles[1].OccupiedZones = [o.destination.ZoneName] }, /occupancy changed/],
    ["departed occupant", (o) => { o.displayedState.Bundles[1].CurrentZone = o.destination.ZoneName }, /occupancy changed/],
  ]
  for (const [label, change, expected] of cases) {
    const options = fixture()
    change(options)
    assert.match(manualPreflightProblem(options) ?? "", expected, label)
  }
})

test("observed reposition requires one exact CurrentZone match; removal requires absence", () => {
  const selected = bundle("SELECTED", { CurrentZone: "SGRT2A" })
  const snapshot = state([selected, bundle("OTHER")])
  assert.equal(manualOutcomeObserved("reposition", "SELECTED", "SGRT2A", snapshot), true)
  assert.equal(manualOutcomeObserved("reposition", "SELECTED", "SGRT2", snapshot), false)
  assert.equal(manualOutcomeObserved("reposition", "SELECTED", "LCH1A", snapshot), false, "OccupiedZones alone cannot prove the requested CurrentZone")
  assert.equal(manualOutcomeObserved("remove", "SELECTED", "", snapshot), false)
  snapshot.Bundles.push(structuredClone(selected))
  assert.equal(manualOutcomeObserved("reposition", "SELECTED", "SGRT2A", snapshot), false, "Duplicate identity is ambiguous")
  snapshot.Bundles = snapshot.Bundles.filter((item) => item.TrackingId !== "SELECTED")
  assert.equal(manualOutcomeObserved("remove", "SELECTED", "", snapshot), true)
  assert.equal(manualOutcomeObserved("reposition", "SELECTED", "SGRT2A", snapshot), false)
})
