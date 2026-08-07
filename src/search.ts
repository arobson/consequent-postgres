import { createLogger } from './logger.js'
import { resolveTemplate } from './sql.js'
import type { SearchAdapter, SearchCriteria, SearchPredicate, OnClient } from './types.js'
import type { QueryResult } from 'pg'

const log = createLogger('pg-search-store')

async function createSearchTable(client: OnClient, type: string): Promise<QueryResult> {
  const sql = resolveTemplate('create_search_table', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err: Error) => {
          const msg = `creating the search table for ${type} failed with ${err.stack}`
          log.error(msg)
          throw new Error(msg)
        }
      )
  )
}

async function createIdMapTable(client: OnClient, type: string): Promise<QueryResult> {
  // Both set_<type>_search_fields (via createSetFieldsFunction) and find's
  // own system-id-to-actor-id translation depend on this table. It's
  // normally created by the actor adapter's own create(type), but search
  // can be the first adapter touched for a type (e.g. a `find()` computing
  // "next version" before any actor of that type has ever been stored) --
  // CREATE TABLE IF NOT EXISTS makes creating it here again harmless.
  const sql = resolveTemplate('create_id_map_table', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err: Error) => {
          const msg = `creating the id map table for ${type} failed with ${err.stack}`
          log.error(msg)
          throw new Error(msg)
        }
      )
  )
}

async function createSetFieldsFunction(client: OnClient, type: string): Promise<QueryResult> {
  const sql = resolveTemplate('set_search_fields', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err: Error) => {
          if (err) {
            const msg = `Creating set search field function for ${type} failed with ${err.message}`
            log.error(msg)
            throw new Error(msg)
          }
          throw err
        }
      )
  )
}

function normalizeCriteria(criteria: SearchCriteria[] | SearchCriteria): SearchCriteria[] {
  // consequent's own core `find(type, criteria)` API -- and its built-in
  // in-memory default adapter -- pass a single flat criteria object (all
  // fields AND'd together), not an array. This adapter's own direct API
  // (see README) additionally supports an array of OR'd criteria sets.
  // Accept both: a bare object is just a one-element set list.
  return Array.isArray(criteria) ? criteria : [criteria]
}

function find(client: OnClient, type: string, rawCriteria: SearchCriteria[] | SearchCriteria): Promise<string[]> {
  const searchQueryLines = [
    `SELECT id FROM ${type}_search`
  ]
  const sets: string[] = []
  const parameters: unknown[] = []
  const criteria = normalizeCriteria(rawCriteria)

  criteria.forEach(set => {
    const conditions: string[] = []
    Object.keys(set).forEach(field => {
      const predicate = set[field] as SearchPredicate
      if (typeof predicate === 'object' && !Array.isArray(predicate)) {
        const operators = Object.keys(predicate)
        operators.forEach(operation => {
          const value = (predicate as Record<string, unknown>)[operation]
          let parameterType: string
          switch (operation) {
            case 'contains':
              // Case-insensitive substring search using ILIKE
              parameters.push(`%${value}%`)
              conditions.push(
                `fields->>'${field}' ILIKE $${parameters.length}`
              )
              break
            case 'match':
              parameters.push(value)
              conditions.push(
                `fields->>'${field}' like $${parameters.length}`
              )
              break
            case 'in':
              // PostgreSQL IN operator requires array syntax: = ANY($1)
              parameters.push(value)
              conditions.push(
                `fields->>'${field}' = ANY($${parameters.length})`
              )
              break
            case 'not':
              parameters.push(value)
              conditions.push(
                `fields->>'${field}' != $${parameters.length}`
              )
              break
            case 'gt':
              parameters.push(value)
              parameterType = typeof value === 'string' ? 'timestamp' : 'numeric'
              conditions.push(
                `(fields->>'${field}')::${parameterType} > $${parameters.length}`
              )
              break
            case 'gte':
              parameters.push(value)
              parameterType = typeof value === 'string' ? 'timestamp' : 'numeric'
              conditions.push(
                `(fields->>'${field}')::${parameterType} >= $${parameters.length}`
              )
              break
            case 'lt':
              parameters.push(value)
              parameterType = typeof value === 'string' ? 'timestamp' : 'numeric'
              conditions.push(
                `(fields->>'${field}')::${parameterType} < $${parameters.length}`
              )
              break
            case 'lte':
              parameters.push(value)
              parameterType = typeof value === 'string' ? 'timestamp' : 'numeric'
              conditions.push(
                `(fields->>'${field}')::${parameterType} <= $${parameters.length}`
              )
              break
          }
        })
      } else if (Array.isArray(predicate) && typeof predicate !== 'string') {
        // Range query using BETWEEN
        parameters.push(predicate[0])
        parameters.push(predicate[1])
        const paramType = typeof predicate[0] === 'string' ? 'timestamp' : 'numeric'
        conditions.push(
          `(fields->>'${field}')::${paramType} BETWEEN $${parameters.length - 1} AND $${parameters.length}`
        )
      } else {
        parameters.push(predicate)
        conditions.push(`fields->>'${field}'=$${parameters.length}`)
      }
    })
    sets.push(`(${conditions.join(' AND ')})`)
  })

  // Handle empty criteria - return empty results
  if (sets.length === 0) {
    return Promise.resolve([])
  }

  searchQueryLines.push(`WHERE ${sets.join(' OR\n')}`)
  const searchSql = searchQueryLines.join('\n')

  // `${type}_search` rows are keyed by system id, not the actor id every
  // other adapter method (and consequent's own manager.getOrCreate, which
  // fetches whatever id find() returns) deals in -- set_<type>_search_fields
  // resolves and stores against `system_id`, per its own SQL. Translate
  // back to the current `aggregate_id` (actor id) via the id map before
  // returning, the same "most recent mapping" rule getActorId uses -- a
  // caller handed a system id here would silently create/fetch a blank
  // actor under that id instead of the real one.
  const sql = `
SELECT DISTINCT im.aggregate_id AS id
FROM ${type}_id_map im
WHERE im.system_id IN (
${searchSql}
)
AND im.starting_on = (
  SELECT MAX(im2.starting_on) FROM ${type}_id_map im2 WHERE im2.system_id = im.system_id
)
ORDER BY im.aggregate_id ASC;`

  return client(pg =>
    pg.query({
      text: sql,
      values: parameters
    })
    .then(
      res => res.rows.map(r => (r.id as string).trim()),
      err => {
        const msg = `Searching for matches on '${type}' failed with ${err.stack}`
        log.error(msg)
        throw new Error(msg)
      }
    )
  )
}

function getFieldValue(obj: Record<string, unknown>, field: string): unknown {
  if (/[.]/.test(field)) {
    return getNestedValue(obj, field.split('.'))
  } else {
    return obj[field]
  }
}

function getNestedValue(obj: Record<string, unknown> | unknown[], levels: string[]): unknown {
  let f: string
  let level: any = obj
  do {
    f = levels.shift()!
    if (Array.isArray(level)) {
      level = level.map(o => o[f])
    } else {
      level = level[f]
    }
  } while (levels.length > 0 && level)
  return level
}

function update(
  client: OnClient,
  type: string,
  fieldList: string[],
  updated: Record<string, unknown>,
  original?: Record<string, unknown>
): Promise<QueryResult> {
  const set = fieldList.reduce((acc, field) => {
    acc[field] = getFieldValue(updated, field)
    return acc
  }, {} as Record<string, unknown>)

  return client(pg =>
    pg.query({
      text: `SELECT set_${type}_search_fields($1, $2);`,
      values: [
        updated.id,
        set
      ]
    })
  )
}

export async function searchAdapter(client: OnClient, type: string): Promise<SearchAdapter> {
  await Promise.all([
    createSearchTable(client, type),
    createIdMapTable(client, type),
    createSetFieldsFunction(client, type)
  ])

  return {
    find: (criteria: SearchCriteria[] | SearchCriteria) => find(client, type, criteria),
    update: (fieldList: string[], updated: Record<string, unknown>, original?: Record<string, unknown>) =>
      update(client, type, fieldList, updated, original)
  }
}
