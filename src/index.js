var pg = require( "pg" );
var actorStore = require( "./actors" );
var eventStore = require( "./events" );

function initialize( config ) {
	var client = new pg.Client( {
		database: config.database || config.user,
		user: config.user,
		password: config.password,
		host: config.host || "localhost",
		port: config.port || 5432
	} );
	client.connect();
	return {
		actor: actorStore.bind( null, client ),
		event: eventStore.bind( null, client )
	};
}

module.exports = initialize;
