const templates = require('./sql')
const log = require('bole')('pg-event-store')

async function createSearchTable (client, type) {
  const sql = templates('create_search_table', type)
  return client(pg =>
    pg.query(sql)
      .catch(
        err => {
          const msg = `creating the search table for ${type} failed with ${err.stack}`
          log.error(msg)
          throw new Error(msg)
        }
      )
  )
}

async function createSetFieldsFunction (client, type) {
  const sql = templates(`set_search_fields`, type)
  return client(pg =>
    pg.query(sql)
      .catch(
        err => {
          if (err) {
            const msg = `Creating set search field function for ${type} failed with ${err}`
            log.error(msg)
            throw new Error(msg)
          }
        }
      )
  )
}

function find (client, type, criteria) {
  const queryLines = [
    `SELECT id FROM ${type}_search`
  ]
  const sets = []
  const parameters = []
  criteria.forEach(set => {
    const conditions = []
    Object.keys(set).forEach(field => {
      const predicate = set[field]
      if (typeof predicate === 'object') {
        let operators = Object.keys(predicate)
        operators.forEach(operation => {
          const value = predicate[operation]
          let parameterType
          switch(operation) {
            case 'contains':
              parameters.push(value)
              conditions.push(
                `fields->'${field}' ? $${parameters.length}`
              )
              break;
            case 'match':
            parameters.push(value)
            conditions.push(
                `fields->>'${field}' like $${parameters.length}`
              )
              break;
            case 'in':
              parameters.push(value)
              conditions.push(
                `fields->>'${field}' in $${parameters.length}`
              )
              break;
            case 'not':
              parameters.push(value)
              conditions.push(
                `fields->>'${field}' != $${parameters.length}`
              )
              break;
            case 'gt':
              parameters.push(value)
              parameterType = typeof value === 'string' ? 'timestamp' : 'number'
              conditions.push(
                `(fields->>'${field}')::${parameterType} > $${parameters.length}`
              )
              break;
            case 'gte':
              parameters.push(value)
              parameterType = typeof value === 'string' ? 'timestamp' : 'number'
              conditions.push(
                `(fields->>'${field}')::${parameterType} >= $${parameters.length}`
              )
              break;
            case 'lt':
              parameters.push(value)
              parameterType = typeof value === 'string' ? 'timestamp' : 'number'
              conditions.push(
                `(fields->>'${field}')::${parameterType} < $${parameters.length}`
              )
              break;
            case 'lte':
              parameters.push(value)
              parameterType = typeof value === 'string' ? 'timestamp' : 'number'
              conditions.push(
                `(fields->>'${field}')::${parameterType} <= $${parameters.length}`
              )
              break;
          }
        })
      } else if (Array.isArray(predicate) && typeof predicate !== 'string') {
        parameters.push(predicate[0])
        parameters.push(predicate[1])
        conditions.push(`fields->>'${field}' BETWEEN $${parameters.length-1} AND $${parameters.length}`)
      } else {
        parameters.push(predicate)
        conditions.push(`fields->>'${field}'=$${parameters.length}`)
      }
    })
    sets.push(`(${conditions.join(' AND ')})`)
  })
  queryLines.push(`WHERE ${sets.join(' OR\n')}`)
  queryLines.push('ORDER BY id ASC;')
  const sql = queryLines.join('\n')

  return client(pg =>
    pg.query({
      text: sql,
      values: parameters
    })
    .then(
      res => res.rows.map(r => r.id),
      err => {
        const msg = `Searching for matches on '${type}' failed with ${err.stack}`
        log.error(msg)
        throw new Error(msg)
      }
    )
  )
}

function getFieldValue (obj, field) {
  if(/[.]/.test(field)) {
    return getNestedValue(obj, field.split('.'))
  } else {
    return obj[field]
  }
}

function getNestedValue (obj, levels) {
  var f
  var level = obj
  do {
    f = levels.shift()
    if (Array.isArray(level)) {
      level = level.map(o => o[f])
    } else {
      level = level[f]
    }
  } while (levels.length > 0 && level)
  return level
}

function update (client, type, fieldList, updated, original) {
  const set = fieldList.reduce((acc, field) => {
    acc[field] = getFieldValue(updated, field)
    return acc
  }, {})
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

module.exports = function (client, type) {
  return Promise.all([
    createSearchTable(client, type),
    createSetFieldsFunction(client, type)
  ])
  .then(
    () => {
      return {
        find: find.bind(null, client, type),
        update: update.bind(null, client, type)
      }
    }
  )
}
