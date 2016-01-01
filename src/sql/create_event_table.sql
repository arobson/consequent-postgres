CREATE TABLE IF NOT EXISTS <%=entity%>_event (
	id						character(42)	PRIMARY KEY,
	aggregate_id			character(42)	NOT NULL,
	aggregate_version		bigint			NOT NULL,
	aggregate_vector		varchar(9192) 	NOT NULL,
	content			json
);


DO $$
BEGIN
	IF ( to_regclass( '<%=entity%>_event_aggregate_id_idx' ) IS NULL ) THEN
		CREATE INDEX <%=entity%>_event_aggregate_id_idx on <%=entity%>_event(aggregate_id);
	END IF;
END$$;
