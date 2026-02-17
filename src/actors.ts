import { createLogger } from './logger.js'
import { resolveTemplate } from './sql.js'
import type { Actor, ActorStore, OnClient } from './types.js'
import type { QueryResult } from 'pg'

const log = createLogger('pg-actor-store')

async function createTable(client: OnClient, type: string): Promise<QueryResult> {
  const sql = resolveTemplate('create_snapshot_table', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err: Error) => {
          if (err) {
            const msg = `Creating snapshot table for ${type} failed with ${err.message}`
            log.error(msg)
            throw new Error(msg)
          }
          throw err
        }
      )
  )
}

async function createIdMapTable(client: OnClient, type: string): Promise<QueryResult> {
  const sql = resolveTemplate('create_id_map_table', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err: Error) => {
          if (err) {
            const msg = `Creating id map table for ${type} failed with ${err.message}`
            log.error(msg)
            throw new Error(msg)
          }
          throw err
        }
      )
  )
}

async function createIdMapFunction(client: OnClient, type: string): Promise<QueryResult> {
  const sql = resolveTemplate('set_id_map', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err: Error) => {
          if (err) {
            const msg = `Creating id map function for ${type} failed with ${err.message}`
            log.error(msg)
            throw new Error(msg)
          }
          throw err
        }
      )
  )
}

async function fetch(client: OnClient, queryName: string, sql: string, actorId: string): Promise<Actor | undefined> {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [actorId]
    })
    .then(
      res => {
        if (res.rows.length > 0) {
          return res.rows[0].content as Actor
        } else {
          return undefined
        }
      }
    )
  )
}

async function fetchByLastEventIdentifier(
  client: OnClient,
  queryName: string,
  sql: string,
  actorId: string,
  eventIdentifier: string
): Promise<Actor | undefined> {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [actorId, eventIdentifier]
    })
    .then(
      res => {
        return res.rows.length ?
          res.rows[0].content as Actor :
          undefined
      }
    )
  )
}

function findAncestor(): Promise<never> {
  return Promise.reject(new Error("Postgres actor stores don't support siblings or ancestry."))
}

async function getActorId(
  client: OnClient,
  queryName: string,
  sql: string,
  systemId: string,
  asOf: string = new Date(Date.now() + 1000).toISOString() // +1 second to account for clock skew
): Promise<string | undefined> {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [systemId, asOf]
    })
    .then(
      res => res.rows.length ?
        (res.rows[0].aggregate_id as string).trim() :
        undefined
    )
  )
}

async function getSystemId(
  client: OnClient,
  queryName: string,
  sql: string,
  aggregateId: string,
  asOf: string = new Date(Date.now() + 1000).toISOString() // +1 second to account for clock skew
): Promise<string | undefined> {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [aggregateId, asOf]
    })
    .then(
      res => res.rows.length ?
        (res.rows[0].system_id as string).trim() :
        undefined
    )
  )
}

function getVersion(vector: string): number {
  const clocks = vector.split(';')
  return clocks.reduce((version, clock) => {
    const parts = clock.split(':')
    return version + parseInt(parts[1])
  }, 0)
}

async function mapIds(
  client: OnClient,
  type: string,
  queryName: string,
  sql: string,
  systemId: string,
  aggregateId: string
): Promise<QueryResult> {
  return client(pg =>
    pg.query({
      name: queryName,
      text: `SELECT set_${type}_id_map($1, $2);`,
      values: [systemId, aggregateId]
    })
  )
}

async function store(
  client: OnClient,
  queryName: string,
  sql: string,
  actorId: string,
  vectorClock: string,
  actor: Actor
): Promise<QueryResult> {
  const version = getVersion(vectorClock || '')
  const json = JSON.stringify(actor)
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [
        actorId,
        (isNaN(version) ? 0 : version),
        vectorClock,
        json,
        actor.lastEventId,
        actor.lastCommandId,
        actor.lastCommandHandledOn,
        actor.lastEventAppliedOn
      ]
    })
  )
}

export async function actorStore(client: OnClient, type: string): Promise<ActorStore> {
  const fetchSql = resolveTemplate('select_snapshot', type)
  const storeSql = resolveTemplate('insert_snapshot', type)
  const fetchByLastDateSql = resolveTemplate('select_snapshot_baseline_by_lastevent_date', type)
  const fetchByLastIdSql = resolveTemplate('select_snapshot_baseline_by_lastevent_id', type)
  const fetchAggregateIdSql = resolveTemplate('select_aggregate_id', type)
  const fetchSystemIdSql = resolveTemplate('select_system_id', type)
  const setIdMap = resolveTemplate('set_id_map', type)

  await Promise.all([
    createTable(client, type),
    createIdMapTable(client, type),
    createIdMapFunction(client, type),
  ])

  return {
    fetch: (actorId: string) => fetch(client, `select_${type}_snapshot`, fetchSql, actorId),
    fetchByLastEventDate: (actorId: string, date: string) =>
      fetchByLastEventIdentifier(client, `select_${type}_by_lastDate`, fetchByLastDateSql, actorId, date),
    fetchByLastEventId: (actorId: string, eventId: string) =>
      fetchByLastEventIdentifier(client, `select_${type}_by_lastId`, fetchByLastIdSql, actorId, eventId),
    findAncestor,
    getActorId: (systemId: string, asOf?: string) =>
      getActorId(client, `select_${type}_aggregate_id`, fetchAggregateIdSql, systemId, asOf),
    getSystemId: (aggregateId: string, asOf?: string) =>
      getSystemId(client, `select_${type}_system_id`, fetchSystemIdSql, aggregateId, asOf),
    mapIds: (systemId: string, aggregateId: string) =>
      mapIds(client, type, `map_${type}_ids`, setIdMap, systemId, aggregateId),
    store: (actorId: string, vectorClock: string, actor: Actor) =>
      store(client, `insert_${type}_snapshot`, storeSql, actorId, vectorClock, actor)
  }
}
