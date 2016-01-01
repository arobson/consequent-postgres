SELECT
	s.id,
	s.version,
	s.vector,
	s.content
FROM secondary_index i
JOIN <%=entity%>_snapshot s ON s.id = i.aggregate_id
WHERE
	aggregate = '<%=entity%>' AND
	index_name = $1 AND
	index_value = $2
LIMIT 1;
