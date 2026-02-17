import type { Client, Pool, PoolClient, QueryConfig, QueryResult } from 'pg'

export interface Config {
  connectionString?: string
}

// Core-aligned types
export interface VectorClock {
  [nodeId: string]: number
}

export interface Event {
  type?: string
  topic?: string
  id?: string
  _actorId?: string
  _actorType?: string
  _createdByVector?: string
  _createdByVersion?: number
  _createdBy?: string
  _createdById?: string
  _createdOn?: string
  _initiatedBy?: string
  _initiatedById?: string
  [key: string]: unknown
}

export interface StreamOptions {
  since?: unknown
  sinceId?: unknown
  until?: unknown
  untilId?: unknown
  filter?: (event: Event) => boolean
  eventTypes?: string[]
  actorType?: string
  actorId?: unknown
  actorTypes?: string[]
  actors?: Record<string, unknown>
}

// Legacy types for backward compatibility
export interface Actor {
  id: string
  lastEventId: string
  lastCommandId: string
  lastCommandHandledOn: string
  lastEventAppliedOn: string
  [key: string]: unknown
}

export interface EventStreamOptions {
  filter?: (event: Event) => boolean
  sinceId?: string
  since?: string
  untilId?: string
  until?: string
}

export interface AsyncIterableResult<T> {
  [Symbol.asyncIterator]: () => AsyncIterator<T>
}

// PostgreSQL-specific types
export type ClientOperation<T> = (client: PoolClient) => Promise<T>
export type OnClient = <T>(op: ClientOperation<T>) => Promise<T>

// Core-aligned store interfaces
export interface ActorStoreInstance {
  fetch: (id: unknown) => Promise<Record<string, unknown> | undefined>
  fetchByLastEventDate?: (id: unknown, lastEventDate: unknown) => Promise<Record<string, unknown> | undefined>
  fetchByLastEventId?: (id: unknown, lastEventId: unknown) => Promise<Record<string, unknown> | undefined>
  getActorId?: (systemId: string, asOf?: unknown) => Promise<string | undefined>
  getSystemId?: (id: unknown, asOf?: unknown) => Promise<string | undefined>
  mapIds?: (systemId: string, actorId: unknown) => Promise<void>
  store: (id: unknown, vector: string, state: Record<string, unknown>) => Promise<unknown>
  findAncestor?: (id: unknown, instances: unknown[], excluded: unknown[]) => Promise<unknown>
}

export interface EventStoreInstance {
  getEventsFor: (id: unknown, lastEventId?: unknown) => Promise<Event[] | undefined>
  getEventPackFor?: (id: unknown, vector: string) => Promise<Event[] | undefined>
  getEventStreamFor?: (id: unknown, options: StreamOptions) => AsyncIterable<Event>
  storeEvents: (id: unknown, events: Event[]) => Promise<void>
  storeEventPack?: (id: unknown, vector: string, events: Event[]) => Promise<void>
  findEvents?: (criteria: unknown, lastEventId?: unknown) => Promise<Event[]>
  getEventsByIndex?: (indexName: string, indexValue: unknown, lastEventId?: unknown) => Promise<Event[]>
}

export interface SearchAdapterInstance {
  find: (criteria: Record<string, unknown>) => Promise<unknown[]>
  update: (fieldList: string[], updated: Record<string, unknown>, original?: Record<string, unknown>) => Promise<void>
}

export interface AdapterLibrary<T> {
  create: (type: string) => Promise<T>
  state?: Record<string, unknown>
  [key: string]: unknown
}

// PostgreSQL-specific store interfaces (backward compatible with strong typing)
export interface ActorStore {
  fetch: (actorId: string) => Promise<Actor | undefined>
  fetchByLastEventDate: (actorId: string, date: string) => Promise<Actor | undefined>
  fetchByLastEventId: (actorId: string, eventId: string) => Promise<Actor | undefined>
  findAncestor: () => Promise<never>
  getActorId: (systemId: string, asOf?: string) => Promise<string | undefined>
  getSystemId: (aggregateId: string, asOf?: string) => Promise<string | undefined>
  mapIds: (systemId: string, aggregateId: string) => Promise<QueryResult>
  store: (actorId: string, vectorClock: string, actor: Actor) => Promise<QueryResult>
}

export interface EventStore {
  getEventsFor: (actorId: string, lastEventId?: string) => Promise<Event[]>
  getEventsSince: (actorId: string, date: string) => Promise<Event[]>
  getEventPackFor?: (actorId: string, vector: string) => Promise<Event[] | undefined>
  getEventStreamFor: (actorId: string, options: EventStreamOptions) => Promise<AsyncIterableResult<Event>>
  storeEvents: (actorId: string, events: Event[]) => Promise<QueryResult[]>
  storeEventPack?: (actorId: string, vector: string, events: Event[]) => Promise<void>
}

export interface SearchAdapter {
  find: (criteria: SearchCriteria[]) => Promise<string[]>
  update: (fieldList: string[], updated: Record<string, unknown>, original?: Record<string, unknown>) => Promise<QueryResult>
}

export type SearchPredicate =
  | string
  | number
  | boolean
  | [string | number, string | number]
  | {
      contains?: string
      match?: string
      in?: unknown[]
      not?: unknown
      gt?: string | number
      gte?: string | number
      lt?: string | number
      lte?: string | number
    }

export type SearchCriteria = Record<string, SearchPredicate>

export interface ConsequentPostgres {
  actor: AdapterLibrary<ActorStore>
  event: AdapterLibrary<EventStore>
  search: AdapterLibrary<SearchAdapter>
  client: OnClient
  close: () => Promise<void>
}
