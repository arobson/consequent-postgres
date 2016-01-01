CREATE TABLE IF NOT EXISTS <%=entity%>_snapshot (
	id			character(42)	NOT NULL,
	version		bigint			NOT NULL,
	vector		varchar(9192)	NOT NULL,
	content		json			NOT NULL,
	PRIMARY KEY( id, version )
);
