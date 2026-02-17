import { Pool } from 'pg'
import Cursor from 'pg-cursor'
import { actorStore } from './actors.js'
import { eventStore } from './events.js'
import { searchAdapter } from './search.js'
import type { Config, ConsequentPostgres, OnClient } from './types.js'

export function initialize(config: Config): ConsequentPostgres {
  const pool = new Pool({
    connectionString: config.connectionString || 'postgresql://consequent:pgadmin@localhost:5432'
  })

  const onClient: OnClient = async function onClient(op) {
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
      create: (type: string) => actorStore(onClient, type)
    },
    event: {
      create: (type: string) => eventStore(onClient, pool, Cursor, type)
    },
    search: {
      create: (type: string) => searchAdapter(onClient, type)
    },
    client: onClient,
    close: () => pool.end()
  }
}

// Export as default for backward compatibility
export default initialize

// Re-export types for consumers
export type {
  Config,
  Actor,
  Event,
  EventStreamOptions,
  AsyncIterableResult,
  ClientOperation,
  OnClient,
  ActorStore,
  EventStore,
  SearchAdapter,
  SearchPredicate,
  SearchCriteria,
  ConsequentPostgres
} from './types.js'
