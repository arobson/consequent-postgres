import { createLogger } from './logger.js'
import { resolveTemplate } from './sql.js'
import type { Event, EventStore, EventStreamOptions, AsyncIterableResult, OnClient } from './types.js'
import type { Pool, QueryResult } from 'pg'
import type Cursor from 'pg-cursor'

const log = createLogger('pg-event-store')

async function createEventTable(client: OnClient, type: string): Promise<QueryResult> {
  const sql = resolveTemplate('create_event_table', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err: Error) => {
          const msg = `creating the event table for ${type} failed with ${err.stack}`
          log.error(msg)
          throw new Error(msg)
        }
      )
  )
}

async function createEventPackTable(client: OnClient, type: string): Promise<QueryResult> {
  const sql = resolveTemplate('create_eventpack_table', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err: Error) => {
          const msg = `creating the event pack table for ${type} failed with ${err.stack}`
          log.error(msg)
          throw new Error(msg)
        }
      )
  )
}

async function getEventsFor(
  client: OnClient,
  queryName: string,
  sql: string,
  actorId: string,
  lastEventId?: string
): Promise<Event[]> {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [actorId, lastEventId || '']
    })
    .then(
      res => res.rows.map(r => r.content as Event),
      err => {
        const msg = `Getting events by '${queryName}' failed with ${err.stack}`
        log.error(msg)
        throw new Error(msg)
      }
    )
  )
}

async function getEventsSince(
  client: OnClient,
  queryName: string,
  sql: string,
  actorId: string,
  date: string
): Promise<Event[]> {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [actorId, date || '']
    })
    .then(
      res => res.rows.map(r => r.content as Event),
      err => {
        const msg = `Getting events by '${queryName}' failed with ${err.stack}`
        log.error(msg)
        throw new Error(msg)
      }
    )
  )
}

async function getEventStreamFor(
  pool: Pool,
  CursorConstructor: typeof Cursor,
  type: string,
  actorId: string,
  options: EventStreamOptions
): Promise<AsyncIterableResult<Event>> {
  const filter = options.filter || (() => true)
  const queryLines = [
    `SELECT id, system_id, version, vector, content FROM ${type}_event`,
    'WHERE system_id = $1'
  ]
  const parameters: (string | number)[] = [actorId]

  if (options.sinceId) {
    parameters.push(options.sinceId)
    queryLines.push(`AND id > $${parameters.length}`)
  }
  if (options.since) {
    parameters.push(options.since)
    queryLines.push(`AND created_on >= $${parameters.length}`)
  }
  if (options.untilId) {
    parameters.push(options.untilId)
    queryLines.push(`AND id <= $${parameters.length}`)
  }
  if (options.until) {
    parameters.push(options.until)
    queryLines.push(`AND created_on <= $${parameters.length}`)
  }
  queryLines.push('ORDER BY id ASC;')
  const sql = queryLines.join('\n')

  const pg = await pool.connect()
  const cursor = pg.query(new CursorConstructor(sql, parameters)) as unknown as Cursor

  const read = (count: number): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      cursor.read(count, (err: Error | undefined, rows: any[]) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }

  const readNext = async (): Promise<IteratorResult<Event> | undefined> => {
    try {
      const rows = await read(1)
      if (rows.length) {
        const content = rows[0].content as Event
        if (filter(content)) {
          return {
            done: false,
            value: content
          }
        } else {
          return undefined
        }
      } else {
        cursor.close(() => {
          pg.release()
        })
        return {
          done: true,
          value: undefined
        }
      }
    } catch (err) {
      cursor.close(() => {
        pg.release()
      })
      const msg = `Streaming events '${type}' failed with ${(err as Error).stack}`
      log.error(msg)
      throw new Error(msg)
    }
  }

  return {
    [Symbol.asyncIterator]: () => {
      return {
        next: async (): Promise<IteratorResult<Event>> => {
          let loop = true
          while (loop) {
            const result = await readNext()
            if (result) {
              loop = false
              return result
            }
          }
          // This should never be reached due to the loop logic
          return { done: true, value: undefined }
        },
        return: async (): Promise<IteratorResult<Event>> => {
          cursor.close(() => {
            pg.release()
          })
          return { done: true, value: undefined }
        }
      }
    }
  }
}

function getVersion(vector: string): number {
  const clocks = vector.split(';')
  return clocks.reduce((version, clock) => {
    const parts = clock.split(':')
    return version + parseInt(parts[1])
  }, 0)
}

async function storeEvent(
  client: OnClient,
  queryName: string,
  sql: string,
  actorId: string,
  event: Event
): Promise<QueryResult> {
  const version = getVersion((event.vector as string) || '')
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [
        event.id,
        (event._createdOn as string).toLowerCase(),
        actorId,
        (isNaN(version) ? 0 : version),
        event.vector || '',
        JSON.stringify(event)
      ]
    })
  )
}

function storeEvents(
  client: OnClient,
  queryName: string,
  sql: string,
  actorId: string,
  events: Event[]
): Promise<QueryResult[]> {
  const promises = events.map(event => storeEvent(client, queryName, sql, actorId, event))
  return Promise.all(promises)
}

async function getEventPackFor(
  client: OnClient,
  queryName: string,
  sql: string,
  actorId: string,
  vector: string
): Promise<Event[] | undefined> {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [actorId, vector]
    })
    .then(
      res => {
        if (res.rows.length > 0) {
          return res.rows[0].content as Event[]
        }
        return undefined
      },
      err => {
        const msg = `Getting event pack by '${queryName}' failed with ${err.stack}`
        log.error(msg)
        throw new Error(msg)
      }
    )
  )
}

async function storeEventPack(
  client: OnClient,
  queryName: string,
  sql: string,
  actorId: string,
  vector: string,
  events: Event[]
): Promise<void> {
  const json = JSON.stringify(events)
  await client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [actorId, vector, json]
    })
  )
}

export async function eventStore(
  client: OnClient,
  pool: Pool,
  CursorConstructor: typeof Cursor,
  type: string
): Promise<EventStore> {
  const getEventsSql = resolveTemplate('select_events_since_id', type)
  const getEventsSinceSql = resolveTemplate('select_events_since_date', type)
  const storeEventsSql = resolveTemplate('insert_event', type)
  const getEventPackSql = resolveTemplate('select_eventpack', type)
  const storeEventPackSql = resolveTemplate('insert_eventpack', type)

  await Promise.all([
    createEventTable(client, type),
    createEventPackTable(client, type)
  ])

  return {
    getEventsFor: (actorId: string, lastEventId?: string) =>
      getEventsFor(client, `select_${type}_events`, getEventsSql, actorId, lastEventId),
    getEventsSince: (actorId: string, date: string) =>
      getEventsSince(client, `select_${type}_events_since`, getEventsSinceSql, actorId, date),
    getEventPackFor: (actorId: string, vector: string) =>
      getEventPackFor(client, `select_${type}_eventpack`, getEventPackSql, actorId, vector),
    getEventStreamFor: (actorId: string, options: EventStreamOptions) =>
      getEventStreamFor(pool, CursorConstructor, type, actorId, options),
    storeEvents: (actorId: string, events: Event[]) =>
      storeEvents(client, `insert_${type}_events`, storeEventsSql, actorId, events),
    storeEventPack: (actorId: string, vector: string, events: Event[]) =>
      storeEventPack(client, `insert_${type}_eventpack`, storeEventPackSql, actorId, vector, events)
  }
}
