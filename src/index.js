const pg = require('pg')
const { Pool } = require('pg')
const Cursor = require('pg-cursor')
const actorStore = require('./actors')
const eventStore = require('./events')
const searchAdapter = require('./search')

function initialize (config) {
  let pool = new Pool({
    connectionString: config.connectionString || 'postgresql://consequent:pgadmin@localhost:5432'
  })
  const onClient = async function onClient (op) {
    const client = await pool.connect()
    return op(client)
      .then(
        x => {
          client.release()
          return x
        }
      )
      .catch(
        err => {
          client.release()
          throw err
        }
      )
  }
  return {
    actor: {
      create: actorStore.bind(null, onClient)
    },
    event: {
      create: eventStore.bind(null, onClient, pool, Cursor)
    },
    search: {
      create: searchAdapter.bind(null, onClient)
    },
    client: onClient,
    close: () => pool.end()
  }
}

module.exports = initialize
