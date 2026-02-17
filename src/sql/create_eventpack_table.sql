CREATE TABLE IF NOT EXISTS <%=entity%>_eventpack (
	id				varchar(255)	NOT NULL,
	vector			varchar(9192) 	NOT NULL,
	content			jsonb			NOT NULL,
	PRIMARY KEY ( id, vector )
);
