// Run: node scripts/test-integrated-tracking.mjs
// Exercises the merged TypeScript client/proxy/validators/helpers against an
// owned ephemeral loopback simulator only. No plant URL or environment file
// is read. This is not evidence of PLC effects or backend FIFO requeue policy.
import assert from "node:assert/strict"
import { test } from "node:test"
import { correctionPath, loadTypeScript, routeRequest, startSimulator } from "./tracking-api-test-helpers.mjs"

const { TrackingApiClient, isApiError } = loadTypeScript("lib/tracking-api/client.ts")
const { isTrackingStateDto } = loadTypeScript("lib/tracking-api/validation.ts")
const { getFifoMembership, orderBundlesByLogicalFifo } = loadTypeScript("lib/tracking-fifo.ts")
const { groupTrackingBundlesByZone } = loadTypeScript("lib/tracking-zone-layout.ts")
const { getRepositionZones, manualPreflightProblem, manualOutcomeObserved } = loadTypeScript("lib/tracking-api/manual-position.ts")
const ids = (bundles) => Array.from(bundles, (bundle) => bundle.TrackingId)

function selected(snapshot, trackingId) {
  const matches = snapshot.Bundles.filter((bundle) => bundle.TrackingId === trackingId)
  assert.equal(matches.length, 1, "The selected identity must be unique: " + trackingId)
  return matches[0]
}

function verifyFifo(snapshot, expectedIds) {
  assert.equal(isTrackingStateDto(snapshot), true, "The merged DTO must validate the full live snapshot")
  const inZone = groupTrackingBundlesByZone(snapshot.Bundles).byZone.CCH2A
  const receivedIds = ids(inZone)
  const ordered = orderBundlesByLogicalFifo(inZone)
  assert.deepEqual(ids(ordered.bundles), expectedIds)
  assert.deepEqual(ids(inZone), receivedIds, "Sorting must not mutate the API's receive order")
  assert.equal(ordered.hasFifoMembers, true)
  assert.equal(ordered.hasUnorderedMembers, true, "Legacy and explicit-null entries remain compatible")
  assert.equal(ordered.hasDuplicateSequences, false)
  for (const [index, bundle] of inZone.entries()) {
    if (!getFifoMembership(bundle)) assert.equal(ordered.bundles[index], bundle, "Unordered entries keep their current snapshot slot")
  }
  const sequences = Array.from(ordered.bundles.filter(getFifoMembership), (bundle) => bundle.QueueSequence)
  assert.deepEqual(sequences, [...sequences].sort((left, right) => left - right))
  return ordered
}

test("FIFO, REMOVE, reposition and legacy correction coexist through the actual client/proxy", { timeout: 30000 }, async () => {
  const simulator = await startSimulator({ fifoDemo: true })
  try {
    const forwarded = []
    const proxy = loadTypeScript("app/tracking-api/[...path]/route.ts", {
      env: { TRACKING_API_PROXY_TARGET: simulator.baseUrl },
      fetchImpl: (url, options = {}) => {
        forwarded.push({
          method: options.method ?? "GET", path: new URL(url).pathname,
          body: options.body ? JSON.parse(options.body) : null,
        })
        return simulator.fetch(url, options)
      },
    })
    const client = new TrackingApiClient({
      baseUrl: "http://hmi.invalid/tracking-api",
      fetchImpl: (url, options = {}) => {
        const parsed = new URL(url)
        assert.equal(parsed.origin, "http://hmi.invalid", "The fake HMI origin is handled in memory, never fetched")
        assert.ok(parsed.pathname.startsWith("/tracking-api/"))
        const handler = proxy[options.method ?? "GET"]
        assert.equal(typeof handler, "function")
        return handler(new Request(url, options), {
          params: Promise.resolve({ path: parsed.pathname.slice("/tracking-api/".length).split("/") }),
        })
      },
    })
    const service = await client.getStatus()
    assert.equal(service.service, "MaterialTrackingServiceSimulator")
    assert.equal(service.scenario, "LOCAL_HMI_SIMULATOR")
    assert.equal(service.running, true)
    const capabilities = await client.getCapabilities()
    const map = await client.getMap()
    const initial = await client.getState()
    assert.equal(map.ScenarioName, service.scenario)
    assert.equal(initial.ScenarioName, service.scenario)
    assert.equal(initial.Bundles.length, 18, "Both BUFFER_DEMO and FIFO_DEMO must be active")
    assert.equal(map.Zones.find((zone) => zone.ZoneName === "CCH2A").Capacity, 8)
    assert.equal(groupTrackingBundlesByZone(initial.Bundles).byZone.CCH2B.length, 6)
    verifyFifo(initial, ["SIM-FIFO-5", "SIM-FIFO-2", "SIM-FIFO-3", "SIM-FIFO-7", "SIM-FIFO-1", "SIM-FIFO-6", "SIM-FIFO-8", "SIM-FIFO-4"])
    assert.equal(selected(initial, "SIM-FIFO-3").QueueSequence, null)
    assert.equal(Object.hasOwn(selected(initial, "SIM-FIFO-6"), "QueueSequence"), false)

    const removed = selected(initial, "SIM-FIFO-2")
    const removal = { TrackingId: removed.TrackingId, Operation: "REMOVE", OperatorId: "combined-qa", Reason: "Remove one simulator FIFO member" }
    assert.equal(manualPreflightProblem({
      action: "remove", selected: removed, displayedState: initial, destination: null,
      service, capabilities, map, state: await client.getState(),
    }), null)
    assert.equal(manualOutcomeObserved("remove", removed.TrackingId, "", initial), false)
    const removalAck = await client.removeBundle({
      ...removal, TrackingId: " " + removal.TrackingId + " ", OperatorId: " combined-qa ",
      LogicalBufferName: removed.LogicalBufferName, QueueSequence: removed.QueueSequence,
      BundleId: "not-the-command-identity", CurrentZone: "SGRT2B",
    })
    assert.equal(removalAck.accepted, true)
    assert.equal(removalAck.trackingId, removed.TrackingId)
    const afterRemove = await client.getState()
    assert.equal(manualOutcomeObserved("remove", removed.TrackingId, "", afterRemove), true)
    assert.deepEqual(afterRemove.Bundles, initial.Bundles.filter((bundle) => bundle.TrackingId !== removed.TrackingId))
    verifyFifo(afterRemove, ["SIM-FIFO-5", "SIM-FIFO-3", "SIM-FIFO-7", "SIM-FIFO-1", "SIM-FIFO-6", "SIM-FIFO-8", "SIM-FIFO-4"])
    await assert.rejects(client.getBundle(removed.TrackingId), (error) => isApiError(error) && error.status === 404)
    await assert.rejects(client.removeBundle(removal), (error) => isApiError(error) && error.status === 404)
    assert.deepEqual((await client.getState()).Bundles, afterRemove.Bundles, "Duplicate removal must preserve every survivor")

    const moving = selected(afterRemove, "SIM-FIFO-1")
    const destination = getRepositionZones(map).find((zone) => zone.ZoneName === "SGRT2A")
    assert.ok(destination)
    const reposition = { TrackingId: moving.TrackingId, OperatorId: "combined-qa", Reason: "Correct one simulator FIFO member position", CurrentZone: destination.ZoneName }
    assert.equal(manualPreflightProblem({
      action: "reposition", selected: moving, displayedState: afterRemove, destination,
      service, capabilities, map, state: await client.getState(),
    }), null)
    assert.equal(manualOutcomeObserved("reposition", moving.TrackingId, destination.ZoneName, afterRemove), false)
    const repositionAck = await client.repositionBundle({
      ...reposition, CurrentZone: " SGRT2A ", LogicalBufferName: "discard-this-extra",
      QueueSequence: -1, BundleId: "not-the-command-identity",
    })
    assert.equal(repositionAck.accepted, true)
    assert.equal(repositionAck.trackingId, moving.TrackingId)
    const afterMove = await client.getState()
    const moved = await client.getBundle(moving.TrackingId)
    assert.equal(manualOutcomeObserved("reposition", moving.TrackingId, destination.ZoneName, afterMove), true)
    assert.equal(moved.CurrentZone, destination.ZoneName)
    assert.deepEqual({ ...moved, CurrentZone: moving.CurrentZone, LastUpdateUtc: moving.LastUpdateUtc }, moving)
    assert.deepEqual(afterMove.Bundles.filter((bundle) => bundle.TrackingId !== moving.TrackingId), afterRemove.Bundles.filter((bundle) => bundle.TrackingId !== moving.TrackingId))
    // The simulator intentionally does not emulate backend requeue rules.
    // Retained fixture metadata must not move the bundle back to its old
    // physical zone or be injected into a manual request by the frontend.
    assert.equal(moved.LogicalBufferName, "CCH2A")
    assert.equal(moved.QueueSequence, moving.QueueSequence)
    assert.deepEqual(ids(groupTrackingBundlesByZone(afterMove.Bundles).byZone.SGRT2A), [moving.TrackingId])
    verifyFifo(afterMove, ["SIM-FIFO-3", "SIM-FIFO-5", "SIM-FIFO-7", "SIM-FIFO-6", "SIM-FIFO-8", "SIM-FIFO-4"])
    await assert.rejects(client.repositionBundle(reposition), (error) => isApiError(error) && error.status === 409)
    assert.deepEqual((await client.getState()).Bundles, afterMove.Bundles)

    const legacy = { TrackingId: moving.TrackingId, OperatorId: "combined-qa", Reason: "Legacy correction after reposition", MillOrder1: "SIM-MO-COMBINED" }
    await client.correctBundle(legacy)
    const corrected = await client.getBundle(moving.TrackingId)
    assert.equal(corrected.MillOrder1, legacy.MillOrder1)
    assert.equal(corrected.CurrentZone, destination.ZoneName)
    assert.equal(corrected.LogicalBufferName, moving.LogicalBufferName)
    assert.equal(corrected.QueueSequence, moving.QueueSequence)

    const movedRemoval = { TrackingId: moving.TrackingId, Operation: "REMOVE", OperatorId: "combined-qa", Reason: "Remove corrected simulator member" }
    await client.removeBundle(movedRemoval)
    const finalState = await client.getState()
    assert.deepEqual(finalState.Bundles, initial.Bundles.filter((bundle) => ![removed.TrackingId, moving.TrackingId].includes(bundle.TrackingId)))
    assert.equal(groupTrackingBundlesByZone(finalState.Bundles).byZone.SGRT2A.length, 0)
    verifyFifo(finalState, ["SIM-FIFO-3", "SIM-FIFO-5", "SIM-FIFO-7", "SIM-FIFO-6", "SIM-FIFO-8", "SIM-FIFO-4"])
    await assert.rejects(client.repositionBundle(reposition), (error) => isApiError(error) && error.status === 404)

    const commands = forwarded.filter((request) => request.method === "POST")
    assert.deepEqual(commands.map((request) => request.body), [removal, removal, reposition, reposition, legacy, movedRemoval, reposition])
    assert.ok(commands.every((request) => request.path === correctionPath))
    assert.ok(forwarded.every((request) => ["GET", "POST"].includes(request.method)))
    assert.ok(!forwarded.some((request) => request.path.endsWith("/reset")))
    const forwardedCount = forwarded.length
    assert.equal((await routeRequest(proxy.POST, removal, { path: "/api/tracking/reset" })).status, 404)
    assert.equal((await routeRequest(proxy.POST, { ...reposition, MillOrder1: "mixed" })).status, 400)
    assert.equal(forwarded.length, forwardedCount, "Rejected routes/payloads must not reach the simulator")
    assert.deepEqual((await client.getState()).Bundles, finalState.Bundles)
  } finally {
    await simulator.close()
  }
})

test("simulator helper isolates inherited flags while preserving explicit FIFO/disabled-zone options", { timeout: 30000 }, async () => {
  const names = ["TRACKING_SIMULATOR_FIFO_DEMO", "TRACKING_SIMULATOR_DISABLED_ZONES"]
  const previous = new Map(names.map((name) => [name, process.env[name]]))
  process.env.TRACKING_SIMULATOR_FIFO_DEMO = "true"
  process.env.TRACKING_SIMULATOR_DISABLED_ZONES = "SGRT2A"
  try {
    const legacy = await startSimulator()
    try {
      const client = new TrackingApiClient({ baseUrl: legacy.baseUrl, fetchImpl: legacy.fetch })
      assert.equal((await client.getStatus()).service, "MaterialTrackingServiceSimulator")
      const snapshot = await client.getState()
      assert.equal(snapshot.Bundles.length, 10, "Default manual/UI tests must not inherit the eight FIFO fixtures")
      assert.ok(snapshot.Bundles.every((bundle) => !Object.hasOwn(bundle, "QueueSequence")))
      assert.equal((await client.getMap()).Zones.find((zone) => zone.ZoneName === "SGRT2A").IsEnabled, true)
    } finally { await legacy.close() }

    const explicit = await startSimulator({ fifoDemo: true, disabledZones: "LCH2A" })
    try {
      const client = new TrackingApiClient({ baseUrl: explicit.baseUrl, fetchImpl: explicit.fetch })
      assert.equal((await client.getState()).Bundles.length, 18)
      const map = await client.getMap()
      assert.equal(map.Zones.find((zone) => zone.ZoneName === "SGRT2A").IsEnabled, true)
      assert.equal(map.Zones.find((zone) => zone.ZoneName === "LCH2A").IsEnabled, false)
    } finally { await explicit.close() }
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
