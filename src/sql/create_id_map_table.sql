CREATE TABLE IF NOT EXISTS <%=entity%>_id_map (
	system_id				character(42)	NOT NULL,
	aggregate_id			character(42)	NOT NULL,
	starting_on				timestamp with time zone 		DEFAULT now(),
	PRIMARY KEY (system_id, aggregate_id, starting_on)
);

CREATE INDEX IF NOT EXISTS <%=entity%>_id_map_system_idx on <%=entity%>_id_map(system_id);
CREATE INDEX IF NOT EXISTS <%=entity%>_id_map_aggregate_idx on <%=entity%>_id_map(aggregate_id);
