SELECT
	aggregate_id,
	aggregate_vector,
	content
FROM <%=entity%>_eventpack
WHERE aggregate_id = $1 AND aggregate_vector = $2;
