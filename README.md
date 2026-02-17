# Consequent-Postgres

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

PostgreSQL storage adapters for the [Consequent](https://github.com/arobson/consequent) event sourcing framework.

Provides actor (snapshot), event, and search storage implementations backed by PostgreSQL.

> **Note**: This approach does not support siblings and is best suited for microservice architectures where services own their own database, or systems where writes are routed via consistent hashing on record/actor ID.

## Features

- ✅ **ESM-only** - Modern JavaScript module system
- ✅ **TypeScript** - Full type safety with `.d.ts` declarations
- ✅ **Actor snapshots** - Efficient state storage with versioning
- ✅ **Event storage** - Immutable event log with streaming support
- ✅ **Search adapter** - Flexible querying with JSONB fields
- ✅ **ID mapping** - System ID ↔ Aggregate ID translation

## Installation

```bash
npm install consequent-postgres
```

**Requirements:**
- Node.js >= 18.0.0
- PostgreSQL >= 12

## Quick Start

### JavaScript (ESM)

```javascript
import { initialize } from 'consequent-postgres'

const adapter = initialize({
  connectionString: 'postgresql://user:password@localhost:5432/mydb'
})

// Create storage adapters for a specific entity type
const actors = await adapter.actor.create('user')
const events = await adapter.event.create('user')
const search = await adapter.search.create('user')

// Store an actor snapshot
await actors.store('user-123', 'a:1', {
  id: 'user-123',
  name: 'John Doe',
  email: 'john@example.com',
  lastEventId: 'evt-456',
  lastCommandId: 'cmd-789',
  lastCommandHandledOn: new Date().toISOString(),
  lastEventAppliedOn: new Date().toISOString()
})

// Retrieve actor snapshot
const actor = await actors.fetch('user-123')

// Store events
await events.storeEvents('user-123', [
  {
    id: 'evt-456',
    _createdOn: new Date().toISOString(),
    actorId: 'user-123',
    vector: 'a:1',
    type: 'UserCreated',
    data: { name: 'John Doe' }
  }
])

// Retrieve events
const eventList = await events.getEventsFor('user-123')
const recentEvents = await events.getEventsSince('user-123', '2024-01-01T00:00:00.000Z')

// Close connection pool
await adapter.close()
```

### TypeScript

```typescript
import { initialize } from 'consequent-postgres'
import type { ConsequentPostgres, Actor, Event } from 'consequent-postgres'

const adapter: ConsequentPostgres = initialize({
  connectionString: 'postgresql://user:password@localhost:5432/mydb'
})

const actors = await adapter.actor.create('user')

const actor: Actor = {
  id: 'user-123',
  name: 'John Doe',
  lastEventId: 'evt-456',
  lastCommandId: 'cmd-789',
  lastCommandHandledOn: new Date().toISOString(),
  lastEventAppliedOn: new Date().toISOString()
}

await actors.store('user-123', 'a:1', actor)
```

### Using with Consequent

```javascript
import consequent from 'consequent'
import { initialize } from 'consequent-postgres'

const stores = initialize({
  connectionString: 'postgresql://user:password@localhost:5432/mydb'
})

const system = consequent({
  actorStore: stores.actor,
  eventStore: stores.event,
  searchStore: stores.search
})
```

## API Reference

### `initialize(config)`

Creates a new PostgreSQL adapter instance.

**Parameters:**
- `config.connectionString` (string, optional): PostgreSQL connection string
  - Default: `'postgresql://consequent:pgadmin@localhost:5432'`

**Returns:** `ConsequentPostgres`

### Actor Store

Created via `adapter.actor.create(type)`

#### Methods

- `fetch(actorId)` - Retrieve actor snapshot by ID
- `fetchByLastEventId(actorId, eventId)` - Fetch snapshot at specific event
- `fetchByLastEventDate(actorId, date)` - Fetch snapshot at specific date
- `store(actorId, vectorClock, actor)` - Save actor snapshot
- `mapIds(systemId, aggregateId)` - Map system ID to aggregate ID
- `getActorId(systemId, asOf?)` - Get aggregate ID from system ID
- `getSystemId(aggregateId, asOf?)` - Get system ID from aggregate ID

### Event Store

Created via `adapter.event.create(type)`

#### Methods

- `getEventsFor(actorId, lastEventId?)` - Get all events for actor, optionally after an event ID
- `getEventsSince(actorId, date)` - Get events after a date
- `getEventStreamFor(actorId, options)` - Get async iterable event stream
  - Options: `filter`, `sinceId`, `since`, `untilId`, `until`
- `storeEvents(actorId, events)` - Store array of events

### Search Adapter

Created via `adapter.search.create(type)`

#### Methods

- `find(criteria)` - Search for actors matching criteria
- `update(fieldList, updated, original?)` - Update searchable fields

**Search Criteria Examples:**

```javascript
// Equality
await search.find([{ status: 'active' }])

// Comparison operators
await search.find([{ age: { gte: 18, lt: 65 } }])

// String matching
await search.find([{ name: { match: '%john%' } }])

// Contains (JSONB)
await search.find([{ tags: { contains: 'premium' } }])

// Range (BETWEEN)
await search.find([{ score: [0, 100] }])

// Multiple criteria (OR)
await search.find([
  { status: 'active' },
  { status: 'pending' }
])
```

## Database Schema

Tables are automatically created per entity type:

- `{type}_snapshot` - Actor snapshots with version tracking
- `{type}_event` - Immutable event log
- `{type}_id_map` - System ID to aggregate ID mapping
- `{type}_search` - JSONB-based search index

## Development

### Using Make

```bash
# Show all commands
make help

# Setup development environment
make dev

# Run tests
make test

# Run tests with coverage
make test-coverage

# Build
make build

# Lint
make lint

# Full CI pipeline
make ci
```

See [MAKEFILE_GUIDE.md](./MAKEFILE_GUIDE.md) for detailed documentation.

### Manual Setup

```bash
# Install dependencies
npm install

# Start PostgreSQL (Docker)
docker run -d \
  -e POSTGRES_USER=consequent \
  -e POSTGRES_PASSWORD=pgadmin \
  -e POSTGRES_DB=consequent \
  -p 5431:5432 \
  postgres:16

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Migration from v1.x

Version 2.0 is a major rewrite with breaking changes:

### Breaking Changes

1. **ESM Only** - No longer supports CommonJS `require()`
2. **Node.js >= 18** - Minimum version requirement
3. **Import syntax changed:**

```javascript
// v1.x (CommonJS)
const Adapter = require('consequent-postgres')
const stores = Adapter({ connectionString: '...' })

// v2.x (ESM)
import { initialize } from 'consequent-postgres'
const stores = initialize({ connectionString: '...' })
```

4. **TypeScript** - Full type definitions included
5. **Async initialization** - Actor/event/search stores return promises

### Migration Steps

1. Update to Node.js 18+
2. Add `"type": "module"` to your `package.json` (or use `.mjs` files)
3. Change `require()` to `import`
4. Change function name from default export to named `initialize`
5. Add `await` when creating stores: `await adapter.actor.create(type)`

## TypeScript Types

All types are exported from the main module:

```typescript
import type {
  ConsequentPostgres,
  Config,
  Actor,
  Event,
  EventStore,
  ActorStore,
  SearchAdapter,
  SearchCriteria,
  OnClient
} from 'consequent-postgres'
```

## Testing

Tests require a running PostgreSQL instance:

```bash
# Using Make
make db-start
make test

# Manual
docker run -d \
  -e POSTGRES_USER=consequent \
  -e POSTGRES_PASSWORD=pgadmin \
  -e POSTGRES_DB=consequent \
  -p 5431:5432 \
  postgres:16

npm test
```

## License

MIT © Alex Robson

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Run tests: `make ci`
5. Commit: `git commit -am 'Add feature'`
6. Push: `git push origin my-feature`
7. Create a Pull Request

## Links

- [GitHub Repository](https://github.com/arobson/consequent-postgres)
- [Issue Tracker](https://github.com/arobson/consequent-postgres/issues)
- [Consequent Framework](https://github.com/arobson/consequent)
