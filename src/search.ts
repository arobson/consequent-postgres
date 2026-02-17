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

function find(client: OnClient, type: string, criteria: SearchCriteria[]): Promise<string[]> {
  const queryLines = [
    `SELECT id FROM ${type}_search`
  ]
  const sets: string[] = []
  const parameters: unknown[] = []

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

  queryLines.push(`WHERE ${sets.join(' OR\n')}`)
  queryLines.push('ORDER BY id ASC;')
  const sql = queryLines.join('\n')

  return client(pg =>
    pg.query({
      text: sql,
      values: parameters
    })
    .then(
      res => res.rows.map(r => r.id as string),
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
    createSetFieldsFunction(client, type)
  ])

  return {
    find: (criteria: SearchCriteria[]) => find(client, type, criteria),
    update: (fieldList: string[], updated: Record<string, unknown>, original?: Record<string, unknown>) =>
      update(client, type, fieldList, updated, original)
  }
}
