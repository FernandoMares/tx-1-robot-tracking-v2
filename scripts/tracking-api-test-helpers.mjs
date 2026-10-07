// Test-only helpers: transpile actual sources in memory and start an owned
// loopback simulator. No configured backend or environment file is consumed.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const correctionPath = "/api/tracking/correct"

export function loadTypeScript(relativePath, { fetchImpl, env = {}, globals = {} } = {}) {
  const cache = new Map()
  function load(filename) {
    assert.ok(filename.startsWith(root + sep), "Only project modules may be loaded")
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
          specifier.startsWith("@/") ? root : dirname(filename),
          (specifier.startsWith("@/") ? specifier.slice(2) : specifier) + ".ts",
        ))
      },
      process: { env },
      fetch: fetchImpl ?? (() => { throw new Error("Unexpected network request") }),
      JSON, URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout,
      ...globals,
    }, { filename })
    return exports
  }
  return load(resolve(root, relativePath))
}

export function routeRequest(handler, body, { path = correctionPath, contentType = "application/json", raw } = {}) {
  return handler(new Request("http://hmi.invalid/tracking-api" + path, {
    method: "POST", headers: { "Content-Type": contentType }, body: raw ?? JSON.stringify(body),
  }), { params: Promise.resolve({ path: path.slice(1).split("/") }) })
}

async function unusedLoopbackPort() {
  const reservation = createServer()
  await new Promise((ready, reject) => {
    reservation.once("error", reject)
    reservation.listen({ host: "127.0.0.1", port: 0, exclusive: true }, ready)
  })
  const port = reservation.address().port
  await new Promise((closed, reject) => reservation.close((error) => error ? reject(error) : closed()))
  return port
}

export async function startSimulator({ disabledZones = "" } = {}) {
  const port = await unusedLoopbackPort()
  const baseUrl = "http://127.0.0.1:" + port
  const child = spawn(process.execPath, [resolve(root, "scripts/tracking-api-simulator.mjs")], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      TRACKING_SIMULATOR_HOST: "127.0.0.1",
      TRACKING_SIMULATOR_PORT: String(port),
      TRACKING_SIMULATOR_STEP_MS: "3600000",
      TRACKING_SIMULATOR_BUFFER_DEMO: "true",
      TRACKING_SIMULATOR_QMOS_CONNECTED: "true",
      TRACKING_SIMULATOR_OPC_CONNECTED: "true",
      TRACKING_SIMULATOR_LOG_REQUESTS: "false",
      TRACKING_SIMULATOR_DISABLED_ZONES: disabledZones,
    },
  })
  const kill = () => { if (child.exitCode === null && child.signalCode === null) child.kill() }
  process.once("exit", kill)
  const exited = new Promise((done) => child.once("exit", done))
  let output = ""
  let timer
  try {
    await new Promise((ready, reject) => {
      timer = setTimeout(() => reject(new Error("Simulator startup timed out: " + output)), 10000)
      child.once("error", reject)
      child.once("exit", (code) => reject(new Error("Simulator exited before startup (" + code + "): " + output)))
      child.stderr.on("data", (data) => { output = (output + data).slice(-16000) })
      child.stdout.on("data", (data) => {
        output = (output + data).slice(-16000)
        if (output.includes("Tracking API simulator running at " + baseUrl)) ready()
      })
    })
  } catch (error) {
    kill()
    process.removeListener("exit", kill)
    throw error
  } finally {
    clearTimeout(timer)
  }
  return {
    baseUrl,
    async fetch(url, options = {}) {
      assert.equal(new URL(url).origin, baseUrl, "Network requests must stay on the owned simulator")
      assert.equal(child.exitCode, null, "Simulator must still be running")
      return fetch(url, { ...options, redirect: "error", signal: options.signal ?? AbortSignal.timeout(5000) })
    },
    async close() {
      kill()
      let stopTimer
      try {
        await Promise.race([exited, new Promise((_, reject) => {
          stopTimer = setTimeout(() => reject(new Error("Simulator did not exit")), 5000)
        })])
      } finally {
        clearTimeout(stopTimer)
        process.removeListener("exit", kill)
      }
    },
  }
}
