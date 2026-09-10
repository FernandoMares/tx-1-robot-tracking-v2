import type {
  OpcStatusDto,
  QmosMillOrderDto,
  QmosMillOrdersDto,
  QmosMillOrdersResponseDto,
  QmosStatusDto,
  TrackedBundleDto,
  TrackingCapabilitiesDto,
  TrackingCommandAcceptedDto,
  TrackingCorrectionRequestDto,
  TrackingEventsResponseDto,
  TrackingMapDto,
  TrackingStateDto,
  TrackingStatusDto,
} from "./types"

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasOwn(value: JsonObject, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value))
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean"
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function fieldsMatch(
  value: JsonObject,
  fields: readonly string[],
  predicate: (fieldValue: unknown) => boolean,
): boolean {
  return fields.every((field) => predicate(value[field]))
}

function optionalFieldsMatch(
  value: JsonObject,
  fields: readonly string[],
  predicate: (fieldValue: unknown) => boolean,
): boolean {
  return fields.every((field) => value[field] === undefined || predicate(value[field]))
}

export function isTrackingStatusDto(value: unknown): value is TrackingStatusDto {
  return (
    isObject(value) &&
    typeof value.running === "boolean" &&
    typeof value.service === "string" &&
    typeof value.apiVersion === "string" &&
    isNullableString(value.scenario) &&
    isNullableString(value.utc)
  )
}

export function isTrackingCapabilitiesDto(value: unknown): value is TrackingCapabilitiesDto {
  return (
    isObject(value) &&
    typeof value.apiVersion === "string" &&
    typeof value.transport === "string" &&
    typeof value.hmiReadsDatabaseDirectly === "boolean" &&
    isStringArray(value.reads) &&
    isStringArray(value.commands) &&
    isStringArray(value.engineeringOpc) &&
    isStringArray(value.qmosCommands) &&
    isStringArray(value.engineeringSimulation)
  )
}

export function isTrackedBundleDto(value: unknown): value is TrackedBundleDto {
  if (!isObject(value)) return false

  return (
    typeof value.ScenarioName === "string" &&
    typeof value.TrackingId === "string" &&
    fieldsMatch(
      value,
      [
        "BundleId",
        "SourceArea",
        "CurrentZone",
        "RouteName",
        "BundleType",
        "Destination",
        "MillOrder1",
        "MillOrder2",
        "MillOrder3",
        "MillOrder4",
        "MillOrder5",
        "Disposition",
        "HoldCode",
        "PrinterId",
        "Status",
        "CorrelationStatus",
        "CreatedUtc",
        "LastUpdateUtc",
      ],
      isNullableString,
    ) &&
    fieldsMatch(
      value,
      [
        "Weight",
        "L2Id",
        "TagNumber",
        "PieceCount1",
        "PieceCount2",
        "PieceCount3",
        "PieceCount4",
        "PieceCount5",
        "TagCopy",
      ],
      isNullableNumber,
    ) &&
    optionalFieldsMatch(
      value,
      ["ProductionMode", "CreationSectionGroup", "CreationSignalName"],
      isNullableString,
    )
  )
}

export function isTrackingStateDto(value: unknown): value is TrackingStateDto {
  return (
    isObject(value) &&
    typeof value.ScenarioName === "string" &&
    isNullableString(value.LastUpdateUtc) &&
    Array.isArray(value.Bundles) &&
    value.Bundles.every(isTrackedBundleDto)
  )
}

export function isTrackingMapDto(value: unknown): value is TrackingMapDto {
  const creationRules = isObject(value) ? value.CreationRules : undefined
  if (
    !isObject(value) ||
    typeof value.ScenarioName !== "string" ||
    !isNullableString(value.GeneratedUtc) ||
    !Array.isArray(value.Zones) ||
    !Array.isArray(value.Routes) ||
    !Array.isArray(value.Destinations) ||
    (creationRules !== undefined && !Array.isArray(creationRules))
  ) {
    return false
  }

  const zonesValid = value.Zones.every(
    (zone) =>
      isObject(zone) &&
      typeof zone.ZoneId === "number" &&
      typeof zone.ZoneName === "string" &&
      isNullableString(zone.ZoneType) &&
      isNullableNumber(zone.DisplayOrder) &&
      isNullableNumber(zone.Capacity) &&
      isNullableString(zone.Description) &&
      typeof zone.IsEnabled === "boolean",
  )

  const routesValid = value.Routes.every(
    (route) =>
      isObject(route) &&
      typeof route.RouteId === "number" &&
      typeof route.RouteName === "string" &&
      isNullableNumber(route.SourceZoneId) &&
      isNullableString(route.SourceZone) &&
      isNullableNumber(route.DestinationZoneId) &&
      isNullableString(route.DestinationZone) &&
      isNullableString(route.Description) &&
      typeof route.IsEnabled === "boolean",
  )

  const destinationsValid = value.Destinations.every(
    (destination) =>
      isObject(destination) &&
      typeof destination.DestinationId === "number" &&
      typeof destination.DestinationCode === "string" &&
      isNullableString(destination.DestinationName) &&
      isNullableString(destination.DestinationType) &&
      typeof destination.IsEnabled === "boolean",
  )

  const rules = Array.isArray(creationRules) ? creationRules : []
  const rulesValid = rules.every(
    (rule) =>
      isObject(rule) &&
      typeof rule.CreationRuleId === "number" &&
      typeof rule.RuleName === "string" &&
      isNullableString(rule.SourceArea) &&
      isNullableNumber(rule.InitialZoneId) &&
      isNullableString(rule.InitialZone) &&
      isNullableString(rule.TriggerType) &&
      isNullableString(rule.SignalName) &&
      isNullableString(rule.SignalEdge) &&
      isNullableString(rule.ConditionJson) &&
      typeof rule.IsConfirmed === "boolean" &&
      typeof rule.IsEnabled === "boolean" &&
      isNullableString(rule.Notes),
  )

  return zonesValid && routesValid && destinationsValid && rulesValid
}

export function isOpcStatusDto(value: unknown): value is OpcStatusDto {
  if (
    !isObject(value) ||
    typeof value.Enabled !== "boolean" ||
    typeof value.Connected !== "boolean" ||
    !isNullableString(value.ConfigurationFile) ||
    !isNullableString(value.SignalScenarioName) ||
    !isNullableString(value.ConnectedUtc) ||
    !isNullableString(value.DisconnectedUtc) ||
    !isNullableString(value.LastError) ||
    typeof value.Healthy !== "boolean" ||
    typeof value.BadSignalCount !== "number" ||
    typeof value.DegradedGroupCount !== "number" ||
    !isStringArray(value.DegradedGroups) ||
    !Array.isArray(value.Signals)
  ) {
    return false
  }

  return value.Signals.every(
    (signal) =>
      isObject(signal) &&
      typeof signal.SignalName === "string" &&
      hasOwn(signal, "Value") &&
      isNullableString(signal.Direction) &&
      isNullableString(signal.OpcAddress) &&
      isNullableBoolean(signal.QualityGood) &&
      fieldsMatch(
        signal,
        [
          "OpcTimestamp",
          "LastReadUtc",
          "LastGoodReadUtc",
          "LastChangeUtc",
          "LastWriteUtc",
          "QualityChangedUtc",
          "Error",
        ],
        isNullableString,
      ) &&
      typeof signal.ConsecutiveBadReads === "number",
  )
}

export function isQmosStatusDto(value: unknown): value is QmosStatusDto {
  return isObject(value) && typeof value.enabled === "boolean" && typeof value.connected === "boolean"
}

export function isQmosMillOrderDto(value: unknown): value is QmosMillOrderDto {
  return (
    isObject(value) &&
    isPositiveInteger(value.FrpId) &&
    typeof value.MillOrder === "string" &&
    typeof value.HeatNo === "string" &&
    isNonNegativeInteger(value.WorkOrder) &&
    typeof value.Grade === "string" &&
    typeof value.Size === "string" &&
    isFiniteNumber(value.Weight) &&
    typeof value.Length === "string" &&
    isNullableNumber(value.ProductWidth) &&
    isNullableNumber(value.ProductThickness)
  )
}

export function isQmosMillOrdersDto(value: unknown): value is QmosMillOrdersDto {
  if (!isObject(value) || !Array.isArray(value.value) || !isNonNegativeInteger(value.Count)) return false

  return value.value.every(isQmosMillOrderDto)
}

export function isQmosMillOrdersResponseDto(
  value: unknown,
): value is QmosMillOrdersResponseDto {
  return Array.isArray(value)
    ? value.every(isQmosMillOrderDto)
    : isQmosMillOrdersDto(value)
}

export function isTrackingCorrectionRequestDto(
  value: unknown,
): value is TrackingCorrectionRequestDto {
  return (
    isObject(value) &&
    isNonEmptyString(value.TrackingId) &&
    isNonEmptyString(value.OperatorId) &&
    isNonEmptyString(value.Reason) &&
    isNonEmptyString(value.MillOrder1)
  )
}

export function isTrackingCommandAcceptedDto(
  value: unknown,
): value is TrackingCommandAcceptedDto {
  return (
    isObject(value) &&
    typeof value.accepted === "boolean" &&
    isPositiveInteger(value.eventId) &&
    isNonEmptyString(value.eventType) &&
    isNonEmptyString(value.trackingId)
  )
}

function isTrackingEvent(value: unknown): boolean {
  if (!isObject(value)) return false

  return (
    typeof value.EventId === "number" &&
    typeof value.EventType === "string" &&
    optionalFieldsMatch(
      value,
      [
        "ScenarioName",
        "EventType",
        "TrackingId",
        "BundleId",
        "SourceArea",
        "FromZone",
        "ToZone",
        "CurrentZone",
        "RouteName",
        "BundleType",
        "Destination",
        "MillOrder1",
        "MillOrder2",
        "MillOrder3",
        "MillOrder4",
        "MillOrder5",
        "Disposition",
        "HoldCode",
        "PrinterId",
        "CorrelationStatus",
        "OperatorId",
        "Reason",
        "ProductionMode",
        "CreationSectionGroup",
        "CreationSignalName",
        "PayloadJson",
      ],
      isNullableString,
    ) &&
    optionalFieldsMatch(
      value,
      [
        "Weight",
        "L2Id",
        "TagNumber",
        "PieceCount1",
        "PieceCount2",
        "PieceCount3",
        "PieceCount4",
        "PieceCount5",
        "TagCopy",
      ],
      isNullableNumber,
    )
  )
}

export function isTrackingEventsResponseDto(value: unknown): value is TrackingEventsResponseDto {
  if (Array.isArray(value)) return value.every(isTrackingEvent)

  return (
    isObject(value) &&
    (value.ScenarioName === undefined || isNullableString(value.ScenarioName)) &&
    (value.GeneratedUtc === undefined || isNullableString(value.GeneratedUtc)) &&
    Array.isArray(value.Events) &&
    value.Events.every(isTrackingEvent)
  )
}
