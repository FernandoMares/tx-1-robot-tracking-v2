// Run with: node scripts/test-manual-reposition.mjs
import assert from "node:assert/strict"
import { test } from "node:test"
import { correctionPath, loadTypeScript, routeRequest, startSimulator } from "./tracking-api-test-helpers.mjs"

const validation = loadTypeScript("lib/tracking-api/validation.ts")
const { TrackingApiClient, isApiError } = loadTypeScript("lib/tracking-api/client.ts")
const reposition = {
  TrackingId: "SIM-TRACK-HOLD", OperatorId: "regression-operator",
  Reason: "Correct simulator position", CurrentZone: "SGRT2A",
}
const acknowledgement = {
  accepted: true, eventId: 123, eventType: "MANUAL_CORRECTION", trackingId: reposition.TrackingId,
}
function invalidRequests() {
  const cases = [null, [], "SGRT2A", { ...reposition, MillOrder1: "MO-123" }]
  for (const Operation of ["REMOVE", "RETIRE", "REPOSITION", "", null, undefined]) {
    cases.push({ ...reposition, Operation })
  }
  for (const field of Object.keys(reposition)) {
    const missing = { ...reposition }
    delete missing[field]
    cases.push(missing, { ...reposition, [field]: " \t " }, { ...reposition, [field]: 123 })
  }
  return cases
}

test("reposition validator requires four fields and excludes operation/order edits", () => {
  assert.equal(validation.isTrackingRepositionRequestDto(reposition), true)
  assert.equal(validation.isTrackingRepositionRequestDto({ ...reposition, CurrentZone: " SGRT2A " }), true)
  for (const body of invalidRequests()) {
    assert.equal(validation.isTrackingRepositionRequestDto(body), false, JSON.stringify(body))
  }
})

test("reposition client sends only trimmed fields without Operation and validates acknowledgement", async () => {
  const calls = []
  let response = acknowledgement
  const client = new TrackingApiClient({
    baseUrl: "http://hmi.invalid",
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options, body: JSON.parse(options.body) })
      return Response.json(response, { status: 202 })
    },
  })
  const input = Object.freeze({
    TrackingId: " SIM-TRACK-HOLD ", OperatorId: " regression-operator ",
    Reason: " Correct simulator position ", CurrentZone: " SGRT2A ",
    BundleId: "wrong display ID", TagNumber: 123, Destination: "discard",
  })
  assert.deepEqual(await client.repositionBundle(input), acknowledgement)
  assert.equal(calls[0].url, "http://hmi.invalid" + correctionPath)
  assert.equal(calls[0].method, "POST")
  assert.equal(calls[0].headers.get("Content-Type"), "application/json")
  assert.deepEqual(calls[0].body, reposition)
  assert.equal(input.CurrentZone, " SGRT2A ")
  for (const body of invalidRequests()) assert.throws(() => client.repositionBundle(body))
  assert.equal(calls.length, 1)
  for (const invalid of [{}, { ...acknowledgement, eventId: 0 }, { ...acknowledgement, accepted: "true" }]) {
    response = invalid
    await assert.rejects(client.repositionBundle(reposition), (error) => isApiError(error) && error.kind === "invalid-payload")
  }
})

test("proxy routes explicit reposition, legacy order edits and removal unambiguously", async () => {
  const calls = []
  const proxy = loadTypeScript("app/tracking-api/[...path]/route.ts", {
    env: { TRACKING_API_PROXY_TARGET: "http://127.0.0.1:1" },
    fetchImpl: async (url, options) => {
      calls.push({ path: new URL(url).pathname, ...options, body: JSON.parse(options.body) })
      return Response.json(acknowledgement, { status: 202 })
    },
  })
  assert.equal((await routeRequest(proxy.POST, { ...reposition, CurrentZone: " SGRT2A ", TagNumber: "discard" })).status, 202)
  assert.deepEqual(calls[0].body, reposition)
  const { CurrentZone, ...identity } = reposition
  const legacy = { ...identity, MillOrder1: "MO-123" }
  assert.equal((await routeRequest(proxy.POST, legacy)).status, 202)
  assert.deepEqual(calls[1].body, legacy)
  const removal = { ...identity, Operation: "REMOVE" }
  assert.equal((await routeRequest(proxy.POST, { ...removal, CurrentZone })).status, 202)
  assert.deepEqual(calls[2].body, removal, "Valid REMOVE retains its existing allowlist priority")
  // JSON cannot represent an explicitly undefined property; validate that case
  // in the in-memory validator/client tests above instead of on the wire.
  const invalid = invalidRequests().filter((body) => !body || body.Operation !== "REMOVE")
  for (const body of invalid.filter((body) => !body || !Object.hasOwn(body, "Operation") || body.Operation !== undefined)) {
    assert.equal((await routeRequest(proxy.POST, body)).status, 400, JSON.stringify(body))
  }
  assert.equal((await routeRequest(proxy.POST, { ...legacy, CurrentZone: null })).status, 400)
  assert.equal((await routeRequest(proxy.POST, reposition, { raw: "{" })).status, 400)
  assert.equal((await routeRequest(proxy.POST, reposition, { contentType: "text/plain" })).status, 415)
  assert.equal((await routeRequest(proxy.POST, reposition, { path: "/api/tracking/reset" })).status, 403)
  assert.equal(calls.length, 3, "Rejected requests must not reach the backend")
  assert.ok(calls.every(({ path }) => path === correctionPath))
})

test("simulator repositions one identity, rejects invalid targets and preserves legacy/removal", { timeout: 20000 }, async () => {
  const simulator = await startSimulator({ disabledZones: "LCH2A" })
  try {
    const direct = new TrackingApiClient({ baseUrl: simulator.baseUrl, fetchImpl: simulator.fetch })
    const initial = await direct.getState()
    const selected = initial.Bundles.find((bundle) => bundle.TrackingId === reposition.TrackingId)
    const map = await direct.getMap()
    assert.equal(map.Zones.find((zone) => zone.ZoneName === "LCH2A").IsEnabled, false)
    const post = (body) => simulator.fetch(simulator.baseUrl + correctionPath, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    for (const CurrentZone of ["UNKNOWN", "LCH2A", "sgrt2a", null, " "]) {
      assert.equal((await post({ ...reposition, CurrentZone })).status, 400)
    }
    assert.equal((await post({ ...reposition, CurrentZone: selected.CurrentZone })).status, 409)
    assert.equal((await post({ ...reposition, TrackingId: "UNKNOWN" })).status, 404)
    assert.equal((await post({ ...reposition, TrackingId: selected.BundleId })).status, 404, "Displayed ID cannot replace TrackingId")
    assert.equal((await post({ ...reposition, MillOrder1: "MO-123" })).status, 400)
    assert.equal((await post({ ...reposition, Operation: "REPOSITION" })).status, 400)
    assert.equal((await post({ ...reposition, Operation: null })).status, 400)
    assert.deepEqual((await direct.getState()).Bundles, initial.Bundles, "Rejected commands must not mutate state")

    const forwarded = []
    const proxy = loadTypeScript("app/tracking-api/[...path]/route.ts", {
      env: { TRACKING_API_PROXY_TARGET: simulator.baseUrl },
      fetchImpl: (url, options) => {
        forwarded.push({ path: new URL(url).pathname, body: JSON.parse(options.body) })
        return simulator.fetch(url, options)
      },
    })
    const client = new TrackingApiClient({
      baseUrl: "http://hmi.invalid",
      fetchImpl: (url, options) => proxy.POST(new Request(url, options), {
        params: Promise.resolve({ path: new URL(url).pathname.slice(1).split("/") }),
      }),
    })
    const accepted = await client.repositionBundle(reposition)
    assert.equal(accepted.accepted, true)
    assert.equal(accepted.trackingId, selected.TrackingId)
    assert.deepEqual(forwarded, [{ path: correctionPath, body: reposition }])
    const after = await direct.getState()
    const moved = await direct.getBundle(selected.TrackingId)
    assert.equal(moved.CurrentZone, reposition.CurrentZone)
    assert.deepEqual({ ...moved, CurrentZone: selected.CurrentZone, LastUpdateUtc: selected.LastUpdateUtc }, selected)
    assert.deepEqual(after.Bundles.filter((bundle) => bundle.TrackingId !== selected.TrackingId), initial.Bundles.filter((bundle) => bundle.TrackingId !== selected.TrackingId))
    await assert.rejects(client.repositionBundle(reposition), (error) => isApiError(error) && error.status === 409)
    assert.deepEqual((await direct.getState()).Bundles, after.Bundles, "Duplicate reposition does not mutate state")

    // Occupied destinations are deliberately accepted by this simulator only;
    // real backend capacity and PLC interlocks remain outside this test.
    const occupied = { ...reposition, CurrentZone: "SGRT2B" }
    await client.repositionBundle(occupied)
    assert.deepEqual(await direct.getBundle("SIM-TRACK-WARNING"), initial.Bundles.find((bundle) => bundle.TrackingId === "SIM-TRACK-WARNING"))
    const { CurrentZone, ...identity } = reposition
    await client.correctBundle({ ...identity, MillOrder1: "SIM-MO-UPDATED" })
    assert.equal((await direct.getBundle(selected.TrackingId)).CurrentZone, occupied.CurrentZone)
    await client.repositionBundle(reposition)
    assert.equal((await direct.getBundle(selected.TrackingId)).MillOrder1, "SIM-MO-UPDATED")
    await client.removeBundle({ ...identity, Operation: "REMOVE" })
    await assert.rejects(client.repositionBundle(reposition), (error) => isApiError(error) && error.status === 404)
    assert.deepEqual((await direct.getState()).Bundles, initial.Bundles.filter((bundle) => bundle.TrackingId !== selected.TrackingId))
    assert.ok(forwarded.every(({ path }) => path === correctionPath), "No global reset is used")
  } finally {
    await simulator.close()
  }
})
