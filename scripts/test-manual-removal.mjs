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
    cases.push(missing, { ...valid, [field]: " \t " }, { ...valid, [field]: 123 })
  }
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

test("REMOVE validator requires its four fields and rejects RETIRE", () => {
  assert.equal(validation.isTrackingRemovalRequestDto(removal), true)
  assert.equal(validation.isTrackingRemovalRequestDto({ ...removal, Reason: " reason " }), true)
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
  for (const path of ["/api/tracking/reset", "/api/tracking/state", "/api/tracking/remove"]) {
    assert.equal((await routeRequest(proxy.POST, removal, { path })).status, 404)
  }
  const context = { params: Promise.resolve({ path: correctionPath.slice(1).split("/") }) }
  assert.equal((await proxy.GET(new Request("http://hmi.invalid" + correctionPath), context)).status, 404)
  assert.equal((await proxy.PUT(new Request("http://hmi.invalid" + correctionPath, { method: "PUT" }), context)).status, 404)
  assert.equal(calls.length, 2, "Rejected requests must never reach the backend")
  assert.ok(calls.every(({ url }) => new URL(url).pathname === correctionPath), "No reset is forwarded")
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
