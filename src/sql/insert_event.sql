INSERT INTO <%=entity%>_event ( id, aggregate_id, aggregate_version, aggregate_vector, content )
VALUES ( $1, $2, $3, $4, $5 );
