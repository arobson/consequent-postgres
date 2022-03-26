CREATE TABLE IF NOT EXISTS <%=entity%>_snapshot (
	id								character(42)	NOT NULL,
	version							bigint 			NOT NULL,
	vector							varchar(9192)	NOT NULL,
	content							jsonb 			NOT NULL,
	lastEventId						character(42) 	NOT NULL,
	lastCommandId					character(42)  	NOT NULL,
	lastCommandHandledOn			timestamp with time zone  		NOT NULL,
	lastEventAppliedOn				timestamp with time zone  		NOT NULL,
	PRIMARY KEY( id, version )
);
