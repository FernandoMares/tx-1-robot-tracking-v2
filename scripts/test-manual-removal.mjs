// Run with: node scripts/test-manual-removal.mjs
// Uses only the existing TypeScript dependency and Node built-ins. All network
// traffic is restricted to the simulator child created by this runner.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, resolve, sep } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const correctionPath = "/api/tracking/correct"
const removal = {
  TrackingId: "SIM-TRACK-HOLD",
  Operation: "REMOVE",
  OperatorId: "regression-operator",
  Reason: "Simulator regression only",
}
const acknowledgement = {
  accepted: true,
  eventId: 123,
  eventType: "MANUAL_REMOVE",
  trackingId: removal.TrackingId,
}

// Load the actual implementation without a build, temporary files, or Next
// runtime. The handler uses standard Request/Response and promised params.
function loadTypeScript(relativePath, { fetchImpl, env = {} } = {}) {
  const cache = new Map()
  function load(filename) {
    assert.ok(filename.startsWith(projectRoot + sep), "Only project modules may be loaded")
    if (cache.has(filename)) return cache.get(filename)
    const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    const exports = {}
    cache.set(filename, exports)
    runInNewContext(outputText, {
      exports,
      require(specifier) {
        assert.ok(specifier.startsWith("@/") || specifier.startsWith("."))
        return load(resolve(
          specifier.startsWith("@/") ? projectRoot : dirname(filename),
          specifier.startsWith("@/") ? specifier.slice(2) + ".ts" : specifier + ".ts",
        ))
      },
      process: { env },
      fetch: fetchImpl ?? (() => { throw new Error("Unexpected network request") }),
      JSON, URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout,
    }, { filename })
    return exports
  }
  return load(resolve(projectRoot, relativePath))
}

const validation = loadTypeScript("lib/tracking-api/validation.ts")
const { TrackingApiClient, isApiError } = loadTypeScript("lib/tracking-api/client.ts")

function invalidRemovals(valid = removal) {
  const cases = [null, [], "REMOVE", { ...valid, Operation: "RETIRE" }]
  for (const field of Object.keys(valid)) {
    const missing = { ...valid }
    delete missing[field]
    cases.push(missing, { ...valid, [field]: undefined }, { ...valid, [field]: 123 })
    if (field !== "Reason") cases.push({ ...valid, [field]: " \t " }, { ...valid, [field]: null })
  }
  for (const Reason of [false, true, {}, []]) cases.push({ ...valid, Reason })
  return cases
}

function routeRequest(handler, body, { path = correctionPath, contentType = "application/json", raw } = {}) {
  const request = new Request("http://hmi.invalid/tracking-api" + path, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: raw ?? JSON.stringify(body),
  })
  return handler(request, { params: Promise.resolve({ path: path.slice(1).split("/") }) })
}

test("REMOVE validator requires explicit Reason but accepts null or text; operator and identity remain required", () => {
  assert.equal(validation.isTrackingRemovalRequestDto(removal), true)
  for (const Reason of [null, "", " \t ", " reason "]) {
    assert.equal(validation.isTrackingRemovalRequestDto({ ...removal, Reason }), true)
  }
  for (const body of invalidRemovals()) {
    assert.equal(validation.isTrackingRemovalRequestDto(body), false, JSON.stringify(body))
  }
})

test("client trims and allowlists REMOVE, validates requests and acknowledgements", async () => {
  const calls = []
  let responseBody = acknowledgement
  const client = new TrackingApiClient({
    baseUrl: "http://hmi.invalid",
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options, body: JSON.parse(options.body) })
      return Response.json(responseBody, { status: 202 })
    },
  })
  const input = Object.freeze({
    ...removal, TrackingId: " SIM-TRACK-HOLD ", OperatorId: " regression-operator ",
    Reason: " Simulator regression only ", CurrentZone: "SGRT2B", MillOrder1: "discard",
    TagNumber: "discard", BundleId: "discard",
  })
  assert.deepEqual(await client.removeBundle(input), acknowledgement)
  assert.equal(calls[0].url, "http://hmi.invalid" + correctionPath)
  assert.equal(calls[0].method, "POST")
  assert.deepEqual(calls[0].body, removal)
  assert.equal(calls[0].headers.get("Content-Type"), "application/json")
  assert.equal(calls[0].cache, "no-store")
  assert.equal(input.TrackingId, " SIM-TRACK-HOLD ")
  for (const body of invalidRemovals()) assert.throws(() => client.removeBundle(body))
  assert.equal(calls.length, 1, "Invalid requests must not be sent")

  for (const invalid of [
    {}, { ...acknowledgement, eventId: 0 }, { ...acknowledgement, trackingId: " " },
    { ...acknowledgement, eventType: "" }, { ...acknowledgement, accepted: "true" },
  ]) {
    responseBody = invalid
    await assert.rejects(client.removeBundle(removal), (error) =>
      isApiError(error) && error.kind === "invalid-payload" && error.status === 202)
  }
})

test("REMOVE client preserves explicit null and normalizes blank comments without inventing values", async () => {
  const calls = []
  const client = new TrackingApiClient({
    baseUrl: "http://hmi.invalid",
    fetchImpl: async (url, options) => {
      calls.push(JSON.parse(options.body))
      return Response.json(acknowledgement, { status: 202 })
    },
  })
  for (const Reason of [null, "", " \t\r\n ", "  Written comment  "]) {
    const input = Object.freeze({ ...removal, Reason, BundleId: "discard", CurrentZone: "discard" })
    await client.removeBundle(input)
    assert.deepEqual(calls.at(-1), { ...removal, Reason: Reason?.trim() || null })
    assert.equal(input.Reason, Reason, "Normalization must not mutate the caller's payload")
  }
  assert.equal(calls.length, 4, "Each valid action must send exactly one request")
})

test("proxy restricts POST, sanitizes removal and preserves legacy correction", async () => {
  const calls = []
  const proxy = loadTypeScript("app/tracking-api/[...path]/route.ts", {
    env: { TRACKING_API_PROXY_TARGET: "http://127.0.0.1:1" },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), ...options, body: JSON.parse(options.body) })
      return Response.json(acknowledgement, { status: 202 })
    },
  })
  const response = await routeRequest(proxy.POST, {
    ...removal, TrackingId: " SIM-TRACK-HOLD ", OperatorId: " regression-operator ",
    Reason: " Simulator regression only ", MillOrder1: "discard", CurrentZone: "discard",
    BundleId: "discard", TagNumber: "discard",
  })
  assert.equal(response.status, 202)
  assert.deepEqual(await response.json(), acknowledgement)
  assert.equal(response.headers.get("Cache-Control"), "no-store")
  assert.deepEqual(calls[0].body, removal)
  assert.equal(calls[0].url, "http://127.0.0.1:1" + correctionPath)
  assert.equal(calls[0].method, "POST")

  const legacy = { TrackingId: removal.TrackingId, OperatorId: "operator", Reason: "Correct order", MillOrder1: "MO-123" }
  assert.equal((await routeRequest(proxy.POST, { ...legacy, MillOrder1: " MO-123 ", BundleId: "discard" })).status, 202)
  assert.deepEqual(calls[1].body, legacy)
  // CurrentZone now explicitly selects repositioning: mixing it with a Mill
  // Order edit is ambiguous and must not silently become a different command.
  for (const body of [...invalidRemovals(), { ...legacy, Operation: "RETIRE" }, { ...legacy, Operation: null }, { ...legacy, CurrentZone: "SGRT2A" }]) {
    assert.equal((await routeRequest(proxy.POST, body)).status, 400, JSON.stringify(body))
  }
  assert.equal((await routeRequest(proxy.POST, removal, { raw: "{" })).status, 400)
  assert.equal((await routeRequest(proxy.POST, removal, { contentType: "text/plain" })).status, 415)
  assert.equal((await routeRequest(proxy.POST, removal, { path: "/api/tracking/reset" })).status, 403)
  for (const path of ["/api/tracking/state", "/api/tracking/remove"]) {
    assert.equal((await routeRequest(proxy.POST, removal, { path })).status, 404)
  }
  const context = { params: Promise.resolve({ path: correctionPath.slice(1).split("/") }) }
  assert.equal((await proxy.GET(new Request("http://hmi.invalid" + correctionPath), context)).status, 404)
  assert.equal((await proxy.PUT(new Request("http://hmi.invalid" + correctionPath, { method: "PUT" }), context)).status, 404)
  assert.equal(calls.length, 2, "Rejected requests must never reach the backend")
  assert.ok(calls.every(({ url }) => new URL(url).pathname === correctionPath), "No reset is forwarded")
})

test("proxy normalizes REMOVE comments but keeps reposition and Mill Order correction fields mandatory", async () => {
  const calls = []
  const proxy = loadTypeScript("app/tracking-api/[...path]/route.ts", {
    env: { TRACKING_API_PROXY_TARGET: "http://127.0.0.1:1" },
    fetchImpl: async (url, options) => {
      calls.push(JSON.parse(options.body))
      return Response.json(acknowledgement, { status: 202 })
    },
  })
  for (const Reason of [null, "", " \t\r\n ", "  Written comment  "]) {
    const response = await routeRequest(proxy.POST, {
      ...removal, Reason, BundleId: "discard", TagNumber: "discard", MillOrder1: "discard", CurrentZone: "discard",
    })
    assert.equal(response.status, 202)
    assert.deepEqual(calls.at(-1), { ...removal, Reason: Reason?.trim() || null })
  }
  const { Operation, ...identity } = removal
  const variants = [
    { body: { ...identity, CurrentZone: "SGRT2A" }, validate: validation.isTrackingRepositionRequestDto, method: "repositionBundle" },
    { body: { ...identity, MillOrder1: "MO-123" }, validate: validation.isTrackingCorrectionRequestDto, method: "correctBundle" },
  ]
  const client = new TrackingApiClient({
    baseUrl: "http://hmi.invalid",
    fetchImpl: () => { throw new Error("Invalid correction must not be sent") },
  })
  for (const { body, validate, method } of variants) {
    for (const field of ["Reason", "OperatorId"]) {
      for (const value of [null, undefined, "", " \t ", 123, false, {}, []]) {
        const invalid = { ...body, [field]: value }
        assert.equal(validate(invalid), false, JSON.stringify(invalid))
        assert.throws(() => client[method](invalid))
        assert.equal((await routeRequest(proxy.POST, invalid)).status, 400, JSON.stringify(invalid))
      }
    }
  }
  assert.equal(calls.length, 4, "Invalid variants never reach the backend")
})

test("optional-comment REMOVE never retries backend rejection, network failure or client timeout", async () => {
  for (const outcome of [400, 500, "network"]) {
    let backendCalls = 0
    let browserCalls = 0
    const proxy = loadTypeScript("app/tracking-api/[...path]/route.ts", {
      env: { TRACKING_API_PROXY_TARGET: "http://127.0.0.1:1" },
      fetchImpl: async (url, options) => {
        backendCalls += 1
        assert.deepEqual(JSON.parse(options.body), { ...removal, Reason: null })
        if (outcome === "network") throw new Error("Response lost after request was sent")
        return Response.json({ error: "Fixture rejection" }, { status: outcome })
      },
    })
    const client = new TrackingApiClient({
      baseUrl: "http://hmi.invalid",
      fetchImpl: (url, options) => {
        browserCalls += 1
        return proxy.POST(new Request(url, options), {
          params: Promise.resolve({ path: correctionPath.slice(1).split("/") }),
        })
      },
    })
    await assert.rejects(client.removeBundle({ ...removal, Reason: null }), (error) =>
      isApiError(error) && error.status === (outcome === "network" ? 502 : outcome))
    assert.equal(browserCalls, 1)
    assert.equal(backendCalls, 1)
  }
  let timeoutCalls = 0
  const timeoutClient = new TrackingApiClient({
    baseUrl: "http://hmi.invalid",
    timeoutMs: 10,
    fetchImpl: (url, options) => {
      timeoutCalls += 1
      return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("Aborted fixture")), { once: true })
      })
    },
  })
  await assert.rejects(timeoutClient.removeBundle({ ...removal, Reason: null }), (error) =>
    isApiError(error) && error.kind === "timeout")
  assert.equal(timeoutCalls, 1)
})

async function unusedLoopbackPort() {
  const reservation = createServer()
  await new Promise((resolveReady, reject) => {
    reservation.once("error", reject)
    reservation.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolveReady)
  })
  const port = reservation.address().port
  await new Promise((resolveClosed, reject) => reservation.close((error) => error ? reject(error) : resolveClosed()))
  return port
}

async function startSimulator() {
  const port = await unusedLoopbackPort()
  const baseUrl = "http://127.0.0.1:" + port
  const child = spawn(process.execPath, [resolve(projectRoot, "scripts/tracking-api-simulator.mjs")], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      TRACKING_SIMULATOR_HOST: "127.0.0.1",
      TRACKING_SIMULATOR_PORT: String(port),
      TRACKING_SIMULATOR_STEP_MS: "3600000",
      TRACKING_SIMULATOR_BUFFER_DEMO: "true",
      TRACKING_SIMULATOR_QMOS_CONNECTED: "true",
      TRACKING_SIMULATOR_OPC_CONNECTED: "true",
      TRACKING_SIMULATOR_LOG_REQUESTS: "false",
    },
  })
  const killOwnedChild = () => {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
  process.once("exit", killOwnedChild)
  let output = ""
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit))
  let startupTimer
  try {
    await new Promise((resolveReady, reject) => {
      startupTimer = setTimeout(() => reject(new Error("Simulator startup timed out: " + output)), 10000)
      child.once("error", reject)
      child.once("exit", (code) => reject(new Error("Simulator exited before startup (" + code + "): " + output)))
      child.stderr.on("data", (data) => { output = (output + data).slice(-16000) })
      child.stdout.on("data", (data) => {
        output = (output + data).slice(-16000)
        // Do not contact the port until this specific child has bound it.
        if (output.includes("Tracking API simulator running at " + baseUrl)) resolveReady()
      })
    })
  } catch (error) {
    killOwnedChild()
    process.removeListener("exit", killOwnedChild)
    throw error
  } finally {
    clearTimeout(startupTimer)
  }
  return {
    baseUrl,
    async fetch(url, options = {}) {
      assert.equal(new URL(url).origin, baseUrl, "Network requests must stay on the owned simulator")
      assert.equal(child.exitCode, null, "Simulator must still be running")
      return fetch(url, { ...options, redirect: "error", signal: options.signal ?? AbortSignal.timeout(5000) })
    },
    async close() {
      killOwnedChild()
      let stopTimer
      try {
        await Promise.race([exited, new Promise((_, reject) => {
          stopTimer = setTimeout(() => reject(new Error("Simulator did not exit")), 5000)
        })])
      } finally {
        clearTimeout(stopTimer)
        process.removeListener("exit", killOwnedChild)
      }
    },
  }
}

test("simulator removes only TrackingId, preserves other bundles and rejects invalid/duplicate removal", { timeout: 20000 }, async () => {
  const simulator = await startSimulator()
  try {
    const directClient = new TrackingApiClient({ baseUrl: simulator.baseUrl, fetchImpl: simulator.fetch })
    const initialState = await directClient.getState()
    const target = initialState.Bundles.find((bundle) => bundle.TrackingId === "SIM-DEMO-BUFFER-1")
    assert.ok(target, "Static buffer fixture must exist")
    const neighbor = initialState.Bundles.find((bundle) => bundle.TrackingId !== target.TrackingId && bundle.CurrentZone === target.CurrentZone)
    assert.ok(neighbor, "A second bundle in the same zone must exist")
    const selectedRemoval = { ...removal, TrackingId: target.TrackingId }
    const post = (body) => simulator.fetch(simulator.baseUrl + correctionPath, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })

    for (const body of invalidRemovals(selectedRemoval)) {
      assert.equal((await post(body)).status, 400, JSON.stringify(body))
    }
    assert.equal((await post({ Operation: "REMOVE", OperatorId: "operator", Reason: "Invalid identity", BundleId: target.BundleId, TagNumber: target.TagNumber, CurrentZone: target.CurrentZone })).status, 400)
    assert.equal((await post({ ...selectedRemoval, TrackingId: String(target.BundleId) })).status, 404)
    assert.deepEqual((await directClient.getState()).Bundles, initialState.Bundles, "Bad fields must not mutate active bundles")

    // Exercise client -> actual proxy handler -> owned simulator, including
    // misleading display identities that must never replace TrackingId.
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
    const accepted = await client.removeBundle({
      ...selectedRemoval, BundleId: neighbor.BundleId, TagNumber: neighbor.TagNumber, CurrentZone: "SGRT1B",
    })
    assert.equal(accepted.accepted, true)
    assert.equal(accepted.eventType, "MANUAL_REMOVE")
    assert.equal(accepted.trackingId, target.TrackingId)
    assert.deepEqual(forwarded, [{ path: correctionPath, body: selectedRemoval }])
    const afterRemoval = await directClient.getState()
    assert.deepEqual(afterRemoval.Bundles, initialState.Bundles.filter((bundle) => bundle.TrackingId !== target.TrackingId))
    await assert.rejects(directClient.getBundle(target.TrackingId), (error) => isApiError(error) && error.status === 404)
    await assert.rejects(client.removeBundle(selectedRemoval), (error) => isApiError(error) && error.status === 404)
    assert.deepEqual((await directClient.getState()).Bundles, afterRemoval.Bundles, "Duplicate removal must not affect other bundles")
    assert.ok(forwarded.every(({ path }) => path === correctionPath), "No global reset is requested")
  } finally {
    await simulator.close()
  }
})

test("simulator accepts null/blank REMOVE comments only and preserves neighbors and strict correction variants", { timeout: 20000 }, async () => {
  const simulator = await startSimulator()
  try {
    const direct = new TrackingApiClient({ baseUrl: simulator.baseUrl, fetchImpl: simulator.fetch })
    const initial = await direct.getState()
    const { Operation, ...identity } = removal
    const variants = [
      { ...identity, CurrentZone: "SGRT2A" },
      { ...identity, MillOrder1: "MO-123" },
    ]
    const post = (body) => simulator.fetch(simulator.baseUrl + correctionPath, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    for (const body of variants) {
      for (const field of ["Reason", "OperatorId"]) {
        for (const value of [null, undefined, "", " \t ", 123]) {
          const invalid = { ...body, [field]: value }
          assert.equal((await post(invalid)).status, 400, JSON.stringify(invalid))
        }
      }
    }
    for (const invalid of invalidRemovals({ ...removal, Reason: null })) {
      assert.equal((await post(invalid)).status, 400, JSON.stringify(invalid))
    }
    assert.deepEqual((await direct.getState()).Bundles, initial.Bundles, "Invalid fields never mutate the simulator")

    const removed = new Set()
    for (const [index, Reason] of [null, "", " \t\r\n "].entries()) {
      const TrackingId = "SIM-DEMO-BUFFER-" + (index + 1)
      const response = await post({ ...removal, TrackingId, Reason, BundleId: "discard", CurrentZone: "discard" })
      assert.equal(response.status, 202)
      const accepted = await response.json()
      assert.equal(accepted.accepted, true)
      assert.equal(accepted.trackingId, TrackingId)
      removed.add(TrackingId)
      const after = await direct.getState()
      assert.deepEqual(after.Bundles, initial.Bundles.filter((bundle) => !removed.has(bundle.TrackingId)))
      await assert.rejects(direct.getBundle(TrackingId), (error) => isApiError(error) && error.status === 404)
    }
    // The original nonblank-comment regression above exercises the full
    // client/proxy/simulator path; these direct requests cover API boundaries.
  } finally {
    await simulator.close()
  }
})
