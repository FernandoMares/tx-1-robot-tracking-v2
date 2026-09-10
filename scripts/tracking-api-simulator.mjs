import { createServer } from "node:http"

function positiveInteger(value, fallback, minimum) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback
}

function booleanSetting(value, fallback) {
  return value === undefined ? fallback : value.trim().toLowerCase() !== "false"
}

const HOST = process.env.TRACKING_SIMULATOR_HOST?.trim() || "127.0.0.1"
const PORT = positiveInteger(process.env.TRACKING_SIMULATOR_PORT, 8085, 1)
const STEP_MS = positiveInteger(process.env.TRACKING_SIMULATOR_STEP_MS, 5000, 500)
const QMOS_CONNECTED = booleanSetting(process.env.TRACKING_SIMULATOR_QMOS_CONNECTED, true)
const OPC_CONNECTED = booleanSetting(process.env.TRACKING_SIMULATOR_OPC_CONNECTED, true)
const LOG_REQUESTS = booleanSetting(process.env.TRACKING_SIMULATOR_LOG_REQUESTS, false)
const SCENARIO = "LOCAL_HMI_SIMULATOR"
const API_VERSION = "sim-1.0.0"
const STARTED_AT = Date.now()
const CYCLE_STEPS = 7
const MAX_REQUEST_BODY_BYTES = 64 * 1024
const bundleCorrections = new Map()
let nextCorrectionEventId = 100_000

const qmosMillOrders = [
  {
    FrpId: 51001,
    MillOrder: "SIM-MO-001",
    HeatNo: "SIM-HEAT-01",
    WorkOrder: 71001,
    Grade: "A36",
    Size: "2 x 2",
    Weight: 1250,
    Length: "40 FT",
    ProductWidth: null,
    ProductThickness: null,
  },
  {
    FrpId: 51002,
    MillOrder: "SIM-MO-002",
    HeatNo: "SIM-HEAT-02",
    WorkOrder: 71002,
    Grade: "A572-50",
    Size: "3 x 3",
    Weight: 1475.5,
    Length: "48 FT",
    ProductWidth: 3,
    ProductThickness: 0.25,
  },
  {
    FrpId: 51003,
    MillOrder: "SIM-MO-003",
    HeatNo: "SIM-HEAT-03",
    WorkOrder: 71003,
    Grade: "A992",
    Size: "4 x 4",
    Weight: 1820,
    Length: "60 FT",
    ProductWidth: 4,
    ProductThickness: 0.375,
  },
]

function zone(ZoneId, ZoneName, ZoneType, DisplayOrder, Capacity, Description) {
  return { ZoneId, ZoneName, ZoneType, DisplayOrder, Capacity, Description, IsEnabled: true }
}

const zones = [
  zone(101, "SIM_ENTRY", "SOURCE", 10, 1, "Sanitized simulator entry zone."),
  zone(102, "SIM_TRANSFER", "PROCESS", 20, 1, "Sanitized simulator transfer zone."),
  zone(103, "SIM_STACKER", "PROCESS", 30, 1, "Sanitized simulator stacker zone."),
  zone(104, "SIM_BAY", "DESTINATION", 40, 1, "Sanitized simulator destination bay."),
  zone(105, "SIM_HOLD", "PROCESS", 50, 2, "Sanitized simulator holding zone."),
]

const movingRoute = zones.slice(0, 4)
const routes = movingRoute.slice(0, -1).map((source, index) => {
  const destination = movingRoute[index + 1]
  return {
    RouteId: 201 + index,
    RouteName: "SIM_ROUTE_" + (index + 1),
    SourceZoneId: source.ZoneId,
    SourceZone: source.ZoneName,
    DestinationZoneId: destination.ZoneId,
    DestinationZone: destination.ZoneName,
    Description: "Sanitized simulator route.",
    IsEnabled: true,
  }
})

function dotNetDate(timestamp = Date.now()) {
  return "/Date(" + timestamp + ")/"
}

function currentStep(now = Date.now()) {
  return Math.max(0, Math.floor((now - STARTED_AT) / STEP_MS))
}

function cycleNumber(step) {
  return Math.floor(step / CYCLE_STEPS) + 1
}

function trackingId(step) {
  return "SIM-TRACK-" + String(cycleNumber(step)).padStart(6, "0")
}

function stepTimestamp(step) {
  return STARTED_AT + step * STEP_MS
}

function makeBundle(options) {
  const correlated = options.correlationStatus === "MATCHED"
  return {
    ScenarioName: SCENARIO,
    TrackingId: options.trackingId,
    BundleId: correlated ? options.bundleId : null,
    SourceArea: "SIM",
    CurrentZone: options.currentZone,
    RouteName: options.routeName,
    Weight: correlated ? 1250 : null,
    BundleType: correlated ? "SIMULATED" : "UNKNOWN",
    L2Id: options.l2Id,
    TagNumber: correlated ? options.l2Id : null,
    Destination: "SIM_DESTINATION",
    MillOrder1: correlated ? "SIM-MO-001" : null,
    PieceCount1: correlated ? 20 : null,
    MillOrder2: null,
    PieceCount2: null,
    MillOrder3: null,
    PieceCount3: null,
    MillOrder4: null,
    PieceCount4: null,
    MillOrder5: null,
    PieceCount5: null,
    Disposition: null,
    HoldCode: null,
    PrinterId: null,
    TagCopy: null,
    Status: options.status,
    CorrelationStatus: options.correlationStatus,
    ProductionMode: "SIMULATION",
    CreationSectionGroup: "SIM",
    CreationSignalName: "SIM_BUNDLE_CREATED",
    CreatedUtc: dotNetDate(options.createdUtc),
    LastUpdateUtc: dotNetDate(options.lastUpdateUtc),
  }
}

function movingBundle(step) {
  const phase = step % CYCLE_STEPS
  if (phase === CYCLE_STEPS - 1) return null

  const zoneIndex = Math.min(Math.max(phase - 1, 0), movingRoute.length - 1)
  const waiting = phase === 0 || !QMOS_CONNECTED
  const complete = phase === 5
  const cycleStart = step - phase

  return makeBundle({
    trackingId: trackingId(step),
    bundleId: "SIM-BUNDLE-" + String(cycleNumber(step)).padStart(4, "0"),
    currentZone: movingRoute[zoneIndex].ZoneName,
    routeName: complete ? null : "SIM_ROUTE_TO_BAY",
    status: waiting ? "WAITING_QMOS_ID" : complete ? "TAGGED_COMPLETE" : "TRACKING",
    correlationStatus: waiting ? "UNMATCHED" : "MATCHED",
    createdUtc: stepTimestamp(cycleStart),
    lastUpdateUtc: stepTimestamp(step),
    l2Id: 10000 + cycleNumber(step),
  })
}

function staticBundle() {
  return makeBundle({
    trackingId: "SIM-TRACK-HOLD",
    bundleId: "SIM-BUNDLE-HOLD",
    currentZone: "SIM_HOLD",
    routeName: null,
    status: "TRACKING",
    correlationStatus: "MATCHED",
    createdUtc: STARTED_AT,
    lastUpdateUtc: STARTED_AT,
    l2Id: 20001,
  })
}

function bundles(now = Date.now()) {
  const moving = movingBundle(currentStep(now))
  return [staticBundle(), ...(moving ? [moving] : [])].map((bundle) => {
    const correction = bundleCorrections.get(bundle.TrackingId)
    if (!correction) return bundle

    return {
      ...bundle,
      MillOrder1: correction.MillOrder1,
      LastUpdateUtc: dotNetDate(correction.updatedAt),
    }
  })
}

function trackingState(now = Date.now()) {
  const step = currentStep(now)
  return {
    ScenarioName: SCENARIO,
    LastUpdateUtc: dotNetDate(stepTimestamp(step)),
    Bundles: bundles(now),
  }
}

function eventForStep(step) {
  const phase = step % CYCLE_STEPS
  const zoneIndex = Math.min(Math.max(phase - 1, 0), movingRoute.length - 1)
  const zoneName = phase === CYCLE_STEPS - 1 ? null : movingRoute[zoneIndex].ZoneName
  const eventTypes = [
    "BUNDLE_CREATED",
    QMOS_CONNECTED ? "QMOS_CORRELATED" : "QMOS_WAITING",
    "ZONE_CHANGED",
    "ZONE_CHANGED",
    "ZONE_CHANGED",
    "TAGGED_COMPLETE",
    "BUNDLE_REMOVED",
  ]

  return {
    EventId: step + 1,
    ScenarioName: SCENARIO,
    EventType: eventTypes[phase],
    TrackingId: trackingId(step),
    BundleId:
      phase === 0 || !QMOS_CONNECTED
        ? null
        : "SIM-BUNDLE-" + String(cycleNumber(step)).padStart(4, "0"),
    SourceArea: "SIM",
    FromZone:
      phase >= 2 && phase <= 4
        ? movingRoute[zoneIndex - 1].ZoneName
        : phase >= 5
          ? movingRoute[movingRoute.length - 1].ZoneName
          : null,
    ToZone: zoneName,
    CurrentZone: zoneName,
    CorrelationStatus: phase === 0 || !QMOS_CONNECTED ? "UNMATCHED" : "MATCHED",
    EventUtc: dotNetDate(stepTimestamp(step)),
  }
}

function recentEvents(now = Date.now()) {
  const lastStep = currentStep(now)
  const firstStep = Math.max(0, lastStep - 49)
  const Events = []
  for (let step = lastStep; step >= firstStep; step -= 1) Events.push(eventForStep(step))
  return { ScenarioName: SCENARIO, GeneratedUtc: dotNetDate(now), Events }
}

function opcStatus(now = Date.now()) {
  const timestamp = dotNetDate(now)
  return {
    Enabled: true,
    Connected: OPC_CONNECTED,
    ConfigurationFile: "simulator.json",
    SignalScenarioName: SCENARIO,
    ConnectedUtc: OPC_CONNECTED ? dotNetDate(STARTED_AT) : null,
    DisconnectedUtc: OPC_CONNECTED ? null : timestamp,
    LastError: OPC_CONNECTED ? null : "Simulated OPC disconnection.",
    Healthy: OPC_CONNECTED,
    BadSignalCount: OPC_CONNECTED ? 0 : 1,
    DegradedGroupCount: OPC_CONNECTED ? 0 : 1,
    DegradedGroups: OPC_CONNECTED ? [] : ["SIMULATOR"],
    Signals: [
      {
        SignalName: "SIM_BUNDLE_PRESENT",
        Direction: "READ",
        OpcAddress: "SIM.BUNDLE_PRESENT",
        Value: Boolean(movingBundle(currentStep(now))),
        QualityGood: OPC_CONNECTED,
        OpcTimestamp: timestamp,
        LastReadUtc: timestamp,
        LastGoodReadUtc: OPC_CONNECTED ? timestamp : null,
        LastChangeUtc: dotNetDate(stepTimestamp(currentStep(now))),
        LastWriteUtc: null,
        QualityChangedUtc: null,
        ConsecutiveBadReads: OPC_CONNECTED ? 0 : 1,
        Error: OPC_CONNECTED ? null : "Simulated bad quality.",
      },
    ],
  }
}

function capabilities() {
  return {
    apiVersion: API_VERSION,
    transport: "HTTP/JSON",
    hmiReadsDatabaseDirectly: false,
    reads: [
      "/api/tracking/status",
      "/api/tracking/capabilities",
      "/api/tracking/map",
      "/api/tracking/state",
      "/api/tracking/bundles/{trackingId}",
      "/api/tracking/opc",
      "/api/tracking/events/recent",
      "/api/qmos/status",
      "/api/qmos/mill-orders",
    ],
    commands: ["/api/tracking/correct"],
    engineeringOpc: [],
    qmosCommands: [],
    engineeringSimulation: [],
  }
}

function trackingMap() {
  return {
    ScenarioName: SCENARIO,
    GeneratedUtc: dotNetDate(STARTED_AT),
    Zones: zones,
    Routes: routes,
    Destinations: [
      {
        DestinationId: 301,
        DestinationCode: "SIM_DESTINATION",
        DestinationName: "Sanitized simulator destination",
        DestinationType: "SIMULATION",
        IsEnabled: true,
      },
    ],
    CreationRules: [
      {
        CreationRuleId: 401,
        RuleName: "SIM_CREATE_BUNDLE",
        SourceArea: "SIM",
        InitialZoneId: zones[0].ZoneId,
        InitialZone: zones[0].ZoneName,
        TriggerType: "TIMER",
        SignalName: "SIM_BUNDLE_CREATED",
        SignalEdge: "RISING",
        ConditionJson: null,
        IsConfirmed: true,
        IsEnabled: true,
        Notes: "Local sanitized simulator rule.",
      },
    ],
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Private-Network": "true",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    "Cross-Origin-Resource-Policy": "cross-origin",
  })
  response.end(body)
}

function sendOptions(response) {
  response.writeHead(204, {
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Private-Network": "true",
    "Content-Length": "0",
    "Cross-Origin-Resource-Policy": "cross-origin",
  })
  response.end()
}

async function readJsonBody(request) {
  const chunks = []
  let byteLength = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    byteLength += buffer.length
    if (byteLength > MAX_REQUEST_BODY_BYTES) throw new Error("Request body is too large")
    chunks.push(buffer)
  }

  const text = Buffer.concat(chunks).toString("utf8")
  return JSON.parse(text)
}

function sanitizeCorrection(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null

  const fields = ["TrackingId", "OperatorId", "Reason", "MillOrder1"]
  const sanitized = {}
  for (const field of fields) {
    if (typeof value[field] !== "string" || value[field].trim().length === 0) return null
    sanitized[field] = value[field].trim()
  }

  return sanitized
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET"
  const url = new URL(request.url ?? "/", "http://" + (request.headers.host ?? HOST + ":" + PORT))
  if (LOG_REQUESTS) console.log(new Date().toISOString() + " " + method + " " + url.pathname)

  if (method === "OPTIONS") return sendOptions(response)

  const now = Date.now()
  if (method === "POST") {
    if (url.pathname !== "/api/tracking/correct") {
      return sendJson(response, 404, { error: "Endpoint not found", path: url.pathname })
    }

    const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase()
    if (contentType !== "application/json") {
      return sendJson(response, 415, { error: "Content-Type must be application/json" })
    }

    let body
    try {
      body = await readJsonBody(request)
    } catch {
      return sendJson(response, 400, { error: "A valid JSON request body is required" })
    }

    const correction = sanitizeCorrection(body)
    if (!correction) {
      return sendJson(response, 400, {
        error: "TrackingId, OperatorId, Reason, and MillOrder1 must be non-empty strings",
      })
    }

    if (!bundles(now).some((bundle) => bundle.TrackingId === correction.TrackingId)) {
      return sendJson(response, 404, {
        error: "Bundle not found",
        trackingId: correction.TrackingId,
      })
    }

    const eventId = nextCorrectionEventId
    nextCorrectionEventId += 1
    bundleCorrections.set(correction.TrackingId, {
      MillOrder1: correction.MillOrder1,
      updatedAt: now,
    })

    return sendJson(response, 202, {
      accepted: true,
      eventId,
      eventType: "MANUAL_CORRECTION",
      trackingId: correction.TrackingId,
    })
  }

  if (method !== "GET") return sendJson(response, 405, { error: "Method not allowed" })

  const endpoints = {
    "/api/tracking/status": () => ({
      running: true,
      service: "MaterialTrackingServiceSimulator",
      apiVersion: API_VERSION,
      scenario: SCENARIO,
      utc: dotNetDate(now),
    }),
    "/api/tracking/capabilities": capabilities,
    "/api/tracking/map": trackingMap,
    "/api/tracking/state": () => trackingState(now),
    "/api/tracking/opc": () => opcStatus(now),
    "/api/tracking/events/recent": () => recentEvents(now),
    "/api/qmos/status": () => ({ enabled: true, connected: QMOS_CONNECTED }),
    "/api/qmos/mill-orders": () => {
      const max = positiveInteger(url.searchParams.get("max"), 20, 1)
      return qmosMillOrders.slice(0, max)
    },
  }

  const endpoint = endpoints[url.pathname]
  if (endpoint) return sendJson(response, 200, endpoint())

  const match = url.pathname.match(/^\/api\/tracking\/bundles\/([^/]+)$/)
  if (match) {
    const id = decodeURIComponent(match[1])
    const bundle = bundles(now).find((item) => item.TrackingId === id)
    return bundle
      ? sendJson(response, 200, bundle)
      : sendJson(response, 404, { error: "Bundle not found", trackingId: id })
  }

  return sendJson(response, 404, { error: "Endpoint not found", path: url.pathname })
})

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("Port " + PORT + " is already in use. Stop the other service or set TRACKING_SIMULATOR_PORT.")
  } else {
    console.error(error)
  }
  process.exitCode = 1
})

server.listen(PORT, HOST, () => {
  console.log("Tracking API simulator running at http://" + HOST + ":" + PORT)
  console.log("Scenario: " + SCENARIO)
  console.log("Bundle movement step: " + STEP_MS + " ms")
  console.log("QMOS connected: " + QMOS_CONNECTED + "; OPC connected: " + OPC_CONNECTED)
  console.log("Press Ctrl+C to stop.")
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
