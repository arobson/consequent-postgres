SELECT
	id,
	aggregate_id,
	aggregate_version,
	aggregate_vector,
	content
FROM <%=entity%>_event
WHERE aggregate_id = $1 AND id > $2;
