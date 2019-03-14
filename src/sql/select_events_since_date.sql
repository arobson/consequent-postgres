SELECT
	id,
	created_on,
	system_id,
	version,
	vector,
	content
FROM <%=entity%>_event
WHERE system_id = $1 AND created_on >= $2
ORDER BY id ASC;
