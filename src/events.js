const templates = require('./sql')
const log = require('bole')('pg-event-store')
const util = require('util')

async function createEventTable (client, type) {
  let sql = templates('create_event_table', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err) => {
          const msg = `creating the event table for ${type} failed with ${err.stack}`
          log.error(msg)
          throw new Error(msg)
        }
      )
  )
}

async function getEventsFor (client, queryName, sql, actorId, lastEventId) {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [ actorId, lastEventId || '' ]
    })
    .then(
      res => res.rows.map(r => r.content),
      err => {
        const msg = `Getting events by '${queryName}' failed with ${err.stack}`
        log.error(msg)
        reject(new Error(msg))
      }
    )
  )
}

async function getEventsSince (client, queryName, sql, actorId, date) {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [ actorId, lastEventId || '' ]
    })
    .then(
      res => res.rows.map(r => r.content),
      err => {
        const msg = `Getting events by '${queryName}' failed with ${err.stack}`
        log.error(msg)
        reject(new Error(msg))
      }
    )
  )
}

async function getEventStreamFor (pool, Cursor, type, actorId, options) {
  const filter = options.filter || (() => true)
  const queryLines = [
    `SELECT id, system_id, version, vector, content FROM ${type}_event`,
    'WHERE system_id = $1'
  ]
  const parameters = [ actorId ]
  if (options.sinceId) {
    queryLines.push('AND id > $2')
    parameters.push(options.sinceId)
  }
  if (options.since) {
    queryLines.push('AND created_on >= $2')
    parameters.push(options.since)
  }
  if (options.untilId) {
    queryLines.push('AND id <= $3')
    parameters.push(options.untilId)
  }
  if (options.until) {
    queryLines.push('AND created_on <= $3')
    parameters.push(options.until)
  }
  queryLines.push('ORDER BY id ASC;')
  const sql = queryLines.join('\n')

  const pg = await pool.connect()
  const cursor = pg.query(
    new Cursor(
      sql,
      parameters
    )
  )
  const read = util.promisify(cursor.read.bind(cursor))
  const readNext = () => {
    return read(1)
      .then(
        rows => {
          if (rows.length) {
            const content = rows[0].content
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
              done: true
            }
          }
        },
        err => {
          cursor.close(() => {
            pg.release()
          })
          const msg = `Streaming events '${type}' failed with ${err.stack}`
          log.error(msg)
          return {
            done: true,
            value: new Error(msg)
          }
        }
      )
  }
  return {
    [Symbol.asyncIterator]: () => {
      return {
        next: () => {
          var loop = true
          return new Promise(async (resolve, reject) => {
            while (loop) {
              const result = await readNext()
              if (result) {
                loop = false
                resolve(result)
              }
            }
          })
        },
        return: () => {
          cursor.close(() => {
            pg.release()
          })
        }
      }
    }
  }
}

function getVersion (vector) {
  let clocks = vector.split(';')
  return clocks.reduce((version, clock) => {
    let parts = clock.split(':')
    return version + parseInt(parts[ 1 ])
  }, 0)
}

async function storeEvent (client, queryName, sql, actorId, event) {
  let version = getVersion(event.vector || '')
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [
        event.id,
        event._createdOn.toLowerCase(),
        actorId,
				(isNaN(version) ? 0 : version),
        event.vector || '',
        JSON.stringify(event)
      ]
    })
  )
}

function storeEvents (client, queryName, sql, actorId, events) {
  let promises = events.map(storeEvent.bind(null, client, queryName, sql, actorId))
  return Promise.all(promises)
}

module.exports = function (client, pool, Cursor, type) {
  let getEventsSql = templates('select_events_since_id', type)
  let getEventsSinceSql = templates('select_events_since_date', type)
  let storeEventsSql = templates('insert_event', type)

  return createEventTable(client, type)
  .then(
    () => {
      return {
        getEventsFor: getEventsFor.bind(null, client, `select_${type}_events`, getEventsSql),
        getEventsSince: getEventsFor.bind(null, client, `select_${type}_events_since`, getEventsSinceSql),
        getEventStreamFor: getEventStreamFor.bind(null, pool, Cursor, type),
        storeEvents: storeEvents.bind(null, client, `insert_${type}_events`, storeEventsSql)
      }
    }
  )
}
