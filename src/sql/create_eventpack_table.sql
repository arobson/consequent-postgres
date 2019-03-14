CREATE TABLE IF NOT EXISTS <%=entity%>_eventpack (
	id				character(42)	NOT NULL,
	vector			varchar(9192) 	NOT NULL,
	content			bytes,
	PRIMARY KEY ( id, vector )
);
