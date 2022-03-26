# Consequent-Postgres
Provides both actor and event storage adapters for Postgres.

> Note: This approach does not support siblings and is best suited for use with microservice architectures where services own their own database or systems where writes are behind a consistent hash on record/actor id.

## Approach
Snapshots, events and event packs are all stored in actor/entity-specific tables.

## Usage

```javascript
var consequentFn = require( "consequent" );
var stores = require( "consequent-postgres" )(
	"postgresql://dbuser:secretpassword@database.server.com:3211/mydb"
);

var consequent = consequentFn( {
	actorStore: stores.actor,
	eventStore: stores.event,
	searchStore: stores.search
} );
```
