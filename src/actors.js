var templates = require( "./sql" );
var when = require( "when" );
var format = require( "util" ).format;

function createTable( client, type ) {
	var sql = templates( "create_snapshot_table", type );
	var create = client.query( sql, function( err, result ) {
		if( err ) {
			console.error( "Creating snapshot table for", type, "failed with", err );
		}
	} );
}

function fetch( client, queryName, sql, actorId ) {
	return when.promise( function( resolve, reject ) {
		var json;
		var query = client.query( {
			name: queryName,
			text: sql,
			values: [ actorId ]
		} );
		query.on( "row", function( row ) {
			json = row.content;
		} );
		query.on( "end", function() {
			if( json ) {
				resolve( json );
			} else {
				resolve( undefined );
			}
		} );
		query.on( "error", function( err ) {
			reject( err );
		} );
	} );
}

function findAncestor() {
	return when.reject( new Error( "Postgres actor stores don't support siblings or ancestry." ) );
}

function getVersion( vector ) {
	var clocks = vector.split( ";" );
	return clocks.reduce( function( version, clock ) {
		var parts = clock.split( ":" );
		return version + parseInt( parts[ 1 ] );
	}, 0 );
}

function store( client, queryName, sql, actorId, vectorClock, actor ) {
	return when.promise( function( resolve, reject ) {
		var version = getVersion( vectorClock || "" );
		var json = JSON.stringify( actor );
		var query = client.query( {
			name: queryName,
			text: sql,
			values: [
				actorId,
				( isNaN( version ) ? 0 : version ),
				vectorClock,
				json
			]
		} );
		query.on( "error", function( err ) {
			reject( err );
		} );
		query.on( "end", function() {
			resolve();
		} );
	} );
}

module.exports = function( client, type ) {
	var fetchSql = templates( "select_snapshot", type );
	var storeSql = templates( "insert_snapshot", type );
	createTable( client, type );
	return {
		fetch: fetch.bind( null, client, "select_" + type + "_snapshot", fetchSql ),
		findAncestor: findAncestor,
		store: store.bind( null, client, "insert_" + type + "_snapshot", storeSql )
	};
};
