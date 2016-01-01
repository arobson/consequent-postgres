# Consequent-Postgres
Provides both actor and event storage adapters for Postgres.

> Note: This approach does not support siblings and is best suited for use with microservice architectures where services own their own database.

## Approach
Snapshots, events and event packs are all stored in actor/entity-specific tables.

## Usage

```javascript
var consequentFn = require( "consequent" );
var stores = require( "consequent-postgres" )( {
	host: "postgres-server",
	database: "database-name",
	user: "user-name",
	password: "user-pw"
} );

var consequent = consequentFn( {
	actorStore: stores.actor,
	eventStore: stores.event
} );
```

## To Do
 * test coverage
 * complete support for secondary indexing
