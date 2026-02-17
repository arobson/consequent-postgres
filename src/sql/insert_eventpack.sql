INSERT INTO <%=entity%>_eventpack ( id, vector, content )
VALUES ( $1, $2, $3 )
ON CONFLICT (id, vector)
DO UPDATE SET content = EXCLUDED.content;
