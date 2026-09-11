/**
 * DTOs exposed by MaterialTrackingService.
 *
 * The backend currently mixes camelCase (status/capabilities) and PascalCase
 * (map/state). Keep the wire casing here so API changes remain visible at the
 * integration boundary instead of being hidden by implicit transformations.
 */

export type ApiDateValue = string | null

/** Allows additive backend fields without weakening the known DTO properties. */
export interface ExtensibleDto {
  [key: string]: unknown
}

export interface TrackingStatusDto extends ExtensibleDto {
  running: boolean
  service: string
  apiVersion: string
  scenario: string | null
  utc: ApiDateValue
}

export interface TrackingCapabilitiesDto extends ExtensibleDto {
  apiVersion: string
  transport: string
  hmiReadsDatabaseDirectly: boolean
  reads: string[]
  commands: string[]
  engineeringOpc: string[]
  qmosCommands: string[]
  engineeringSimulation: string[]
}

export interface TrackingZoneDto extends ExtensibleDto {
  ZoneId: number
  ZoneName: string
  ZoneType: string | null
  DisplayOrder: number | null
  Capacity: number | null
  Description: string | null
  IsEnabled: boolean
}

export interface TrackingRouteDto extends ExtensibleDto {
  RouteId: number
  RouteName: string
  SourceZoneId: number | null
  SourceZone: string | null
  DestinationZoneId: number | null
  DestinationZone: string | null
  Description: string | null
  IsEnabled: boolean
}

export interface TrackingDestinationDto extends ExtensibleDto {
  DestinationId: number
  DestinationCode: string
  DestinationName: string | null
  DestinationType: string | null
  IsEnabled: boolean
}

export interface TrackingCreationRuleDto extends ExtensibleDto {
  CreationRuleId: number
  RuleName: string
  SourceArea: string | null
  InitialZoneId: number | null
  InitialZone: string | null
  TriggerType: string | null
  SignalName: string | null
  SignalEdge: string | null
  /** JSON serialized by the backend as a string; parse only when needed. */
  ConditionJson: string | null
  IsConfirmed: boolean
  IsEnabled: boolean
  Notes: string | null
}

export interface TrackingMapDto extends ExtensibleDto {
  ScenarioName: string
  GeneratedUtc: ApiDateValue
  Zones: TrackingZoneDto[]
  Routes: TrackingRouteDto[]
  Destinations: TrackingDestinationDto[]
  /** Observed in current builds; absent from the v0.6 response example. */
  CreationRules?: TrackingCreationRuleDto[]
}

export interface TrackedBundleDto extends ExtensibleDto {
  ScenarioName: string
  TrackingId: string
  BundleId: string | null
  SourceArea: string | null
  CurrentZone: string | null
  RouteName: string | null
  Weight: number | null
  BundleType: string | null
  L2Id: number | null
  TagNumber: number | null
  Destination: string | null
  MillOrder1: string | null
  PieceCount1: number | null
  MillOrder2: string | null
  PieceCount2: number | null
  MillOrder3: string | null
  PieceCount3: number | null
  MillOrder4: string | null
  PieceCount4: number | null
  MillOrder5: string | null
  PieceCount5: number | null
  Disposition: string | null
  HoldCode: string | null
  PrinterId: string | null
  TagCopy: number | null
  Status: string | null
  CorrelationStatus: string | null
  /** Observed extensions not guaranteed by the written v0.6 contract. */
  ProductionMode?: string | null
  CreationSectionGroup?: string | null
  CreationSignalName?: string | null
  CreatedUtc: ApiDateValue
  LastUpdateUtc: ApiDateValue
}

export interface TrackingStateDto extends ExtensibleDto {
  ScenarioName: string
  LastUpdateUtc: ApiDateValue
  Bundles: TrackedBundleDto[]
}

/**
 * OPC payloads are adapter-dependent in the current contract. All observed or
 * expected diagnostic fields are optional while unknown fields remain allowed.
 */
export interface OpcSignalDto extends ExtensibleDto {
  SignalName: string
  Direction: string | null
  OpcAddress: string | null
  Value: unknown
  QualityGood: boolean | null
  OpcTimestamp: ApiDateValue
  LastReadUtc: ApiDateValue
  LastGoodReadUtc: ApiDateValue
  LastChangeUtc: ApiDateValue
  LastWriteUtc: ApiDateValue
  QualityChangedUtc: ApiDateValue
  ConsecutiveBadReads: number
  Error: string | null
}

export interface OpcStatusDto extends ExtensibleDto {
  Enabled: boolean
  Connected: boolean
  ConfigurationFile: string | null
  SignalScenarioName: string | null
  ConnectedUtc: ApiDateValue
  DisconnectedUtc: ApiDateValue
  LastError: string | null
  Healthy: boolean
  BadSignalCount: number
  DegradedGroupCount: number
  DegradedGroups: string[]
  Signals: OpcSignalDto[]
}

/** This endpoint uses camelCase, unlike the tracking state/map payloads. */
export interface QmosStatusDto extends ExtensibleDto {
  enabled: boolean
  connected: boolean
}

/** Mill-order candidate returned by QMOS for operator selection. */
export interface QmosMillOrderDto extends ExtensibleDto {
  FrpId: number
  MillOrder: string
  HeatNo: string
  WorkOrder: number
  Grade: string
  Size: string
  Weight: number
  Length: string
  ProductWidth: number | null
  ProductThickness: number | null
}

/** Wrapped collection shape observed in some service builds/tooling. */
export interface QmosMillOrdersDto extends ExtensibleDto {
  value: QmosMillOrderDto[]
  Count: number
}

/** The live service has also been observed returning the collection as a bare array. */
export type QmosMillOrdersResponseDto = QmosMillOrderDto[] | QmosMillOrdersDto

/** Global Mill Order selected by the HMI for subsequent QMOS CREATE operations. */
export interface GlobalMillOrderDto extends ExtensibleDto {
  millOrder: string | null
  enabled: boolean
  updatedUtc: ApiDateValue
}

/** Allowlisted payload used to change the active global Mill Order. */
export interface GlobalMillOrderUpdateRequestDto {
  millOrder: string
}

/** Synchronous acknowledgement returned after the global selection is persisted. */
export interface GlobalMillOrderUpdateResponseDto extends ExtensibleDto {
  updated: boolean
  millOrder: string
  enabled: boolean
  updatedUtc: string
  appliesTo: string
}

/** Allowlisted payload accepted by the public manual-correction command. */
export interface TrackingCorrectionRequestDto {
  TrackingId: string
  OperatorId: string
  Reason: string
  MillOrder1: string
}

/** Asynchronous command acknowledgement returned by tracking. */
export interface TrackingCommandAcceptedDto extends ExtensibleDto {
  accepted: boolean
  eventId: number
  eventType: string
  trackingId: string
}

export interface TrackingEventDto extends ExtensibleDto {
  EventId: number
  ScenarioName?: string | null
  EventType: string
  TrackingId?: string | null
  BundleId?: string | null
  SourceArea?: string | null
  FromZone?: string | null
  ToZone?: string | null
  CurrentZone?: string | null
  RouteName?: string | null
  Weight?: number | null
  BundleType?: string | null
  L2Id?: number | null
  TagNumber?: number | null
  Destination?: string | null
  MillOrder1?: string | null
  PieceCount1?: number | null
  MillOrder2?: string | null
  PieceCount2?: number | null
  MillOrder3?: string | null
  PieceCount3?: number | null
  MillOrder4?: string | null
  PieceCount4?: number | null
  MillOrder5?: string | null
  PieceCount5?: number | null
  Disposition?: string | null
  HoldCode?: string | null
  PrinterId?: string | null
  TagCopy?: number | null
  CorrelationStatus?: string | null
  OperatorId?: string | null
  Reason?: string | null
  ProductionMode?: string | null
  CreationSectionGroup?: string | null
  CreationSignalName?: string | null
  PayloadJson?: string | null
}

export interface TrackingEventsDto extends ExtensibleDto {
  ScenarioName?: string | null
  GeneratedUtc?: ApiDateValue
  Events: TrackingEventDto[]
}

/** Some service builds return the recent-events collection as a bare array. */
export type TrackingEventsResponseDto = TrackingEventsDto | TrackingEventDto[]

export interface ApiErrorResponseDto extends ExtensibleDto {
  error?: string | null
  message?: string | null
  code?: string | number | null
  details?: unknown
  trackingId?: string | null
}
