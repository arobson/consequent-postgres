const log = require('bole')('pg-actor-store')
const templates = require('./sql')

async function createTable (client, type) {
  const sql = templates('create_snapshot_table', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err) => {
          if (err) {
            const msg = `Creating snapshot table for ${type} failed with ${err}`
            log.error(msg)
            throw new Error(msg)
          }
        }
      )
  )
}

async function createIdMapTable (client, type) {
  const sql = templates('create_id_map_table', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err) => {
          if (err) {
            const msg = `Creating snapshot table for ${type} failed with ${err}`
            log.error(msg)
            throw new Error(msg)
          }
        }
      )
  )
}

async function createIdMapFunction (client, type) {
  const sql = templates(`set_id_map`, type)
  return client(pg =>
    pg.query(sql)
      .catch(
        (err) => {
          if (err) {
            const msg = `Creating snapshot function for ${type} failed with ${err}`
            log.error(msg)
            throw new Error(msg)
          }
        }
      )
  )
}

async function fetch (client, queryName, sql, actorId) {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [ actorId ]
    })
    .then(
      res => res.rows[0].content
    )
  )
}

async function fetchByLastEventIdentifier (client, queryName, sql, actorId, eventIdentifier) {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [ actorId, eventIdentifier ]
    })
    .then(
      res => {
        return res.rows.length ?
          res.rows[0].content :
          undefined
      }
    )
  )
}

function findAncestor () {
  return Promise.reject(new Error("Postgres actor stores don't support siblings or ancestry."))
}

async function getActorId (client, queryName, sql, systemId, asOf = new Date().toISOString()) {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [
        systemId,
        asOf
      ]
    })
    .then(
      res => res.rows.length ?
        res.rows[0].aggregate_id.trim() :
        undefined
    )
  )
}

async function getSystemId (client, queryName, sql, aggregateId, asOf = new Date().toISOString()) {
  return client(pg =>
    pg.query({
      name: queryName,
      text: sql,
      values: [
        aggregateId,
        asOf
      ]
    })
    .then(
      res => res.rows.length ?
        res.rows[0].system_id.trim() :
        undefined
    )
  )
}

function getVersion (vector) {
  let clocks = vector.split(';')
  return clocks.reduce((version, clock) => {
    let parts = clock.split(':')
    return version + parseInt(parts[ 1 ])
  }, 0)
}

async function mapIds (client, type, queryName, sql, systemId, aggregateId) {
  return client(pg =>
    pg.query({
      name: queryName,
      text: `SELECT set_${type}_id_map($1, $2);`,
      values: [
        systemId,
        aggregateId
      ]
    })
  )
}

async function store (client, queryName, sql, actorId, vectorClock, actor) {
  let version = getVersion(vectorClock || '')
  let json = JSON.stringify(actor)
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

module.exports = function (client, type) {
  const fetchSql = templates('select_snapshot', type)
  const storeSql = templates('insert_snapshot', type)
  const fetchByLastDateSql = templates('select_snapshot_by_lastEventDate', type)
  const fetchByLastIdSql = templates('select_snapshot_by_lastEventId', type)
  const fetchAggregateIdSql = templates('select_aggregate_id', type)
  const fetchSystemIdSql = templates('select_system_id', type)
  const setIdMap = templates('set_id_map', type)

  return Promise.all([
    createTable(client, type),
    createIdMapTable(client, type),
    createIdMapFunction(client, type),
  ]).then(
    () => {
      return {
        fetch: fetch.bind(null, client, `select_${type}_snapshot`, fetchSql),
        fetchByLastEventDate: fetchByLastEventIdentifier.bind(null, client, `select_${type}_by_lastDate`, fetchByLastDateSql),
        fetchByLastEventId: fetchByLastEventIdentifier.bind(null, client, `select_${type}_by_lastId`, fetchByLastIdSql),
        findAncestor: findAncestor,
        getActorId: getActorId.bind(null, client, `select_${type}_aggregate_id`, fetchAggregateIdSql),
        getSystemId: getSystemId.bind(null, client, `select_${type}_system_id`, fetchSystemIdSql),
        mapIds: mapIds.bind(null, client, type, `map_${type}_ids`, setIdMap),
        store: store.bind(null, client, `insert_${type}_snapshot`, storeSql)
      }
    }
  )
}
