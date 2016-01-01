CREATE TABLE IF NOT EXISTS <%=entity%>_eventpack (
	aggregate_id			character(42)	NOT NULL,
	aggregate_vector		varchar(9192) 	NOT NULL,
	content			bytea,
	PRIMARY KEY ( aggregate_id, aggregate_vector )
);
