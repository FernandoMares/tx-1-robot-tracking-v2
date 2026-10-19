// Run after a live-mode standalone build: node scripts/test-qmos-lpn-ui.mjs
// Starts its own loopback HMI/API/browser and tests the global selector through
// actual production UI. Browser requests to other origins are blocked.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { startSimulator } from "./tracking-api-test-helpers.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const artifacts = resolve(root, "dist")
const standalone = resolve(root, ".next/standalone")
const browser = process.env.EDGE_PATH || [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium", "/usr/bin/google-chrome",
].find(existsSync)
assert.ok(browser, "Set EDGE_PATH to a Chromium browser")
assert.ok(existsSync(resolve(standalone, "server.js")), "Build the live standalone application first")
assert.equal(typeof WebSocket, "function", "Use Node 22 or later")
mkdirSync(artifacts, { recursive: true })
const profile = mkdtempSync(resolve(artifacts, "qmos-lpn-profile-"))
const children = []
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
let simulator
let socket

async function freePort() {
  const reservation = createServer()
  await new Promise((done, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", done) })
  const port = reservation.address().port
  await new Promise((done) => reservation.close(done))
  return port
}
async function launch(executable, args, env, ready) {
  const child = spawn(executable, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
  children.push(child)
  let output = ""
  let failure
  child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-16000) })
  child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-16000) })
  child.on("error", (error) => { failure = error })
  const deadline = Date.now() + 20000
  while (!ready(output)) {
    if (failure || child.exitCode !== null || Date.now() > deadline) throw new Error("Child startup failed: " + (failure?.message ?? output))
    await delay(100)
  }
}
const killOwned = () => { for (const child of children) if (child.exitCode === null) child.kill() }
process.once("exit", killOwned)

try {
  simulator = await startSimulator()
  const initialState = await (await simulator.fetch(simulator.baseUrl + "/api/tracking/state")).json()
  cpSync(resolve(root, ".next/static"), resolve(standalone, ".next/static"), { recursive: true })
  if (existsSync(resolve(root, "public"))) cpSync(resolve(root, "public"), resolve(standalone, "public"), { recursive: true })
  const appPort = await freePort()
  const appUrl = "http://127.0.0.1:" + appPort
  await launch(process.execPath, [resolve(standalone, "server.js")], {
    HOSTNAME: "127.0.0.1", PORT: String(appPort), TRACKING_API_PROXY_TARGET: simulator.baseUrl,
  }, (output) => output.includes("Ready in"))
  const debugPort = await freePort()
  await launch(browser, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--user-data-dir=" + profile, "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=" + debugPort, "--window-size=1440,1100", "about:blank",
  ], {}, (output) => output.includes("DevTools listening on"))
  const pages = await (await fetch("http://127.0.0.1:" + debugPort + "/json/list", { signal: AbortSignal.timeout(5000) })).json()
  const page = pages.find((entry) => entry.type === "page")
  assert.ok(page)
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((done, reject) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", reject, { once: true }) })
  let sequence = 0
  const pending = new Map()
  const checks = []
  const modeRequests = []
  const runtimeErrors = []
  const interceptionErrors = []
  const otherWrites = []
  const modePath = "/tracking-api/api/tracking/qmos-lpn-mode"
  let mode = { Enabled: true, UpdatedUtc: null, OperatorId: null, Reason: null }
  let getStatus = 200
  let holdReads = false
  let heldReads = []
  let putBehavior = "hold"
  let heldPut = null
  let stateOverride = null
  function cdp(method, params = {}) {
    const id = ++sequence
    return new Promise((done, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)) }, 15000)
      pending.set(id, { done, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async function fulfill(requestId, body, status = 200) {
    return cdp("Fetch.fulfillRequest", {
      requestId, responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Cache-Control", value: "no-store" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    })
  }
  const modeBody = () => getStatus === 200 ? mode : { error: getStatus === 404 ? "Setting unavailable" : "Read unavailable" }
  async function intercept({ requestId, request }) {
    const url = new URL(request.url)
    if (url.origin !== appUrl) return cdp("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" })
    if (url.pathname === modePath) {
      modeRequests.push({ method: request.method, body: request.postData ? JSON.parse(request.postData) : null })
      if (request.method === "GET") {
        if (holdReads) { heldReads.push(requestId); return }
        return fulfill(requestId, modeBody(), getStatus)
      }
      assert.equal(request.method, "PUT")
      const body = JSON.parse(request.postData)
      assert.deepEqual(Object.keys(body).sort(), ["Enabled", "OperatorId", "Reason"])
      if (putBehavior === "hold") { heldPut = { requestId, body }; return }
      if (putBehavior === "reject") return fulfill(requestId, { error: "Fixture validation rejection" }, 400)
      if (putBehavior === "lost") {
        mode = { ...body, UpdatedUtc: new Date().toISOString() }
        return fulfill(requestId, { error: "Response lost after persistence" }, 502)
      }
      throw new Error("Unknown PUT fixture")
    }
    if (request.method !== "GET") {
      otherWrites.push({ method: request.method, path: url.pathname })
      return cdp("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" })
    }
    if (stateOverride && url.pathname.endsWith("/api/tracking/state")) return fulfill(requestId, stateOverride)
    return cdp("Fetch.continueRequest", { requestId })
  }
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const operation = pending.get(message.id)
      if (!operation) return
      clearTimeout(operation.timer)
      pending.delete(message.id)
      if (message.error) operation.reject(new Error(JSON.stringify(message.error)))
      else operation.done(message.result)
    } else if (message.method === "Runtime.exceptionThrown") runtimeErrors.push(message.params.exceptionDetails.text)
    else if (message.method === "Fetch.requestPaused") {
      void intercept(message.params).catch((error) => interceptionErrors.push({ url: message.params.request.url, error: error.message }))
    }
  })
  async function evaluate(expression) {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  async function waitFor(expression, label) {
    const deadline = Date.now() + 15000
    while (!await evaluate("Boolean(" + expression + ")")) {
      if (Date.now() > deadline) throw new Error("UI timeout: " + label + "\n" + await evaluate("document.body.innerText"))
      await delay(100)
    }
  }
  async function input(id, value) {
    await evaluate(`{const element=document.getElementById(${JSON.stringify(id)});const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));}`)
  }
  async function openMode() {
    await evaluate(`document.querySelector('button[aria-label="QMOS LPN mode"]').click()`)
    await waitFor(`document.getElementById('qmos-lpn-enabled')`, "mode sheet")
    await waitFor(`!document.querySelector('[aria-label="Current QMOS LPN mode"]').innerText.includes('Checking...')`, "mode GET settled")
  }
  async function closeSheet() {
    await evaluate(`document.querySelector('[data-slot="sheet-close"]').click()`)
    await waitFor(`!document.querySelector('[data-slot="sheet-content"]')`, "sheet closed")
  }
  async function fill(target) {
    await input("qmos-lpn-enabled", target)
    await input("qmos-lpn-operator-id", " qa-operator ")
    await input("qmos-lpn-reason", " QA global LPN mode test ")
    await waitFor(`!document.querySelector('form button[type="submit"]').disabled`, "save available")
  }
  const puts = () => modeRequests.filter((entry) => entry.method === "PUT")
  const currentText = `document.querySelector('[aria-label="Current QMOS LPN mode"]').innerText`
  await cdp("Page.enable")
  await cdp("Runtime.enable")
  await cdp("Network.enable")
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] })
  await cdp("Page.navigate", { url: appUrl })
  await waitFor(`document.querySelector('button[aria-label="QMOS LPN mode"]')?.innerText.includes('ON')`, "initial dedicated mode GET")
  await openMode()
  assert.match(await evaluate(currentText), /Current mode: ON/)
  const constraints = await evaluate(`['qmos-lpn-enabled','qmos-lpn-operator-id','qmos-lpn-reason'].map(id=>{const el=document.getElementById(id);return{id,required:el.required,maxLength:el.maxLength,value:el.value}})`)
  assert.equal(constraints.every((entry) => entry.required), true)
  assert.equal(constraints[1].maxLength, 100)
  assert.equal(constraints[2].maxLength, 500)
  assert.equal(constraints[1].value, "")
  assert.equal(constraints[2].value, "")
  await input("qmos-lpn-enabled", "off")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true)
  await input("qmos-lpn-operator-id", "qa-operator")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true)
  await input("qmos-lpn-reason", " \t ")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true)
  await input("qmos-lpn-reason", "r".repeat(501))
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true)
  await input("qmos-lpn-reason", "r".repeat(500))
  await input("qmos-lpn-operator-id", "o".repeat(101))
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true)
  await input("qmos-lpn-operator-id", "o".repeat(100))
  await waitFor(`!document.querySelector('form button[type="submit"]').disabled`, "exact documented boundaries")
  assert.equal(puts().length, 0)
  checks.push("dedicated GET supplies mode; all three fields required, no fixed audit values; operator 100 and reason 500 boundaries enforced")

  await fill("off")
  await evaluate(`{const button=document.querySelector('form button[type="submit"]');button.click();button.click()}`)
  const holdDeadline = Date.now() + 5000
  while (!heldPut) { if (Date.now() > holdDeadline) throw new Error("No held PUT"); await delay(25) }
  assert.deepEqual(puts()[0].body, { Enabled: false, OperatorId: "qa-operator", Reason: "QA global LPN mode test" })
  assert.match(await evaluate(currentText), /Current mode: ON/)
  assert.equal(await evaluate(`document.getElementById('qmos-lpn-enabled').disabled && document.getElementById('qmos-lpn-operator-id').disabled && document.getElementById('qmos-lpn-reason').disabled`), true)
  await closeSheet()
  await openMode()
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true)
  assert.equal(puts().length, 1)
  mode = { ...heldPut.body, UpdatedUtc: new Date().toISOString() }
  await fulfill(heldPut.requestId, { updated: true, enabled: false, updatedUtc: mode.UpdatedUtc, appliesTo: "future bundles" })
  heldPut = null
  await waitFor(`document.body.innerText.includes('OFF was saved')`, "verified 200 saves OFF")
  assert.match(await evaluate(currentText), /Current mode: OFF/)
  assert.equal(await evaluate(`document.getElementById('qmos-lpn-operator-id').value`), "")
  assert.equal(await evaluate(`document.getElementById('qmos-lpn-reason').value`), "")
  assert.equal(puts().length, 1)
  checks.push("one allowlisted PUT sends false and trimmed real audit fields; mode stays ON until 200, inputs lock and sheet reopen cannot submit twice")

  putBehavior = "reject"
  await fill("on")
  await evaluate(`document.querySelector('form button[type="submit"]').click()`)
  await waitFor(`document.body.innerText.includes('change was rejected')`, "backend 400")
  assert.match(await evaluate(currentText), /Current mode: OFF/)
  assert.equal(puts().length, 2)
  checks.push("backend validation rejection retains OFF and never fabricates success or retries PUT")

  putBehavior = "lost"
  holdReads = true
  await fill("on")
  await evaluate(`document.querySelector('form button[type="submit"]').click()`)
  await waitFor(`document.body.innerText.includes('may have been saved')`, "lost response pending GET reconciliation")
  const readDeadline = Date.now() + 5000
  while (!heldReads.length) { if (Date.now() > readDeadline) throw new Error("Missing post-loss GET"); await delay(25) }
  assert.equal(puts().length, 3)
  assert.equal(modeRequests.at(-1).method, "GET")
  assert.equal(await evaluate(`document.getElementById('qmos-lpn-enabled').disabled`), true)
  holdReads = false
  for (const requestId of heldReads.splice(0)) await fulfill(requestId, mode)
  await waitFor(`document.body.innerText.includes('update response remains unverified')`, "read reconciles without claiming PUT confirmation")
  assert.match(await evaluate(currentText), /Current mode: ON/)
  assert.equal(await evaluate(`document.getElementById('qmos-lpn-enabled').disabled`), false)
  assert.equal(puts().length, 3)
  checks.push("lost update response triggers GET before another submission; successful read shows actual ON while keeping update response unverified")

  await fill("off")
  getStatus = 500
  await evaluate(`document.querySelector('form button[type="submit"]').click()`)
  await waitFor(`document.body.innerText.includes('result and current mode remain unverified')`, "lost response plus failed reconciliation")
  assert.equal(puts().length, 4)
  assert.equal(await evaluate(`document.getElementById('qmos-lpn-enabled').disabled`), true)
  await closeSheet()
  await openMode()
  assert.equal(await evaluate(`document.getElementById('qmos-lpn-enabled').disabled`), true)
  getStatus = 200
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Refresh current mode')).click()`)
  await waitFor(`document.body.innerText.includes('latest read reports QMOS LPN OFF')`, "manual read-only reconciliation")
  assert.equal(await evaluate(`document.getElementById('qmos-lpn-enabled').disabled`), false)
  assert.equal(puts().length, 4)
  checks.push("failed reconciliation keeps lock across sheet close/reopen; Refresh performs GET only and unlocks after current mode is known")

  await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }).then(({ data }) =>
    writeFileSync(resolve(artifacts, "qmos-lpn-mode-control.png"), Buffer.from(data, "base64")))
  await closeSheet()
  const scale = initialState.Bundles.find((bundle) => bundle.TrackingId === "SIM-DEMO-SCALE")
  assert.ok(scale)
  const internal = { ...scale, TrackingId: "INTERNAL-BROWSER-TEST", QmosLpnEnabled: false,
    IdentifierSource: "INTERNAL", DisplayId: "INTERNAL-BROWSER-TEST", CanPrint: false,
    BundleId: null, TagNumber: null, CorrelationStatus: "UNMATCHED", Status: "TRACKING", Weight: 1875.25 }
  stateOverride = { ...initialState, Bundles: initialState.Bundles.filter((bundle) => bundle.TrackingId !== scale.TrackingId).concat(internal) }
  await waitFor(`document.body.innerText.includes('INTERNAL-BROWSER-TEST') && document.body.innerText.includes('ID interno / sin LPN')`, "internal card and SGRT2 weight")
  const scaleText = await evaluate(`document.querySelector('[aria-label="SGRT2 bundle weight"]').innerText`)
  assert.ok(scaleText.includes("INTERNAL-BROWSER-TEST"))
  assert.ok(scaleText.includes("ID interno / sin LPN"))
  assert.ok(scaleText.includes("1875.25"))
  await evaluate(`document.querySelector('button[aria-label^="View tracked bundles"]').click()`)
  await waitFor(`document.querySelector('[data-slot="sheet-content"]')?.innerText.includes('INTERNAL-BROWSER-TEST')`, "internal tracked list")
  assert.equal(await evaluate(`(()=>{const item=Array.from(document.querySelectorAll('[data-slot="sheet-content"] li')).find(el=>el.innerText.includes('INTERNAL-BROWSER-TEST'));return !!item && item.innerText.includes('ID interno / sin LPN') && item.querySelector('button[aria-label^="Reposition"]')?.disabled===false && item.querySelector('button[aria-label^="Remove"]')?.disabled===false})()`), true)
  await closeSheet()
  checks.push("mixed ON/OFF snapshot shows internal DisplayId and explicit no-LPN label while retaining manual actions and SGRT2 weight")

  getStatus = 404
  await openMode()
  await waitFor(`document.querySelector('button[aria-label="QMOS LPN mode"]')?.innerText.includes('Unavailable')`, "old API without selector")
  assert.equal(await evaluate(`document.getElementById('qmos-lpn-enabled').disabled`), true)
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true)
  assert.equal(await evaluate(`document.body.innerText.includes('not available on this tracking service')`), true)
  assert.equal(await evaluate(`!!document.querySelector('button[aria-label^="View tracked bundles"]')`), true)
  assert.equal(puts().length, 4)
  checks.push("404 leaves mode unavailable and writes disabled while rest of tracking page remains usable")

  assert.deepEqual(otherWrites, [])
  assert.deepEqual(runtimeErrors, [])
  assert.deepEqual(interceptionErrors, [])
  console.log(JSON.stringify({ passed: true, checks, modeRequests, screenshot: resolve(artifacts, "qmos-lpn-mode-control.png") }, null, 2))
} finally {
  socket?.close()
  killOwned()
  await simulator?.close()
  await delay(1000)
  assert.ok(profile.startsWith(artifacts + sep + "qmos-lpn-profile-"))
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }) }
  catch (error) { console.error("Owned browser profile cleanup: " + error.message) }
  process.removeListener("exit", killOwned)
}
