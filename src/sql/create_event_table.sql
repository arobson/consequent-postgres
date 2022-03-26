CREATE TABLE IF NOT EXISTS <%=entity%>_event (
	id				character(42)	PRIMARY KEY,
	created_on		timestamp with time zone 		DEFAULT now(),
	system_id		character(42)	NOT NULL,
	version			bigint			NOT NULL,
	vector			varchar(9192) 	NOT NULL,
	content			jsonb
);

CREATE INDEX IF NOT EXISTS <%=entity%>_event_system_id_idx on <%=entity%>_event(system_id);
