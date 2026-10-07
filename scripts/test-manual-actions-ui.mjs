// Requires Node 22+ (built-in WebSocket), a Chromium browser, and a production
// standalone build made with NEXT_PUBLIC_PLANT_DATA_MODE=live and
// NEXT_PUBLIC_TRACKING_API_URL=/tracking-api. Run: node scripts/test-manual-actions-ui.mjs
// EDGE_PATH may point to Edge/Chrome/Chromium on any OS. The runner creates its
// own loopback simulator/HMI, blocks other page origins, and removes its profile.
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
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/microsoft-edge", "/usr/bin/chromium", "/usr/bin/google-chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].find(existsSync)
assert.ok(browser, "Set EDGE_PATH to an installed Edge/Chrome/Chromium executable")
assert.ok(existsSync(resolve(standalone, "server.js")), "Create the live-mode standalone production build first")
assert.equal(typeof WebSocket, "function", "Use Node 22 or newer")
mkdirSync(artifacts, { recursive: true })
const profile = mkdtempSync(resolve(artifacts, "manual-actions-profile-"))
const owned = []
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
let simulator
let socket

async function freePort() {
  const server = createServer()
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done) })
  const port = server.address().port
  await new Promise((done) => server.close(done))
  return port
}
async function launch(executable, args, env, ready) {
  const child = spawn(executable, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
  owned.push(child)
  let output = ""
  let spawnError
  child.stdout.on("data", (data) => { output = (output + data).slice(-16000) })
  child.stderr.on("data", (data) => { output = (output + data).slice(-16000) })
  child.on("error", (error) => { spawnError = error })
  const end = Date.now() + 20000
  while (!ready(output)) {
    if (spawnError || child.exitCode !== null || Date.now() > end) throw new Error("Child failed startup: " + (spawnError?.message ?? output))
    await delay(100)
  }
}
const killOwned = () => { for (const child of owned) if (child.exitCode === null) child.kill() }
process.once("exit", killOwned)

try {
  simulator = await startSimulator({ disabledZones: "LCH2A" })
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
  const pending = new Map()
  const requests = []
  const commandRequests = []
  const runtimeErrors = []
  const interceptionErrors = []
  const checks = []
  let sequence = 0
  let dialogWaiter
  let stateOverride = null
  let mapOverride = null
  let commandOverride = null
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
  async function intercept({ requestId, request }) {
    const url = new URL(request.url)
    if (url.origin !== appUrl) return cdp("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" })
    requests.push({ method: request.method, path: url.pathname })
    if (request.method === "POST" && url.pathname.endsWith("/api/tracking/correct")) {
      commandRequests.push(JSON.parse(request.postData))
      if (commandOverride) return fulfill(requestId, commandOverride.body, commandOverride.status)
    }
    if (request.method === "GET" && url.pathname.endsWith("/api/tracking/state") && stateOverride) return fulfill(requestId, stateOverride)
    if (request.method === "GET" && url.pathname.endsWith("/api/tracking/map") && mapOverride) return fulfill(requestId, mapOverride)
    return cdp("Fetch.continueRequest", { requestId })
  }
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const operation = pending.get(message.id)
      if (!operation) return
      clearTimeout(operation.timer)
      pending.delete(message.id)
      message.error ? operation.reject(new Error(JSON.stringify(message.error))) : operation.done(message.result)
    } else if (message.method === "Runtime.exceptionThrown") runtimeErrors.push(message.params.exceptionDetails.text)
    else if (message.method === "Page.javascriptDialogOpening") dialogWaiter?.(message.params)
    else if (message.method === "Fetch.requestPaused") void intercept(message.params).catch((error) => interceptionErrors.push(error.message))
  })
  async function evaluate(expression) {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  async function waitFor(expression, label) {
    const end = Date.now() + 15000
    while (!await evaluate("Boolean(" + expression + ")")) {
      if (Date.now() > end) throw new Error("UI timeout: " + label + "\n" + await evaluate("document.body.innerText"))
      await delay(100)
    }
  }
  async function input(id, value) {
    await evaluate(`{const element=document.getElementById(${JSON.stringify(id)});const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));}`)
  }
  async function selectAction(trackingId, action) {
    await evaluate(`document.querySelector('[title="${trackingId}"]').closest('li').querySelector('button[aria-label^="${action}"]').click()`)
    await waitFor(`document.getElementById('${action === "Reposition" ? "reposition" : "removal"}-operator-id')`, action + " form")
  }
  async function submitConfirmation({ accept = true, holdMs = 0, beforeAccept } = {}) {
    let dialogTimer
    const dialog = new Promise((done, reject) => {
      dialogWaiter = done
      dialogTimer = setTimeout(() => reject(new Error("Native confirmation did not open")), 5000)
    })
    const clicked = evaluate(`document.querySelector('form button[type="submit"]').click()`)
    try {
      const opened = await dialog
      assert.equal(opened.type, "confirm")
      assert.ok(opened.message.includes("TrackingId:"))
      if (holdMs) await delay(holdMs)
      beforeAccept?.()
      await cdp("Page.handleJavaScriptDialog", { accept })
      await clicked
    } finally {
      clearTimeout(dialogTimer)
      dialogWaiter = null
    }
  }
  async function reopenLockedSheet() {
    await evaluate(`document.querySelector('[data-slot="sheet-close"]').click()`)
    await waitFor(`!document.querySelector('[data-slot="sheet-content"]')`, "sheet closed")
    await evaluate(`document.querySelector('button[aria-label^="View tracked bundles"]').click()`)
    await waitFor(`document.querySelector('[data-slot="sheet-content"]')`, "sheet reopened")
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('li button[aria-label^="Reposition"],li button[aria-label^="Remove"]')).every(button=>button.disabled)`), true)
    assert.equal(await evaluate(`document.querySelector('form button[type="submit"]')===null`), true)
  }
  async function screenshot(name) {
    // The sheet is present in the DOM before its opening transition finishes.
    await delay(400)
    const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
    writeFileSync(resolve(artifacts, name), Buffer.from(result.data, "base64"))
  }
  await cdp("Page.enable")
  await cdp("Runtime.enable")
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*" }] })
  await cdp("Page.navigate", { url: appUrl })
  await waitFor(`document.querySelector('button[aria-label^="View tracked bundles"]')?.getAttribute('aria-label').includes('10 active')`, "live tracking with owned simulator")
  await evaluate(`document.querySelector('button[aria-label^="View tracked bundles"]').click()`)
  await waitFor(`document.querySelector('[title="SIM-TRACK-HOLD"]')`, "bundle panel")
  await selectAction("SIM-TRACK-HOLD", "Reposition")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true)
  assert.equal(await evaluate(`document.querySelector('#reposition-zone option[value="SGRT1B"]').disabled`), true)
  assert.equal(await evaluate(`Boolean(document.querySelector('#reposition-zone option[value="LCH1A"]'))`), true)
  assert.equal(await evaluate(`Boolean(document.querySelector('#reposition-zone option[value="LCH2A"]'))`), false)
  await input("reposition-operator-id", " a1 ")
  await input("reposition-reason", " Simulator reposition smoke ")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true, "Destination is required")
  await input("reposition-zone", "SGRT1B")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true, "Same zone cannot submit")
  await input("reposition-zone", "SGRT2A")
  await waitFor(`!document.querySelector('form button[type="submit"]').disabled`, "complete reposition form")
  await screenshot("manual-reposition-form.png")
  await submitConfirmation({ accept: false })
  assert.equal(commandRequests.length, 0)
  checks.push("required fields, same-zone disabled, enabled hidden LCH, native cancel sends no POST")

  const changedState = structuredClone(initialState)
  changedState.Bundles.find((bundle) => bundle.TrackingId === "SIM-TRACK-HOLD").CurrentZone = "CCH1A"
  await submitConfirmation({ beforeAccept: () => { stateOverride = changedState } })
  await waitFor(`document.body.innerText.includes('No command was sent')`, "changed source abort")
  assert.equal(commandRequests.length, 0)
  stateOverride = null
  await delay(1500)
  checks.push("fresh source change aborts without a POST")

  const originalMap = await (await simulator.fetch(simulator.baseUrl + "/api/tracking/map")).json()
  const disabledMap = structuredClone(originalMap)
  disabledMap.Zones.find((zone) => zone.ZoneName === "SGRT2A").IsEnabled = false
  await submitConfirmation({ beforeAccept: () => { mapOverride = disabledMap } })
  await waitFor(`document.body.innerText.includes('not an enabled, unambiguous zone')`, "disabled destination abort")
  assert.equal(commandRequests.length, 0)
  mapOverride = null
  // Reload the test page after releasing the injected map so its metadata
  // cache is rebuilt from the simulator, not the synthetic disabled map.
  await cdp("Page.reload")
  await waitFor(`document.querySelector('button[aria-label^="View tracked bundles"]')?.getAttribute('aria-label').includes('10 active')`, "restored map after reload")
  await evaluate(`document.querySelector('button[aria-label^="View tracked bundles"]').click()`)
  await waitFor(`document.querySelector('[title="SIM-TRACK-HOLD"]')`, "reopened bundle panel")
  await selectAction("SIM-TRACK-HOLD", "Reposition")
  await input("reposition-operator-id", " a1 ")
  await input("reposition-reason", " Simulator reposition smoke ")
  await input("reposition-zone", "SGRT2A")
  await waitFor(`!document.querySelector('form button[type="submit"]').disabled`, "restored map")
  checks.push("fresh disabled destination aborts without a POST")

  let afterConfirmRequestIndex = 0
  await submitConfirmation({ holdMs: 4100, beforeAccept: () => {
    assert.equal(commandRequests.length, 0)
    afterConfirmRequestIndex = requests.length
    stateOverride = initialState
  } })
  await waitFor(`document.body.innerText.includes('Acceptance is not completion')`, "202 remains pending")
  assert.deepEqual(commandRequests, [{ TrackingId: "SIM-TRACK-HOLD", OperatorId: "a1", Reason: "Simulator reposition smoke", CurrentZone: "SGRT2A" }])
  assert.equal(await evaluate(`document.body.innerText.includes('101623999 is now reported at SGRT2A.')`), false)
  const preflightRequests = requests.slice(afterConfirmRequestIndex)
  const firstPost = preflightRequests.findIndex((request) => request.method === "POST")
  for (const endpoint of ["status", "capabilities", "map", "state"]) {
    assert.ok(preflightRequests.slice(0, firstPost).some((request) => request.path.endsWith("/api/tracking/" + endpoint)), "Fresh " + endpoint + " before POST")
  }
  await reopenLockedSheet()
  assert.equal(commandRequests.length, 1)
  await screenshot("manual-reposition-pending.png")
  stateOverride = null
  await waitFor(`document.body.innerText.includes('101623999 is now reported at SGRT2A.')`, "observed reposition success")
  const movedState = await (await simulator.fetch(simulator.baseUrl + "/api/tracking/state")).json()
  assert.equal(movedState.Bundles.find((bundle) => bundle.TrackingId === "SIM-TRACK-HOLD").CurrentZone, "SGRT2A")
  assert.deepEqual(movedState.Bundles.filter((bundle) => bundle.TrackingId !== "SIM-TRACK-HOLD"), initialState.Bundles.filter((bundle) => bundle.TrackingId !== "SIM-TRACK-HOLD"))
  checks.push("native confirmation open 4.1 seconds revalidates before exactly one four-field POST", "202 stays pending; shared lock survives close/reopen; fresh state confirms position")

  await selectAction("SIM-TRACK-HOLD", "Remove")
  await input("removal-operator-id", " a1 ")
  await input("removal-reason", " Simulator removal smoke ")
  await waitFor(`!document.querySelector('form button[type="submit"]').disabled`, "removal form")
  await submitConfirmation()
  await waitFor(`document.body.innerText.includes('101623999 is no longer in active tracking.')`, "observed removal success")
  assert.deepEqual(commandRequests[1], { TrackingId: "SIM-TRACK-HOLD", OperatorId: "a1", Reason: "Simulator removal smoke", Operation: "REMOVE" })
  const removedState = await (await simulator.fetch(simulator.baseUrl + "/api/tracking/state")).json()
  assert.deepEqual(removedState.Bundles, initialState.Bundles.filter((bundle) => bundle.TrackingId !== "SIM-TRACK-HOLD"))
  checks.push("removal regression passes and preserves all other bundles")

  await selectAction("SIM-DEMO-BUFFER-1", "Reposition")
  await input("reposition-operator-id", "a1")
  await input("reposition-reason", "Simulated uncertain response")
  await input("reposition-zone", "SGRT2A")
  await waitFor(`!document.querySelector('form button[type="submit"]').disabled`, "uncertainty test form")
  commandOverride = { status: 500, body: { error: "Simulated uncertain response" } }
  await submitConfirmation()
  await waitFor(`document.body.innerText.includes('It may have been accepted')`, "uncertain response")
  await reopenLockedSheet()
  assert.equal(commandRequests.length, 3)
  await evaluate(`window.__originalNow=Date.now;Date.now=()=>window.__originalNow()+61000`)
  await waitFor(`document.body.innerText.includes('Check state again (read only)')`, "verification deadline without waiting one minute")
  await screenshot("manual-reposition-uncertain.png")
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Check state again (read only)')).click()`)
  await delay(300)
  assert.equal(commandRequests.length, 3, "Read-only verification must not resend")
  await evaluate(`Date.now=window.__originalNow`)
  checks.push("uncertain response locks both actions; deadline offers read-only checking without resend")
  assert.ok(!requests.some((request) => request.path.endsWith("/api/tracking/reset")))
  assert.deepEqual(runtimeErrors, [])
  assert.deepEqual(interceptionErrors, [])
  console.log(JSON.stringify({ passed: true, checks, screenshots: ["dist/manual-reposition-form.png", "dist/manual-reposition-pending.png", "dist/manual-reposition-uncertain.png"] }, null, 2))
} finally {
  socket?.close()
  killOwned()
  await simulator?.close()
  await delay(1000)
  assert.ok(profile.startsWith(artifacts + sep + "manual-actions-profile-"))
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }) } catch (error) { console.error("Owned browser profile cleanup: " + error.message) }
  process.removeListener("exit", killOwned)
}
