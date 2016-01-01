var templates = require( "./sql" );
var when = require( "when" );
var zlib = require( "zlib" );
var format = require( "util" ).format;

function createEventTable( client, type ) {
	var sql = templates( "create_event_table", type );
	var create = client.query( sql, function( err ) {
		console.error( format( "Creating the event table for %s failed with %s", type, err ) );
	} );
}

function createPackTable( client, type ) {
	var sql = templates( "create_eventpack_table", type );
	var create = client.query( sql, function( err ) {
		console.error( format( "Creating the eventpack table for %s failed with %s", type, err ) );
	} );
}

function getEventsFor( client, queryName, sql, actorId, lastEventId ) {
	return when.promise( function( resolve, reject ) {
		var rows = [];
		var query = client.query( {
			name: queryName,
			text: sql,
			values: [ actorId, lastEventId || "" ]
		} );
		query.on( "row", function( row ) {
			rows.push( row.content );
		} );
		query.on( "end", function( results ) {
			resolve( rows );
		} );
		query.on( "error", function( err ) {
			reject( err );
		} );
	} );
}

function getEventPackFor( client, queryName, sql, actorId, vectorClock ) {
	return when.promise( function( resolve, reject ) {
		var bytes;
		var query = client.query( {
			name: queryName,
			text: sql,
			values: [ actorId, vectorClock ]
		} );
		query.on( "row", function( row ) {
			bytes = new Buffer( row.content );
		} );
		query.on( "end", function() {
			zlib.unzip( bytes, function( err, inflated ) {
				if( err ) {
					reject( err );
				} else {
					resolve( JSON.parse( inflated ) );
				}
			} );
		} );
		query.on( "error", function( err ) {
			reject( err );
		} );
	} );
}

function getVersion( vector ) {
	var clocks = vector.split( ";" );
	return clocks.reduce( function( version, clock ) {
		var parts = clock.split( ":" );
		return version + parseInt( parts[ 1 ] );
	}, 0 );
}

function storeEvent( client, queryName, sql, actorId, event ) {
	return when.promise( function( resolve, reject ) {
		var version = getVersion( event.vector || "" );
		var query = client.query( {
			name: queryName,
			text: sql,
			values: [
				event.id,
				actorId,
				( isNaN( version ) ? 0 : version ),
				event.vector || "",
				JSON.stringify( event )
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

function storeEvents( client, queryName, sql, actorId, events ) {
	var promises = events.map( storeEvent.bind( null, client, queryName, sql, actorId ) );
	return when.all( promises );
}

function storeEventPack( client, queryName, sql, actorId, vectorClock, events ) {
	var json = JSON.stringify( events );
	return when.promise( function( resolve, reject ) {
		zlib.gzip( json, function( err, bytes ) {
			if( err ) {
				reject( err );
			} else {
				var query = client.query( {
					name: queryName,
					text: sql,
					values: [ actorId, vectorClock, bytes ]
				} );
				query.on( "error", function( err2 ) {
					reject( err2 );
				} );
				query.on( "end", function( result ) {
					resolve();
				} );
			}
		} );
	} );
}

module.exports = function( client, type ) {
	var getEventsSql = templates( "select_events_since", type );
	var getEventPackSql = templates( "select_eventpack", type );
	var storeEventsSql = templates( "insert_event", type );
	var storeEventPackSql = templates( "insert_eventpack", type );

	createEventTable( client, type );
	createPackTable( client, type );

	return {
		getEventsFor: getEventsFor.bind( null, client, "select_" + type + "_events", getEventsSql ),
		getEventPackFor: getEventPackFor.bind( null, client, "select_" + type + "_eventpack", getEventPackSql ),
		storeEvents: storeEvents.bind( null, client, "insert_" + type + "_events", storeEventsSql ),
		storeEventPack: storeEventPack.bind( null, client, "insert_" + type + "_eventpack", storeEventPackSql )
	};
};
