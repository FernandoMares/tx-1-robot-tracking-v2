// Requires Node 22+ (built-in WebSocket), a Chromium browser, and a production
// standalone build made with NEXT_PUBLIC_PLANT_DATA_MODE=live and
// NEXT_PUBLIC_TRACKING_API_URL=/tracking-api. Run: node scripts/test-manual-actions-ui.mjs
// EDGE_PATH may point to Edge/Chrome/Chromium on any OS. The runner creates its
// own loopback simulator/HMI, blocks other page origins, and removes its profile.
// Add --layout-only to check Overview/Bundler/Stacker geometry without any command POST.
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
const layoutOnly = process.argv.includes("--layout-only")
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
  simulator = await startSimulator({ disabledZones: "LCH2A", allowReset: true })
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
  const resetRequests = []
  const runtimeErrors = []
  const interceptionErrors = []
  const cancelledReads = []
  const cancelledNetworkRequests = new Set()
  const checks = []
  const screenshots = []
  let sequence = 0
  let reloadGeneration = 0
  let reloadInProgress = false
  let dialogWaiter
  let stateOverride = null
  let mapOverride = null
  let commandOverride = null
  let capabilitiesOverride = null
  let resetOverride = null
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
    if (layoutOnly && request.method !== "GET") return cdp("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" })
    if (request.method === "POST" && url.pathname.endsWith("/api/tracking/correct")) {
      commandRequests.push(JSON.parse(request.postData))
      if (commandOverride) return fulfill(requestId, commandOverride.body, commandOverride.status)
    }
    if (request.method === "POST" && url.pathname.endsWith("/api/tracking/reset")) {
      resetRequests.push({ body: request.postData, headers: request.headers })
      if (resetOverride) return fulfill(requestId, resetOverride.body, resetOverride.status)
    }
    if (request.method === "GET" && url.pathname.endsWith("/api/tracking/state") && stateOverride) {
      return fulfill(requestId, typeof stateOverride === "function" ? await stateOverride() : stateOverride)
    }
    if (request.method === "GET" && url.pathname.endsWith("/api/tracking/map") && mapOverride) return fulfill(requestId, mapOverride)
    if (request.method === "GET" && url.pathname.endsWith("/api/tracking/capabilities") && capabilitiesOverride) return fulfill(requestId, capabilitiesOverride)
    return cdp("Fetch.continueRequest", { requestId })
  }
  async function handlePausedRequest(params) {
    const generation = reloadGeneration
    const startedDuringReload = reloadInProgress
    try {
      await intercept(params)
    } catch (error) {
      const url = new URL(params.request.url)
      const crossedReload = generation < reloadGeneration || startedDuringReload || reloadInProgress
      const isCancelledReadCandidate = params.request.method === "GET" && url.origin === appUrl &&
        /^\/tracking-api\/api\/(tracking|qmos)\//.test(url.pathname) &&
        (crossedReload || url.pathname === "/tracking-api/api/tracking/state") &&
        error.cdpCode === -32602 && error.cdpMessage === "Invalid InterceptionId." && params.networkId
      // Reload can cancel an intercepted poll while the test asynchronously
      // obtains its fixture. Chromium then rejects that now-expired Fetch id.
      // Require the matching Network.loadingFailed cancellation, not merely an
      // error string. State verification also intentionally aborts its GET when
      // the command resolves. Never suppress writes, other non-reload reads,
      // uncancelled requests, or any other protocol error.
      if (isCancelledReadCandidate) {
        const deadline = Date.now() + 200
        while (!cancelledNetworkRequests.has(params.networkId) && Date.now() < deadline) await delay(10)
        if (cancelledNetworkRequests.has(params.networkId)) {
          cancelledReads.push({
            method: params.request.method, path: url.pathname, networkId: params.networkId,
            reason: crossedReload ? "test-page-reload" : "browser-cancelled-state-read",
          })
          return
        }
      }
      interceptionErrors.push({
        method: params.request.method, path: url.pathname, networkId: params.networkId,
        generation, reloadGeneration, startedDuringReload, error: error.message,
      })
    }
  }
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const operation = pending.get(message.id)
      if (!operation) return
      clearTimeout(operation.timer)
      pending.delete(message.id)
      if (message.error) {
        const error = new Error(JSON.stringify(message.error))
        error.cdpCode = message.error.code
        error.cdpMessage = message.error.message
        operation.reject(error)
      } else operation.done(message.result)
    } else if (message.method === "Runtime.exceptionThrown") runtimeErrors.push(message.params.exceptionDetails.text)
    else if (message.method === "Page.javascriptDialogOpening") dialogWaiter?.(message.params)
    else if (message.method === "Page.frameNavigated" && !message.params.frame.parentId) reloadInProgress = false
    else if (message.method === "Network.loadingFailed" && message.params.canceled === true) cancelledNetworkRequests.add(message.params.requestId)
    else if (message.method === "Fetch.requestPaused") void handlePausedRequest(message.params)
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
    // A confirmed command refreshes tracking and briefly disables actions.
    // Wait for availability and click in the same browser task; clicking a
    // disabled button immediately after the success message is a no-op.
    await waitFor(`(()=>{const button=document.querySelector('[title="${trackingId}"]')?.closest('li')?.querySelector('button[aria-label^="${action}"]');if(!button||button.disabled)return false;button.click();return true})()`, action + " available")
    await waitFor(`document.getElementById('${action === "Reposition" ? "reposition" : "removal"}-operator-id')`, action + " form")
  }
  async function submitConfirmation({ accept = true, holdMs = 0, beforeAccept, kind = "manual" } = {}) {
    let dialogTimer
    const dialog = new Promise((done, reject) => {
      dialogWaiter = done
      dialogTimer = setTimeout(() => reject(new Error("Native confirmation did not open")), 5000)
    })
    const clicked = evaluate(`document.querySelector('form button[type="submit"]').click()`)
    try {
      const opened = await dialog
      assert.equal(opened.type, "confirm")
      assert.ok(opened.message.includes(kind === "reset" ? "RESET ALL TRACKING" : "TrackingId:"))
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
  const resetButton = `Array.from(document.querySelectorAll('button')).find(button=>['Reset tracking','Reset pending'].includes(button.textContent.trim()))`
  async function closeSheet() {
    await evaluate(`document.querySelector('[data-slot="sheet-close"]').click()`)
    await waitFor(`!document.querySelector('[data-slot="sheet-content"]')`, "sheet closed")
  }
  async function openReset() {
    await waitFor(`${resetButton} && !(${resetButton}).disabled`, "reset control available")
    await evaluate(`(${resetButton}).click()`)
    await waitFor(`document.querySelector('[data-slot="sheet-content"]')`, "reset sheet opened")
  }
  async function authorizeReset() {
    await input("tracking-reset-confirmation", "RESET")
    await evaluate(`{const box=document.querySelector('form input[type="checkbox"]');if(!box.checked)box.click()}`)
    await waitFor(`!document.querySelector('form button[type="submit"]').disabled`, "reset authorized and typed")
  }
  async function reloadTestPage(activeCount) {
    // Only used to separate injected test scenarios on this owned loopback HMI.
    // Reload is NOT a production recovery procedure for an unresolved command.
    await reloadOwnedPage()
    await waitFor(`document.querySelector('button[aria-label^="View tracked bundles"]')?.getAttribute('aria-label').includes('${activeCount} active')`, "fresh isolated test page")
  }
  async function reloadOwnedPage() {
    reloadGeneration += 1
    reloadInProgress = true
    await cdp("Page.reload")
  }
  async function screenshot(name) {
    // The sheet is present in the DOM before its opening transition finishes.
    await delay(400)
    const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
    writeFileSync(resolve(artifacts, name), Buffer.from(result.data, "base64"))
    screenshots.push("dist/" + name)
  }
  async function selectView(label, diagramLabel) {
    await evaluate(`Array.from(document.querySelectorAll('nav[aria-label="Plant views"] button')).find(button=>button.textContent.trim()===${JSON.stringify(label)} && button.getBoundingClientRect().width>0).click()`)
    await waitFor(`document.querySelector('[role="group"][aria-label=${JSON.stringify(diagramLabel)}]')`, label + " diagram")
  }
  async function diagramGeometry(label, logicalWidth) {
    return evaluate(`(()=>{
      const root=document.querySelector('[role="group"][aria-label=${JSON.stringify(label)}]');
      const bounds=root.getBoundingClientRect();const scale=bounds.width/${logicalWidth};
      const cards=Array.from(root.querySelectorAll('[data-zone-name]')).map(card=>{
        const rect=card.getBoundingClientRect();
        return {name:card.dataset.zoneName,x:(rect.left-bounds.left)/scale,y:(rect.top-bounds.top)/scale,width:rect.width/scale,height:rect.height/scale};
      });
      return {cards,width:bounds.width/scale,height:bounds.height/scale,scale};
    })()`)
  }
  function assertZoneNames(geometry, expected) {
    assert.deepEqual(geometry.cards.map(card=>card.name).sort(), [...expected].sort(), "Exactly the intended unique zones are rendered")
  }
  await cdp("Page.enable")
  await cdp("Runtime.enable")
  await cdp("Network.enable")
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*" }] })
  await cdp("Page.navigate", { url: appUrl })
  await waitFor(`document.querySelector('button[aria-label^="View tracked bundles"]')?.getAttribute('aria-label').includes('10 active')`, "live tracking with owned simulator")
  const overviewLabel = "Mirrored Exit Tracking physical overview"
  const bundlerLabel = "Bundler overview without the stacker branch"
  const stackerLabel = "Stacker overview without bundler or Bay 2 handoffs"
  const omittedZones = ["ERT1A", "ERT1B", "ERT2C", "ERT2D", "STRT1", "STRT2", "LFRT1", "LFRT2", "LFRT3"]
  const retainedZones = ["RTOUTA", "RTOUTB", "RTOUTC", "RTOUTD", "RTTY1", "RTTY2", "IMRT2", "CCH2A", "CCH2B", "SGRT2A", "SGRT2B", "CCH1A", "CCH1B", "SGRT1A", "SGRT1B", "SGRT1", "SGRT2", "NCCT1", "NCCT2", "IMRT1"]
  const stackerZones = [...omittedZones, "SGRT1", "SGRT2", "NCCT1", "NCCT2"]
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1350, deviceScaleFactor: 1, mobile: false })
  await waitFor(`document.querySelector('[role="group"][aria-label="${overviewLabel}"] [data-zone-name="RTOUTA"]')`, "Overview zones ready")
  const overviewGeometry = await diagramGeometry(overviewLabel, 1480)
  assertZoneNames(overviewGeometry, [...retainedZones, ...omittedZones])
  await selectView("Bundler", bundlerLabel)
  await waitFor(`Math.abs(document.querySelector('[role="group"][aria-label="${bundlerLabel}"]').getBoundingClientRect().width-1300)<1`, "Bundler desktop scale settled")
  const bundlerGeometry = await diagramGeometry(bundlerLabel, 1000)
  assertZoneNames(bundlerGeometry, retainedZones)
  const originalAnchor = overviewGeometry.cards.find(card=>card.name === "RTOUTA")
  const bundlerAnchor = bundlerGeometry.cards.find(card=>card.name === "RTOUTA")
  for (const card of bundlerGeometry.cards) {
    const original = overviewGeometry.cards.find(candidate=>candidate.name === card.name)
    for (const axis of ["x", "y"]) {
      assert.ok(Math.abs((card[axis]-bundlerAnchor[axis])-(original[axis]-originalAnchor[axis])) < 0.3, card.name + " preserves Overview " + axis + " relative position")
    }
    assert.ok(Math.abs(card.width-original.width)<0.3 && Math.abs(card.height-original.height)<0.3, card.name + " preserves card size")
    assert.ok(card.x>=0 && card.y>=0 && card.x+card.width<=bundlerGeometry.width+0.3 && card.y+card.height<=bundlerGeometry.height+0.3, card.name + " is not clipped by the canvas")
  }
  const handoffTop = bundlerGeometry.cards.find(card=>card.name === "SGRT2A").y
  for (const name of ["RTOUTA", "RTOUTB", "RTOUTC", "RTOUTD", "RTTY1", "RTTY2", "IMRT2"]) {
    assert.ok(Math.abs(bundlerGeometry.cards.find(card=>card.name === name).y-handoffTop)<=2, name + " aligns with SGRT2A")
  }
  for (const name of ["CCH1A", "CCH1B", "CCH2A", "CCH2B"]) {
    assert.ok(bundlerGeometry.cards.find(card=>card.name === name).height>=149, name + " retains five-row buffer height")
  }
  assert.equal(await evaluate(`Boolean(document.querySelector('section[aria-label="Bundler"] aside[aria-label^="Scale Weight Station, showing"]')) && Boolean(document.querySelector('section[aria-label="Bundler"] aside[aria-label="Robot 2 physical equipment context"]'))`), true)
  assert.equal(await evaluate(`document.querySelector('section[aria-label="Bundler"] [aria-label="SGRT2 bundle weight"]')?.textContent.includes('SGRT2 weight')`), true)
  assert.equal(await evaluate(`document.querySelector('section[aria-label="Bundler"]').innerText.includes('STK Stackers')`), false)
  await screenshot("bundler-overview-desktop.png")
  checks.push("Bundler contains exactly the 20 retained Overview zones, scale and Robot 2; removes only the nine blue-branch zones and retains hidden LCH behavior")
  checks.push("All retained cards preserve Overview relative geometry and size; RTOUT/RTTY/IMRT2 align with SGRT2A and CCH buffers retain five-row height")

  await cdp("Emulation.setDeviceMetricsOverride", { width: 760, height: 1250, deviceScaleFactor: 1, mobile: false })
  const bundlerViewport = `document.querySelector('[aria-label="Scrollable Bundler production diagram"]')`
  await waitFor(`(${bundlerViewport}).scrollWidth>(${bundlerViewport}).clientWidth && Math.abs(document.querySelector('[role="group"][aria-label="${bundlerLabel}"]').getBoundingClientRect().width-900)<1`, "Bundler narrow horizontal overflow")
  const narrowGeometry = await diagramGeometry(bundlerLabel, 1000)
  assertZoneNames(narrowGeometry, retainedZones)
  for (const card of narrowGeometry.cards) {
    const desktop = bundlerGeometry.cards.find(candidate=>candidate.name===card.name)
    assert.ok(Math.abs(card.x-desktop.x)<0.3 && Math.abs(card.y-desktop.y)<0.3, card.name + " retains narrow-screen geometry")
  }
  await evaluate(`(${bundlerViewport}).scrollLeft=0`)
  assert.equal(await evaluate(`(()=>{const viewport=(${bundlerViewport}).getBoundingClientRect();const card=document.querySelector('section[aria-label="Bundler"] [data-zone-name="RTOUTA"]').getBoundingClientRect();return card.left>=viewport.left && card.right<=viewport.right})()`), true)
  await screenshot("bundler-overview-narrow-left.png")
  await evaluate(`(${bundlerViewport}).scrollLeft=(${bundlerViewport}).scrollWidth`)
  await waitFor(`(${bundlerViewport}).scrollLeft>0`, "Bundler horizontal scroll changed")
  assert.equal(await evaluate(`(()=>{const viewport=(${bundlerViewport}).getBoundingClientRect();const card=document.querySelector('section[aria-label="Bundler"] [data-zone-name="SGRT2B"]').getBoundingClientRect();const robot=document.querySelector('aside[aria-label="Robot 2 physical equipment context"]').getBoundingClientRect();return card.left>=viewport.left && card.right<=viewport.right && robot.right<=viewport.right})()`), true, "Rightmost zones and Robot 2 are reachable by horizontal scroll")
  await screenshot("bundler-overview-narrow-right.png")
  checks.push("Narrow viewport keeps all 20 cards with unchanged geometry; horizontal scrolling reaches both Bundler outputs and rightmost zones/Robot 2 without clipping")

  await cdp("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false })
  await selectView("Stacker", stackerLabel)
  await waitFor(`Math.abs(document.querySelector('[role="group"][aria-label="${stackerLabel}"]').getBoundingClientRect().width-1435.2)<1`, "Stacker desktop scale settled at its 1.3 maximum")
  const stackerGeometry = await diagramGeometry(stackerLabel, 1104)
  assertZoneNames(stackerGeometry, stackerZones)
  assert.ok(Math.abs(stackerGeometry.height-440)<0.3, "Stacker crops the unused upper area to a 440px canvas")
  assert.ok(Math.abs(stackerGeometry.scale-1.3)<0.001)
  const overviewStackerAnchor = overviewGeometry.cards.find(card=>card.name === "ERT1A")
  const stackerAnchor = stackerGeometry.cards.find(card=>card.name === "ERT1A")
  for (const card of stackerGeometry.cards) {
    const original = overviewGeometry.cards.find(candidate=>candidate.name === card.name)
    for (const axis of ["x", "y"]) {
      assert.ok(Math.abs((card[axis]-stackerAnchor[axis])-(original[axis]-overviewStackerAnchor[axis]))<0.3, card.name + " preserves Overview " + axis + " relative position in Stacker")
    }
    assert.ok(Math.abs(card.width-original.width)<0.3 && Math.abs(card.height-original.height)<0.3, card.name + " preserves Overview card size in Stacker")
    assert.ok(card.x>=0 && card.y>=0 && card.x+card.width<=stackerGeometry.width+0.3 && card.y+card.height<=stackerGeometry.height+0.3, card.name + " is not clipped by the Stacker canvas")
  }
  assert.equal(await evaluate(`(()=>{const root=document.querySelector('section[aria-label="Stacker"]');return Boolean(root.querySelector('aside[aria-label^="Scale Weight Station, showing"]')) && root.querySelector('[aria-label="SGRT2 bundle weight"]')?.textContent.includes('SGRT2 weight') && root.innerText.includes('STK Stackers')})()`), true)
  assert.equal(await evaluate(`(()=>{const root=document.querySelector('section[aria-label="Stacker"]');return Boolean(root.querySelector('aside[aria-label="Robot 2 physical equipment context"]')) || /BUND Bundler|LMD [123]|First tracking section|Second tracking section/i.test(root.innerText)})()`), false)
  await screenshot("stacker-overview-desktop.png")
  checks.push("New Stacker tab contains exactly 13 Overview zones and the SGRT2 scale; excludes Bundler, RTTY, IMRT, Bay 2 columns, Robot 2 and old LMD equipment labels")
  checks.push("Stacker retains Overview relative card geometry and size inside its 1104x440 cropped canvas, with a maximum desktop scale of 1.3")

  await cdp("Emulation.setDeviceMetricsOverride", { width: 760, height: 1100, deviceScaleFactor: 1, mobile: false })
  const stackerViewport = `document.querySelector('[aria-label="Scrollable Stacker production diagram"]')`
  await waitFor(`(${stackerViewport}).scrollWidth>(${stackerViewport}).clientWidth && Math.abs(document.querySelector('[role="group"][aria-label="${stackerLabel}"]').getBoundingClientRect().width-993.6)<1`, "Stacker narrow horizontal overflow at minimum scale")
  const stackerNarrowGeometry = await diagramGeometry(stackerLabel, 1104)
  assertZoneNames(stackerNarrowGeometry, stackerZones)
  assert.ok(Math.abs(stackerNarrowGeometry.scale-0.9)<0.001)
  for (const card of stackerNarrowGeometry.cards) {
    const desktop = stackerGeometry.cards.find(candidate=>candidate.name === card.name)
    for (const property of ["x", "y", "width", "height"]) {
      assert.ok(Math.abs(card[property]-desktop[property])<0.3, card.name + " retains narrow Stacker " + property)
    }
  }
  await evaluate(`(${stackerViewport}).scrollLeft=0`)
  assert.equal(await evaluate(`(()=>{const viewport=(${stackerViewport}).getBoundingClientRect();return ['ERT1A','ERT2D'].every(name=>{const card=document.querySelector('section[aria-label="Stacker"] [data-zone-name="'+name+'"]').getBoundingClientRect();return card.left>=viewport.left && card.right<=viewport.right})})()`), true, "All four Stacker sources are reachable at the left edge")
  await screenshot("stacker-overview-narrow-left.png")
  await evaluate(`(${stackerViewport}).scrollLeft=(${stackerViewport}).scrollWidth`)
  await waitFor(`(${stackerViewport}).scrollLeft>0`, "Stacker horizontal scroll changed")
  assert.equal(await evaluate(`(()=>{const viewport=(${stackerViewport}).getBoundingClientRect();const root=document.querySelector('section[aria-label="Stacker"]');const elements=['SGRT1','SGRT2','NCCT1','NCCT2'].map(name=>root.querySelector('[data-zone-name="'+name+'"]'));elements.push(root.querySelector('aside[aria-label^="Scale Weight Station, showing"]'));return elements.every(element=>{const rect=element.getBoundingClientRect();return rect.left>=viewport.left && rect.right<=viewport.right})})()`), true, "Both SGRT/NCCT columns and the scale are reachable at the right edge")
  await screenshot("stacker-overview-narrow-right.png")
  checks.push("Narrow Stacker keeps all 13 card geometries; horizontal scrolling exposes all four source slots and the complete scale/SGRT/NCCT group")

  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await selectView("Stackers", "Stackers official worksheet layout")
  const legacyStackersGeometry = await diagramGeometry("Stackers official worksheet layout", 1440)
  assertZoneNames(legacyStackersGeometry, [...stackerZones, "IMRT1"])
  assert.equal(await evaluate(`(()=>{const root=document.querySelector('section[aria-label="Stackers"]');return ['LMD 1','LMD 2','LMD 3','Bay 2 handoff'].every(label=>root.textContent.includes(label))})()`), true)
  checks.push("Existing plural Stackers tab remains separate and unchanged, retaining its 14 zones, IMRT1 handoff and LMD equipment labels")
  await selectView("Plant Overview", overviewLabel)
  assertZoneNames(await diagramGeometry(overviewLabel, 1480), [...retainedZones, ...omittedZones])
  assert.equal(commandRequests.length, 0)
  assert.equal(resetRequests.length, 0)
  assert.equal(requests.some(request=>request.method!=="GET"), false, "Layout navigation must remain read-only")
  checks.push("Returning from Bundler, Stacker and legacy Stackers to Overview restores all 29 original zones; all layout checks sent GET requests only")

  if (!layoutOnly) {
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
  await reloadOwnedPage()
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
  assert.equal(await evaluate(`(${resetButton}).disabled`), true, "Pending manual action must block global reset")
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
  const retainedRemoved = {
    ...movedState.Bundles.find((bundle) => bundle.TrackingId === "SIM-TRACK-HOLD"),
    Status: "REMOVED", CurrentZone: null, OccupiedZones: [],
  }
  // Model the observed backend variant: the selected record remains in /state
  // as REMOVED with cleared occupancy after the real simulator REMOVE succeeds.
  let observedRetainedState = false
  stateOverride = async () => {
    const state = await (await simulator.fetch(simulator.baseUrl + "/api/tracking/state")).json()
    if (!state.Bundles.some((bundle) => bundle.TrackingId === retainedRemoved.TrackingId)) {
      state.Bundles.push(retainedRemoved)
      observedRetainedState = true
    }
    return state
  }
  await submitConfirmation()
  await waitFor(`document.body.innerText.includes('101623999 is no longer in active tracking.')`, "observed removal success")
  assert.deepEqual(commandRequests[1], { TrackingId: "SIM-TRACK-HOLD", OperatorId: "a1", Reason: "Simulator removal smoke", Operation: "REMOVE" })
  const removedState = await (await simulator.fetch(simulator.baseUrl + "/api/tracking/state")).json()
  assert.deepEqual(removedState.Bundles, initialState.Bundles.filter((bundle) => bundle.TrackingId !== "SIM-TRACK-HOLD"))
  assert.equal(observedRetainedState, true, "Success must be observed with the REMOVED record retained")
  await waitFor(`document.querySelector('button[aria-label^="View tracked bundles"]')?.getAttribute('aria-label').includes('9 active')`, "REMOVED excluded from active count")
  assert.equal(await evaluate(`document.querySelector('[data-slot="sheet-content"] li [title="SIM-TRACK-HOLD"]')===null`), true)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('dl[aria-label="Current tracking metrics"] dt')).find(dt=>dt.textContent==='Active tracked bundles').parentElement.querySelector('dd').textContent`), "9")
  stateOverride = null
  checks.push("removal preserves other bundles; retained REMOVED with empty occupancy confirms success and disappears from the active list and KPI")

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
  assert.equal(await evaluate(`(${resetButton}).disabled`), true, "Uncertain manual action must block reset")
  await evaluate(`window.__originalNow=Date.now;Date.now=()=>window.__originalNow()+61000`)
  await waitFor(`document.body.innerText.includes('Check state again (read only)')`, "verification deadline without waiting one minute")
  await screenshot("manual-reposition-uncertain.png")
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Check state again (read only)')).click()`)
  await delay(300)
  assert.equal(commandRequests.length, 3, "Read-only verification must not resend")
  await evaluate(`Date.now=window.__originalNow`)
  checks.push("uncertain response locks both actions; deadline offers read-only checking without resend")
  assert.equal(resetRequests.length, 0, "Manual action tests must never send reset")

  // Reset cases are independent of the preceding synthetic manual failure.
  // The real simulator still has exactly the nine records captured above.
  commandOverride = null
  await reloadTestPage(9)
  await openReset()
  await waitFor(`document.getElementById('tracking-reset-confirmation')`, "reset confirmation input")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true)
  await input("tracking-reset-confirmation", "RESET")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true, "Authorization acknowledgement is required")
  await evaluate(`document.querySelector('form input[type="checkbox"]').click()`)
  await input("tracking-reset-confirmation", "reset")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]').disabled`), true, "Exact uppercase RESET is required")
  await authorizeReset()
  await screenshot("tracking-reset-confirmation.png")
  await submitConfirmation({ kind: "reset", accept: false })
  assert.equal(resetRequests.length, 0)
  checks.push("global reset requires typed RESET and maintenance acknowledgement; native cancel sends no POST")

  const noResetCapabilities = await (await simulator.fetch(simulator.baseUrl + "/api/tracking/capabilities")).json()
  noResetCapabilities.commands = noResetCapabilities.commands.filter((command) => !command.includes("/api/tracking/reset"))
  await submitConfirmation({ kind: "reset", beforeAccept: () => { capabilitiesOverride = noResetCapabilities } })
  await waitFor(`document.body.innerText.includes('no longer advertises POST /api/tracking/reset')`, "fresh reset capability rejection")
  assert.equal(resetRequests.length, 0)
  capabilitiesOverride = null
  await reloadTestPage(9)
  await openReset()
  await authorizeReset()
  const changedResetScope = structuredClone(removedState)
  changedResetScope.Bundles.pop()
  await submitConfirmation({ kind: "reset", beforeAccept: () => { stateOverride = changedResetScope } })
  await waitFor(`document.body.innerText.includes('set of active bundles changed while confirming')`, "changed reset scope rejection")
  assert.equal(resetRequests.length, 0)
  stateOverride = null
  checks.push("fresh reset capability removal and changed active scope each prevent POST")

  await reloadTestPage(9)
  await openReset()
  await authorizeReset()
  const beforeResetPreflight = requests.length
  await submitConfirmation({ kind: "reset", beforeAccept: () => { stateOverride = removedState } })
  await waitFor(`document.body.innerText.includes('Reset request accepted') && document.body.innerText.includes('Acceptance is not completion')`, "accepted reset stays pending")
  assert.equal(resetRequests.length, 1)
  assert.ok(resetRequests[0].body === undefined || resetRequests[0].body === "", "Reset must not send a JSON body")
  assert.equal(new Headers(resetRequests[0].headers).get("X-Tracking-Reset-Confirmation"), "RESET")
  const resetPreflight = requests.slice(beforeResetPreflight)
  const resetPostIndex = resetPreflight.findIndex((request) => request.method === "POST")
  for (const endpoint of ["status", "capabilities", "state"]) {
    assert.ok(resetPreflight.slice(0, resetPostIndex).some((request) => request.path.endsWith("/api/tracking/" + endpoint)), "Fresh " + endpoint + " before reset POST")
  }
  const emptySimulatorState = await (await simulator.fetch(simulator.baseUrl + "/api/tracking/state")).json()
  assert.equal(emptySimulatorState.Bundles.length, 0, "Only the owned simulator was actually reset")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]')===null`), true)
  await screenshot("tracking-reset-pending.png")
  await closeSheet()
  await evaluate(`document.querySelector('button[aria-label^="View tracked bundles"]').click()`)
  await waitFor(`document.querySelector('[data-slot="sheet-content"] li button[aria-label^="Reposition"]')`, "manual panel while reset pending")
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('li button[aria-label^="Reposition"],li button[aria-label^="Remove"]')).every(button=>button.disabled)`), true)
  await closeSheet()
  await openReset()
  await waitFor(`document.body.innerText.includes('Reset request accepted')`, "pending reset survives close/reopen")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]')===null`), true)
  assert.equal(resetRequests.length, 1)
  assert.equal(commandRequests.length, 3)
  stateOverride = null
  await waitFor(`document.body.innerText.includes('subsequent API snapshot reports no active bundles')`, "fresh cleared state observed after reset")
  await waitFor(`document.querySelector('button[aria-label^="View tracked bundles"]')?.getAttribute('aria-label').includes('0 active')`, "zero active bundles after reset")
  assert.equal(resetRequests.length, 1)
  checks.push("one bodyless reset receives 202 but remains pending; shared lock blocks manual actions and survives close/reopen; fresh empty state confirms observation")

  // A distinct injected response-loss scenario. The actual owned backend stays
  // empty; the test supplies a nonempty baseline and intercepts the next POST.
  stateOverride = removedState
  resetOverride = { status: 500, body: { error: "Simulated reset response uncertainty" } }
  await reloadTestPage(9)
  await openReset()
  await authorizeReset()
  await submitConfirmation({ kind: "reset" })
  await waitFor(`document.body.innerText.includes('reset may already have been accepted')`, "uncertain reset result")
  assert.equal(resetRequests.length, 2)
  await closeSheet()
  await openReset()
  await waitFor(`document.body.innerText.includes('reset may already have been accepted')`, "uncertain reset survives close/reopen")
  assert.equal(await evaluate(`document.querySelector('form button[type="submit"]')===null`), true)
  await evaluate(`window.__originalNow=Date.now;Date.now=()=>window.__originalNow()+61000`)
  await waitFor(`document.body.innerText.includes('Check state again (read only)')`, "reset verification deadline")
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Check state again (read only)')).click()`)
  await delay(300)
  assert.equal(resetRequests.length, 2, "Read-only reset verification must not resend")
  assert.equal(commandRequests.length, 3)
  await evaluate(`Date.now=window.__originalNow`)
  checks.push("uncertain reset keeps the local lock after close/reopen; verification deadline allows GET only and never retries POST")
  }
  assert.deepEqual(runtimeErrors, [])
  assert.deepEqual(interceptionErrors, [])
  console.log(JSON.stringify({ passed: true, mode: layoutOnly ? "layout-only (GET requests only)" : "layout and manual actions", checks, cancelledReads, screenshots }, null, 2))
} finally {
  socket?.close()
  killOwned()
  await simulator?.close()
  await delay(1000)
  assert.ok(profile.startsWith(artifacts + sep + "manual-actions-profile-"))
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }) } catch (error) { console.error("Owned browser profile cleanup: " + error.message) }
  process.removeListener("exit", killOwned)
}
