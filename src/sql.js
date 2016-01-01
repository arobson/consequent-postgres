var fs = require( "fs" );
var path = require( "path" );
var _ = require( "lodash" );

var create_event_table = getTemplate( "create_event_table.sql" );
var create_eventpack_table = getTemplate( "create_eventpack_table.sql" );
var create_secondary_index_table = getTemplate( "create_secondary_index_table.sql" );
var create_snapshot_table = getTemplate( "create_snapshot_table.sql" );
var insert_event = getTemplate( "insert_event.sql" );
var insert_eventpack = getTemplate( "insert_eventpack.sql" );
var insert_snapshot = getTemplate( "insert_snapshot.sql" );
var select_eventpack = getTemplate( "select_eventpack.sql" );
var select_events_since = getTemplate( "select_events_since.sql" );
var select_snapshot = getTemplate( "select_snapshot.sql" );
var select_snapshot_by_index = getTemplate( "select_snapshot_by_index.sql" );
var set_index = getTemplate( "set_index.sql" );
var templates = {
	create_event_table: create_event_table,
	create_eventpack_table: create_eventpack_table,
	create_secondary_index_table: create_secondary_index_table,
	create_snapshot_table: create_snapshot_table,
	insert_event: insert_event,
	insert_eventpack: insert_eventpack,
	insert_snapshot: insert_snapshot,
	select_eventpack: select_eventpack,
	select_events_since: select_events_since,
	select_snapshot: select_snapshot,
	select_snapshot_by_index: select_snapshot_by_index,
	set_index: set_index
};

function getTemplate( name ) {
	return _.template( fs.readFileSync( path.join( __dirname, "./sql", name ) ) );
}

module.exports = function resolveTemplate( name, entity ) {
	return templates[ name ]( { entity: entity } );
};
