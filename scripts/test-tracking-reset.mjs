// Run: node scripts/test-tracking-reset.mjs
// In-memory transport tests only. No plant, configured backend, or network I/O.
import assert from "node:assert/strict"
import { test } from "node:test"
import { loadTypeScript } from "./tracking-api-test-helpers.mjs"

const resetPath = "/api/tracking/reset"
const acknowledgement = { accepted: true, eventId: 30, eventType: "RESET" }
const intentHeaders = { "X-Tracking-Reset-Confirmation": "RESET" }
const validation = loadTypeScript("lib/tracking-api/validation.ts")
const { TrackingApiClient, isApiError } = loadTypeScript("lib/tracking-api/client.ts")

function callProxy(proxy, {
  method = "POST", path = resetPath, headers = intentHeaders, body, search = "", origin = "http://hmi.invalid",
} = {}) {
  return proxy[method](new Request(origin + "/tracking-api" + path + search, {
    method, headers, body,
  }), { params: Promise.resolve({ path: path.slice(1).split("/") }) })
}

function createProxy(fetchImpl, target = "http://backend.invalid:8085") {
  return loadTypeScript("app/tracking-api/[...path]/route.ts", {
    env: target === undefined ? {} : { TRACKING_API_PROXY_TARGET: target },
    fetchImpl,
  })
}

test("reset acknowledgement validates the documented RESET event without a bundle identity", () => {
  assert.equal(validation.isTrackingResetAcceptedDto(acknowledgement), true)
  assert.equal(validation.isTrackingResetAcceptedDto({ ...acknowledgement, accepted: false }), true)
  assert.equal(validation.isTrackingCommandAcceptedDto(acknowledgement), false)
  for (const body of [
    null, [], {}, true,
    { ...acknowledgement, accepted: "true" },
    { ...acknowledgement, eventId: 0 },
    { ...acknowledgement, eventId: -1 },
    { ...acknowledgement, eventId: 1.5 },
    { ...acknowledgement, eventId: Number.MAX_SAFE_INTEGER + 1 },
    { ...acknowledgement, eventId: "30" },
    { ...acknowledgement, eventType: "MANUAL_CORRECTION" },
    { ...acknowledgement, eventType: "TRACKING_RESET" },
    { ...acknowledgement, eventType: "" },
    { accepted: true, eventId: 30 },
  ]) {
    assert.equal(validation.isTrackingResetAcceptedDto(body), false, JSON.stringify(body))
  }
})

test("client sends one bodyless POST with explicit reset intent and forbids redirects", async () => {
  const calls = []
  const client = new TrackingApiClient({
    baseUrl: "/tracking-api",
    headers: { "X-Test-Caller": "retained", "X-Tracking-Reset-Confirmation": "incorrect" },
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options })
      return Response.json(acknowledgement, { status: 202 })
    },
  })
  assert.deepEqual(await client.resetTracking(), acknowledgement)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, "/tracking-api" + resetPath)
  assert.equal(calls[0].method, "POST")
  assert.equal(calls[0].body, undefined)
  assert.equal(calls[0].headers.get("X-Tracking-Reset-Confirmation"), "RESET")
  assert.equal(calls[0].headers.get("X-Test-Caller"), "retained")
  assert.equal(calls[0].cache, "no-store")
  assert.equal(calls[0].credentials, "omit")
  assert.equal(calls[0].redirect, "error")
})

test("client preserves error kind/status and never retries a reset on response failures", async () => {
  const failures = [
    { response: () => Response.json({ error: "Invalid" }, { status: 400 }), kind: "http", status: 400 },
    { response: () => Response.json({ error: "Unavailable" }, { status: 503 }), kind: "http", status: 503 },
    { response: () => Response.json({}, { status: 202 }), kind: "invalid-payload", status: 202 },
    { response: () => Response.json({ ...acknowledgement, eventType: "MANUAL_CORRECTION" }, { status: 202 }), kind: "invalid-payload", status: 202 },
    { response: () => new Response("not json", { status: 202 }), kind: "invalid-json", status: 202 },
    { response: () => new Response(null, { status: 204 }), kind: "invalid-json", status: 204 },
    { response: () => { throw new Error("Network or redirect error") }, kind: "network", status: null },
  ]
  for (const { response, kind, status } of failures) {
    let calls = 0
    const client = new TrackingApiClient({
      baseUrl: "http://hmi.invalid/tracking-api",
      fetchImpl: async () => { calls += 1; return response() },
    })
    await assert.rejects(client.resetTracking(), (error) =>
      isApiError(error) && error.kind === kind && error.status === status)
    assert.equal(calls, 1, kind)
  }
})

test("client timeout/cancellation do not retry a potentially accepted reset", async () => {
  for (const cancel of [false, true]) {
    let calls = 0
    const external = new AbortController()
    const client = new TrackingApiClient({
      baseUrl: "http://hmi.invalid/tracking-api", timeoutMs: 20,
      fetchImpl: async (_url, { signal }) => {
        calls += 1
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
          if (cancel) external.abort()
        })
      },
    })
    await assert.rejects(client.resetTracking(external.signal), (error) =>
      isApiError(error) && error.kind === (cancel ? "aborted" : "timeout"))
    assert.equal(calls, 1)
  }
})

test("proxy forwards only bodyless reset POST, strips intent header and preserves acceptance", async () => {
  const calls = []
  const proxy = createProxy(async (url, options) => {
    calls.push({ url: String(url), ...options })
    return Response.json(acknowledgement, { status: 202, statusText: "Accepted" })
  })
  for (const headers of [intentHeaders, { ...intentHeaders, Origin: "http://hmi.invalid" }]) {
    const response = await callProxy(proxy, { headers })
    assert.equal(response.status, 202)
    assert.equal(response.statusText, "Accepted")
    assert.equal(response.headers.get("Cache-Control"), "no-store")
    assert.deepEqual(await response.json(), acknowledgement)
  }
  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.equal(call.url, "http://backend.invalid:8085" + resetPath)
    assert.equal(call.method, "POST")
    assert.equal(call.body, undefined)
    assert.equal(call.redirect, "error")
    assert.equal(call.cache, "no-store")
    const headers = new Headers(call.headers)
    assert.equal(headers.get("Accept"), "application/json")
    assert.equal(headers.get("X-Tracking-Reset-Confirmation"), null)
    assert.equal(headers.get("Origin"), null)
    assert.equal(headers.get("Content-Type"), null)
  }
})

test("proxy rejects missing intent, cross-origin reset, nonempty bodies and queries without forwarding", async () => {
  let calls = 0
  const proxy = createProxy(async () => { calls += 1; throw new Error("Must not forward") })
  for (const headers of [
    {}, { "X-Tracking-Reset-Confirmation": "reset" },
    { ...intentHeaders, Origin: "http://other.invalid" },
    { ...intentHeaders, Origin: "null" },
    { ...intentHeaders, Origin: "https://hmi.invalid" },
  ]) {
    assert.equal((await callProxy(proxy, { headers })).status, 403)
  }
  for (const body of ["{}", "null", " ", "reset=true", JSON.stringify({ Operation: "REMOVE" })]) {
    assert.equal((await callProxy(proxy, { body })).status, 400)
  }
  for (const search of ["?reset=true", "?TrackingId=TEST", "?x="]) {
    assert.equal((await callProxy(proxy, { search })).status, 400)
  }
  assert.equal(calls, 0)
})

test("proxy validates browser Origin against inbound Host despite Next's internal URL rewriting", async () => {
  let calls = 0
  const proxy = createProxy(async () => {
    calls += 1
    return Response.json(acknowledgement, { status: 202 })
  })
  const accepted = [
    { urlOrigin: "http://localhost:3333", host: "127.0.0.1:3333", browserOrigin: "http://127.0.0.1:3333" },
    { urlOrigin: "http://localhost:3333", host: "[::1]:3333", browserOrigin: "http://[::1]:3333" },
    { urlOrigin: "http://0.0.0.0:3000", host: "10.14.6.74:3000", browserOrigin: "http://10.14.6.74:3000" },
    { urlOrigin: "http://0.0.0.0:3000", host: "hmi.internal:3000", browserOrigin: "http://hmi.internal:3000" },
    { urlOrigin: "http://localhost:80", host: "HMI.INVALID:80", browserOrigin: "http://hmi.invalid" },
    { urlOrigin: "https://localhost:443", host: "hmi.invalid:443", browserOrigin: "https://hmi.invalid" },
  ]
  for (const { urlOrigin, host, browserOrigin } of accepted) {
    const response = await callProxy(proxy, {
      origin: urlOrigin, headers: { ...intentHeaders, Host: host, Origin: browserOrigin },
    })
    assert.equal(response.status, 202, JSON.stringify({ urlOrigin, host, browserOrigin }))
  }
  assert.equal(calls, accepted.length)
  const rejected = [
    { Host: "127.0.0.1:3333", Origin: "http://localhost:3333" },
    { Host: "127.0.0.1:3333", Origin: "http://127.0.0.1:3000" },
    { Host: "127.0.0.1:3333", Origin: "https://127.0.0.1:3333" },
    { Host: "127.0.0.1:3333", Origin: "http://other.invalid" },
    { Host: "hmi.invalid", Origin: "http://other.invalid", "X-Forwarded-Host": "other.invalid" },
    { Host: "hmi.invalid", Origin: "https://hmi.invalid", "X-Forwarded-Proto": "https" },
    { Host: "hmi.invalid", Origin: "http://other.invalid", Forwarded: 'host="other.invalid";proto=http' },
    ...["", "user@hmi.invalid", "hmi.invalid/path", "hmi.invalid?query", "hmi.invalid#hash", "hmi.invalid,other.invalid", "hmi.invalid other.invalid", "%68mi.invalid", "hmi.invalid\\path"].map((Host) => ({ Host, Origin: "http://hmi.invalid" })),
  ]
  for (const headers of rejected) {
    const response = await callProxy(proxy, {
      origin: "http://localhost:3333", headers: { ...intentHeaders, ...headers },
    })
    assert.equal(response.status, 403, JSON.stringify(headers))
  }
  assert.equal(calls, accepted.length, "Cross-origin/invalid-host requests must never be forwarded")
})

test("reset does not expand the proxy's read, PUT, or unrelated POST allowlist", async () => {
  let calls = 0
  const proxy = createProxy(async () => { calls += 1; throw new Error("Must not forward") })
  for (const method of ["GET", "PUT"]) {
    assert.equal((await callProxy(proxy, { method })).status, 404)
  }
  for (const path of ["/api/tracking/reset/all", "/api/tracking/reset-extra", "/api/tracking/event", "/api/tracking/state"]) {
    assert.equal((await callProxy(proxy, { path })).status, 404)
  }
  assert.equal(proxy.DELETE, undefined)
  assert.equal(proxy.PATCH, undefined)
  assert.equal(calls, 0)
})

test("proxy preserves backend errors and empty status, with no retries after network uncertainty", async () => {
  for (const status of [400, 401, 403, 404, 409, 500, 503]) {
    let calls = 0
    const body = { error: "Backend diagnostic", code: status }
    const proxy = createProxy(async () => { calls += 1; return Response.json(body, { status }) })
    const response = await callProxy(proxy)
    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), body)
    assert.equal(calls, 1)
  }
  for (const status of [204, 205, 304]) {
    const proxy = createProxy(async () => new Response(null, { status }))
    const response = await callProxy(proxy)
    assert.equal(response.status, status)
    assert.equal(await response.text(), "")
  }
  let calls = 0
  const proxy = createProxy(async () => { calls += 1; throw new Error("Response lost") })
  const response = await callProxy(proxy)
  assert.equal(response.status, 502)
  assert.match((await response.json()).error, /may have been accepted/)
  assert.equal(calls, 1)
})

test("proxy rejects unconfigured/invalid backend targets before sending reset", async () => {
  let calls = 0
  for (const target of ["", "not a URL", "file:///C:/tracking", "http://user:pass@backend.invalid"]) {
    const proxy = createProxy(async () => { calls += 1; throw new Error("Must not forward") }, target)
    assert.equal((await callProxy(proxy)).status, 503)
  }
  assert.equal(calls, 0)
})

test("real client and proxy work together with the bodyless contract, including accepted=false", async () => {
  const forwarded = []
  let accepted = true
  const proxy = createProxy(async (url, options) => {
    forwarded.push({ url: String(url), ...options })
    return Response.json({ ...acknowledgement, accepted }, { status: 202 })
  }, "http://backend.invalid:8085/prefix/")
  const client = new TrackingApiClient({
    baseUrl: "http://hmi.invalid/tracking-api",
    fetchImpl: (url, options) => proxy.POST(new Request(url, options), {
      params: Promise.resolve({ path: resetPath.slice(1).split("/") }),
    }),
  })
  assert.deepEqual(await client.resetTracking(), acknowledgement)
  accepted = false
  assert.equal((await client.resetTracking()).accepted, false)
  assert.equal(forwarded.length, 2)
  assert.ok(forwarded.every(({ url, body }) =>
    url === "http://backend.invalid:8085/prefix" + resetPath && body === undefined))
})
