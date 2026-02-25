# consequent-postgres

PostgreSQL storage adapters for the `consequent` event sourcing framework. Provides actor snapshot storage, event log storage, and a JSONB-based search index. Tables are created automatically per entity type.

## Mental Model

Call `initialize()` to get a factory. Call `.actor.create(type)`, `.event.create(type)`, `.search.create(type)` to get type-specific adapters. Pass these adapters to `consequent`'s init config.

> Note: Does not support sibling/divergence scenarios — best suited for microservices that own their own database, or where writes are routed via consistent hashing on actor ID.

## Wiring Into Consequent

```typescript
import consequent from 'consequent'
import { initialize } from 'consequent-postgres'

const stores = initialize({
  connectionString: 'postgresql://user:password@localhost:5432/mydb'
})

// Default connection string: postgresql://consequent:pgadmin@localhost:5432

const system = consequent({
  actorStore: stores.actor,
  eventStore: stores.event,
  searchStore: stores.search   // optional
})
```

## Standalone Usage

```typescript
import { initialize } from 'consequent-postgres'

const adapter = initialize({
  connectionString: 'postgresql://user:password@localhost:5432/mydb'
})

// Create type-specific adapters (tables are auto-created on first use)
const actors = await adapter.actor.create('user')
const events = await adapter.event.create('user')
const search = await adapter.search.create('user')

// Cleanup
await adapter.close()
```

## Actor Store API

```typescript
const actors = await adapter.actor.create('user')

actors.fetch(actorId)                         // get latest snapshot
actors.fetchByLastEventId(actorId, eventId)   // snapshot at a specific event
actors.fetchByLastEventDate(actorId, date)    // snapshot at a specific date
actors.store(actorId, vectorClock, actor)     // save snapshot
actors.mapIds(systemId, aggregateId)          // register ID mapping
actors.getActorId(systemId, asOf?)            // system ID → business ID
actors.getSystemId(aggregateId, asOf?)        // business ID → system ID
```

## Event Store API

```typescript
const events = await adapter.event.create('user')

events.getEventsFor(actorId)                  // all events for actor
events.getEventsSince(actorId, date)          // events after a date
events.getEventStreamFor(actorId, options?)   // async generator of events
events.storeEvents(actorId, events[])         // append events to log
```

## Search Adapter API

```typescript
const search = await adapter.search.create('user')

// Update search index (call after storing an actor)
await search.update(fieldList, updatedActor, originalActor?)

// Query — array of criteria objects, ORed together
await search.find([{ status: 'active' }])
await search.find([{ age: { gte: 18, lt: 65 } }])
await search.find([{ name: { match: '%john%' } }])       // SQL LIKE
await search.find([{ tags: { contains: 'premium' } }])   // JSONB @>
await search.find([{ score: [0, 100] }])                 // BETWEEN 0 AND 100
await search.find([{ status: 'active' }, { status: 'pending' }])  // OR
```

## Auto-Created Schema

For each type (e.g. `'user'`), four tables are created automatically:

| Table | Purpose |
|---|---|
| `user_snapshot` | Actor state snapshots with vector clock versioning |
| `user_event` | Immutable event log |
| `user_id_map` | System ID ↔ aggregate (business) ID mapping |
| `user_search` | JSONB search index (only if search adapter is used) |

## Development / Local Postgres

```bash
docker run -d \
  -e POSTGRES_USER=consequent \
  -e POSTGRES_PASSWORD=pgadmin \
  -e POSTGRES_DB=consequent \
  -p 5431:5432 \
  postgres:16

make test
```

## Gotchas

- **No sibling support**: If two nodes independently write to the same actor (partition scenario), this adapter does not reconcile divergent snapshots. Route writes for a given actor to a single node (consistent hashing) or run in a single-writer topology.
- **Auto-table creation**: Tables are created when `.create(type)` is first called. First call may be slightly slower.
- **Connection string default**: `postgresql://consequent:pgadmin@localhost:5432` — matches the Docker dev command above.
- **`searchStore` is optional**: Only needed if you use `consequent`'s `find()` API. Actor and event stores are always required.

## Used With

- `consequent` — pass `stores.actor`, `stores.event`, `stores.search` to `consequent({ actorStore, eventStore, searchStore })`
