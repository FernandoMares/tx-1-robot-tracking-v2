// Run: node --test scripts/test-qmos-lpn-mode.mjs
// Actual validators/client/proxy plus an owned loopback simulator. No plant I/O.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { dirname, resolve } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { loadTypeScript, startSimulator } from "./tracking-api-test-helpers.mjs"

const path = "/api/tracking/qmos-lpn-mode"
const current = { Enabled: true, UpdatedUtc: null, OperatorId: null, Reason: null }
const update = { Enabled: false, OperatorId: "qa-operator", Reason: "Commissioning without QMOS LPN" }
const updated = {
  updated: true, enabled: false, updatedUtc: "2026-10-16T12:00:00.000Z",
  appliesTo: "bundles created after this change",
}
const validation = loadTypeScript("lib/tracking-api/validation.ts")
const { TrackingApiClient, isApiError } = loadTypeScript("lib/tracking-api/client.ts")

function invalidUpdates() {
  const cases = [null, [], {}, false, "false"]
  for (const field of ["Enabled", "OperatorId", "Reason"]) {
    const missing = { ...update }
    delete missing[field]
    cases.push(missing, { ...update, [field]: null }, { ...update, [field]: undefined })
  }
  for (const Enabled of ["false", "true", 0, 1, {}, []]) cases.push({ ...update, Enabled })
  for (const field of ["OperatorId", "Reason"]) {
    for (const value of ["", " \t\r\n ", false, 1, {}, []]) cases.push({ ...update, [field]: value })
  }
  cases.push({ ...update, OperatorId: "a".repeat(101) }, { ...update, Reason: "a".repeat(501) })
  return cases
}

function proxy(fetchImpl, target = "http://backend.invalid:8085") {
  return loadTypeScript("app/tracking-api/[...path]/route.ts", {
    fetchImpl, env: { TRACKING_API_PROXY_TARGET: target },
  })
}

function request(route, { method = "PUT", body = update, endpoint = path, contentType = "application/json", raw } = {}) {
  return route[method](new Request("http://hmi.invalid/tracking-api" + endpoint, {
    method, headers: { "Content-Type": contentType },
    body: method === "GET" ? undefined : raw ?? JSON.stringify(body),
  }), { params: Promise.resolve({ path: endpoint.slice(1).split("/") }) })
}

test("LPN mode requires an explicit boolean and real nonblank audit fields within documented limits", () => {
  for (const Enabled of [true, false]) {
    assert.equal(validation.isQmosLpnModeUpdateRequestDto({ ...update, Enabled }), true)
    assert.equal(validation.isQmosLpnModeUpdateRequestDto({
      Enabled, OperatorId: "a".repeat(100), Reason: "a".repeat(500),
    }), true)
  }
  for (const input of invalidUpdates()) {
    assert.equal(validation.isQmosLpnModeUpdateRequestDto(input), false, JSON.stringify(input))
  }
})

test("LPN read/update DTOs validate field types and preserve false without consulting adapter status", () => {
  for (const Enabled of [true, false]) {
    assert.equal(validation.isQmosLpnModeDto({ ...current, Enabled }), true)
    assert.equal(validation.isQmosLpnModeDto({
      Enabled, UpdatedUtc: "/Date(1792152000000)/", OperatorId: "op", Reason: "reason",
    }), true)
  }
  for (const input of [null, [], {}, { ...current, Enabled: null }, { ...current, Enabled: "false" },
    { ...current, UpdatedUtc: 1 }, { ...current, OperatorId: 1 }, { ...current, Reason: false },
    { enabled: false, connected: true }, { enabled: true, connected: false }]) {
    assert.equal(validation.isQmosLpnModeDto(input), false, JSON.stringify(input))
  }
  for (const enabled of [true, false]) {
    assert.equal(validation.isQmosLpnModeUpdateResponseDto({ ...updated, enabled }), true)
  }
  for (const input of [null, [], {}, { ...updated, updated: "true" }, { ...updated, enabled: "false" },
    { ...updated, updatedUtc: null }, { ...updated, appliesTo: null }]) {
    assert.equal(validation.isQmosLpnModeUpdateResponseDto(input), false, JSON.stringify(input))
  }
})

test("new bundle fields remain additive for old snapshots and reject invalid present types", () => {
  const legacy = {
    ...Object.fromEntries([
      "BundleId", "SourceArea", "CurrentZone", "RouteName", "BundleType", "Destination", "MillOrder1",
      "MillOrder2", "MillOrder3", "MillOrder4", "MillOrder5", "Disposition", "HoldCode", "Status",
      "CorrelationStatus", "CreatedUtc", "LastUpdateUtc", "PrinterId", "Weight", "L2Id", "TagNumber",
      "PieceCount1", "PieceCount2", "PieceCount3", "PieceCount4", "PieceCount5", "TagCopy",
    ].map((field) => [field, null])),
    ScenarioName: "DTO_TEST", TrackingId: "TRACK-1",
  }
  assert.equal(validation.isTrackedBundleDto(legacy), true)
  assert.equal(validation.isTrackedBundleDto({ ...legacy,
    QmosLpnEnabled: false, IdentifierSource: "INTERNAL", DisplayId: "TRACK-1", CanPrint: false,
  }), true)
  assert.equal(validation.isTrackedBundleDto({ ...legacy,
    QmosLpnEnabled: true, IdentifierSource: "QMOS", DisplayId: "101644628", CanPrint: true,
  }), true)
  for (const [field, values] of Object.entries({
    QmosLpnEnabled: ["false", 0, [], {}], CanPrint: ["true", 1, [], {}],
    IdentifierSource: [1, false, [], {}], DisplayId: [1, false, [], {}],
  })) {
    for (const value of values) {
      assert.equal(validation.isTrackedBundleDto({ ...legacy, [field]: value }), false, field + ": " + JSON.stringify(value))
    }
  }
})

test("client reads the dedicated selector and sends a trimmed allowlisted PUT including boolean false", async () => {
  const calls = []
  const client = new TrackingApiClient({
    baseUrl: "/tracking-api/",
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options })
      return Response.json(options.method === "GET" ? current : updated)
    },
  })
  assert.deepEqual(await client.getQmosLpnMode(), current)
  const original = Object.freeze({ ...update, OperatorId: " qa-operator ",
    Reason: " Commissioning without QMOS LPN ", QmosEnabled: true, BundleId: "discard" })
  assert.deepEqual(await client.updateQmosLpnMode(original), updated)
  assert.equal(calls[0].url, "/tracking-api" + path)
  assert.equal(calls[0].method, "GET")
  assert.equal(calls[0].body, undefined)
  assert.equal(calls[1].url, "/tracking-api" + path)
  assert.equal(calls[1].method, "PUT")
  assert.deepEqual(JSON.parse(calls[1].body), update)
  assert.equal(calls[1].headers.get("Content-Type"), "application/json")
  assert.equal(calls[1].cache, "no-store")
  assert.equal(calls[1].credentials, "omit")
  assert.equal(calls[1].redirect, "error")
  assert.equal(original.OperatorId, " qa-operator ")
  for (const input of invalidUpdates()) assert.throws(() => client.updateQmosLpnMode(input))
  assert.equal(calls.length, 2, "Invalid requests do not reach transport")
})

test("only HTTP 200 with a valid response confirms update; failures never retry the PUT", async () => {
  for (const fixture of [
    { status: 202, body: updated, kind: "invalid-payload" },
    { status: 201, body: updated, kind: "invalid-payload" },
    { status: 200, body: {}, kind: "invalid-payload" },
    { status: 400, body: { error: "OperatorId required" }, kind: "http" },
    { status: 500, body: { error: "Persistence failed" }, kind: "http" },
    { status: 404, body: { error: "Unknown setting" }, kind: "http" },
    { network: true, kind: "network", status: null },
  ]) {
    let calls = 0
    const client = new TrackingApiClient({ baseUrl: "http://hmi.invalid", fetchImpl: async () => {
      calls += 1
      if (fixture.network) throw new Error("Response lost after persistence")
      return Response.json(fixture.body, { status: fixture.status })
    } })
    await assert.rejects(client.updateQmosLpnMode(update), (error) =>
      isApiError(error) && error.kind === fixture.kind && error.status === fixture.status)
    assert.equal(calls, 1, JSON.stringify(fixture))
  }
  let calls = 0
  const timeoutClient = new TrackingApiClient({
    baseUrl: "http://hmi.invalid", timeoutMs: 10,
    fetchImpl: (_url, { signal }) => {
      calls += 1
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Timeout")), { once: true }))
    },
  })
  await assert.rejects(timeoutClient.updateQmosLpnMode(update), (error) => isApiError(error) && error.kind === "timeout")
  assert.equal(calls, 1)
})

test("proxy GET/PUT allowlist sanitizes the new selector without opening QMOS or unrelated writes", async () => {
  const calls = []
  const route = proxy(async (url, options) => {
    calls.push({ url: String(url), ...options })
    return Response.json(options.method === "GET" ? current : updated)
  }, "http://backend.invalid:8085/prefix/")
  assert.equal((await request(route, { method: "GET" })).status, 200)
  const response = await request(route, { body: { ...update,
    OperatorId: " qa-operator ", Reason: " Commissioning without QMOS LPN ",
    QmosEnabled: false, BundleId: "discard", CanPrint: true,
  } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), updated)
  assert.equal(response.headers.get("Cache-Control"), "no-store")
  assert.equal(calls[1].url, "http://backend.invalid:8085/prefix" + path)
  assert.equal(calls[1].method, "PUT")
  assert.deepEqual(JSON.parse(calls[1].body), update)
  assert.equal(calls[1].redirect, "error")
  for (const input of invalidUpdates()) assert.equal((await request(route, { body: input })).status, 400, JSON.stringify(input))
  assert.equal((await request(route, { raw: "{" })).status, 400)
  assert.equal((await request(route, { contentType: "text/plain" })).status, 415)
  for (const endpoint of [path + "/all", path + "-extra", "/api/qmos/lpn-mode", "/api/qmos/status", "/api/tracking/state"]) {
    assert.equal((await request(route, { endpoint })).status, 404)
  }
  assert.equal((await request(route, { method: "POST" })).status, 404)
  assert.equal(calls.length, 2, "Rejected routes/bodies must not reach backend")
})

test("client-proxy update preserves validation/persistence errors and response loss without retransmission", async () => {
  for (const outcome of [400, 500, "lost"]) {
    let forwarded = 0
    let clientCalls = 0
    const route = proxy(async (_url, options) => {
      forwarded += 1
      assert.deepEqual(JSON.parse(options.body), update)
      if (outcome === "lost") throw new Error("Response lost after write")
      return Response.json({ error: outcome === 400 ? "Validation" : "Persistence failed" }, { status: outcome })
    })
    const client = new TrackingApiClient({ baseUrl: "http://hmi.invalid/tracking-api", fetchImpl: (url, options) => {
      clientCalls += 1
      return route.PUT(new Request(url, options), { params: Promise.resolve({ path: path.slice(1).split("/") }) })
    } })
    await assert.rejects(client.updateQmosLpnMode(update), (error) =>
      isApiError(error) && error.status === (outcome === "lost" ? 502 : outcome))
    assert.equal(clientCalls, 1)
    assert.equal(forwarded, 1)
  }
})

test("owned simulator changes the global selector while preserving existing bundle policy and adapter state", { timeout: 20000 }, async () => {
  const simulator = await startSimulator()
  try {
    const client = new TrackingApiClient({ baseUrl: simulator.baseUrl, fetchImpl: simulator.fetch })
    const initialMode = await client.getQmosLpnMode()
    const initialState = await client.getState()
    const initialAdapter = await client.getQmosStatus()
    assert.equal(initialMode.Enabled, true)
    const responses = []
    for (const Enabled of [false, true]) {
      responses.push(await client.updateQmosLpnMode({ ...update, Enabled }))
      assert.equal((await client.getQmosLpnMode()).Enabled, Enabled)
      assert.deepEqual((await client.getState()).Bundles, initialState.Bundles,
        "Changing selection must not reinterpret already-created bundles")
      assert.deepEqual(await client.getQmosStatus(), initialAdapter,
        "Global selector must not be inferred from or switch the QMOS adapter")
    }
    assert.deepEqual(responses.map((entry) => entry.enabled), [false, true])
    for (const body of invalidUpdates()) {
      const response = await simulator.fetch(simulator.baseUrl + path, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      assert.equal(response.status, 400, JSON.stringify(body))
    }
    assert.equal((await client.getQmosLpnMode()).Enabled, true)
    assert.deepEqual((await client.getState()).Bundles, initialState.Bundles)
  } finally {
    await simulator.close()
  }
})

async function startFastSimulator() {
  const reservation = createServer()
  await new Promise((done, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", done) })
  const port = reservation.address().port
  await new Promise((done) => reservation.close(done))
  const baseUrl = "http://127.0.0.1:" + port
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const child = spawn(process.execPath, [resolve(root, "scripts/tracking-api-simulator.mjs")], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TRACKING_SIMULATOR_HOST: "127.0.0.1", TRACKING_SIMULATOR_PORT: String(port),
      TRACKING_SIMULATOR_STEP_MS: "500", TRACKING_SIMULATOR_BUFFER_DEMO: "true",
      TRACKING_SIMULATOR_QMOS_CONNECTED: "true", TRACKING_SIMULATOR_OPC_CONNECTED: "true",
      TRACKING_SIMULATOR_QMOS_LPN_ENABLED: "true", TRACKING_SIMULATOR_LOG_REQUESTS: "false" },
  })
  const kill = () => { if (child.exitCode === null && child.signalCode === null) child.kill() }
  process.once("exit", kill)
  const exited = new Promise((done) => child.once("exit", done))
  let output = ""
  let timer
  try {
    await new Promise((done, reject) => {
      timer = setTimeout(() => reject(new Error("Owned simulator startup timed out: " + output)), 10000)
      child.once("error", reject)
      child.once("exit", (code) => reject(new Error("Owned simulator exited " + code + ": " + output)))
      child.stderr.on("data", (chunk) => { output += chunk })
      child.stdout.on("data", (chunk) => { output += chunk; if (output.includes("Tracking API simulator running at " + baseUrl)) done() })
    })
  } catch (error) {
    kill()
    process.removeListener("exit", kill)
    throw error
  } finally { clearTimeout(timer) }
  return {
    baseUrl,
    async fetch(url, options = {}) {
      assert.equal(new URL(url).origin, baseUrl)
      assert.equal(child.exitCode, null)
      return fetch(url, { ...options, redirect: "error", signal: options.signal ?? AbortSignal.timeout(5000) })
    },
    async close() {
      kill()
      let stopTimer
      try {
        await Promise.race([exited, new Promise((_, reject) => { stopTimer = setTimeout(() => reject(new Error("Owned simulator did not exit")), 5000) })])
      } finally { clearTimeout(stopTimer); process.removeListener("exit", kill) }
    },
  }
}

test("future OFF creation remains INTERNAL after return ON while prior ON bundles retain identity and manual tracking actions", { timeout: 20000 }, async () => {
  const simulator = await startFastSimulator()
  try {
    const client = new TrackingApiClient({ baseUrl: simulator.baseUrl, fetchImpl: simulator.fetch })
    const initial = await client.getState()
    const prior = initial.Bundles.find((bundle) => bundle.TrackingId === "SIM-TRACK-HOLD")
    assert.equal(prior.QmosLpnEnabled, true)
    assert.equal(prior.IdentifierSource, "QMOS")
    assert.equal(prior.CanPrint, true)
    await client.updateQmosLpnMode(update)
    let internal
    const deadline = Date.now() + 8000
    while (!internal) {
      const state = await client.getState()
      internal = state.Bundles.find((bundle) => bundle.TrackingId === "SIM-TRACK-000002")
      if (Date.now() > deadline) throw new Error("Future OFF cycle did not become available")
      if (!internal) await new Promise((done) => setTimeout(done, 100))
    }
    assert.equal(internal.QmosLpnEnabled, false)
    assert.equal(internal.IdentifierSource, "INTERNAL")
    assert.equal(internal.DisplayId, internal.TrackingId)
    assert.equal(internal.CanPrint, false)
    assert.equal(internal.BundleId, null)
    assert.equal(internal.TagNumber, null)
    assert.equal(internal.Status, "TRACKING")
    assert.equal(internal.CorrelationStatus, "UNMATCHED")
    assert.ok(internal.L2Id > 0)

    await client.updateQmosLpnMode({ ...update, Enabled: true })
    const afterOn = await client.getBundle(internal.TrackingId)
    for (const field of ["QmosLpnEnabled", "IdentifierSource", "DisplayId", "CanPrint", "BundleId", "TagNumber"]) {
      assert.equal(afterOn[field], internal[field], "Returning ON must not rewrite " + field)
    }
    assert.deepEqual(await client.getBundle(prior.TrackingId), prior)
    const accepted = await client.repositionBundle({
      TrackingId: internal.TrackingId, CurrentZone: "CCH2B", OperatorId: "qa-operator", Reason: "Reposition INTERNAL fixture",
    })
    assert.equal(accepted.accepted, true)
    const moved = await client.getBundle(internal.TrackingId)
    assert.equal(moved.CurrentZone, "CCH2B")
    assert.equal(moved.QmosLpnEnabled, false)
    assert.equal(moved.CanPrint, false)
    assert.equal((await client.removeBundle({ TrackingId: internal.TrackingId, Operation: "REMOVE", OperatorId: "qa-operator", Reason: null })).accepted, true)
    await assert.rejects(client.getBundle(internal.TrackingId), (error) => isApiError(error) && error.status === 404)
    assert.deepEqual(await client.getBundle(prior.TrackingId), prior)
    let nextOn
    const nextDeadline = Date.now() + 8000
    while (!nextOn) {
      nextOn = (await client.getState()).Bundles.find((bundle) => bundle.TrackingId === "SIM-TRACK-000003")
      if (Date.now() > nextDeadline) throw new Error("Future ON cycle did not become available")
      if (!nextOn) await new Promise((done) => setTimeout(done, 100))
    }
    assert.equal(nextOn.QmosLpnEnabled, true)
    assert.equal(nextOn.IdentifierSource, "QMOS")
    assert.equal((await client.getQmosLpnMode()).Enabled, true)
  } finally {
    await simulator.close()
  }
})
