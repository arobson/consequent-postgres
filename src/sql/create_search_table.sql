DROP TABLE IF EXISTS <%=entity%>_search;
CREATE TABLE IF NOT EXISTS <%=entity%>_search (
    id		        character(42)	PRIMARY KEY,
    created_on		timestamp with time zone 		DEFAULT now(),
	fields			jsonb           NOT NULL
);

CREATE INDEX IF NOT EXISTS <%=entity%>_search_fields_idx ON <%=entity%>_search
    USING GIN (fields);
