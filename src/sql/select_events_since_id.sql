SELECT
	id,
	created_on,
	system_id,
	version,
	vector,
	content
FROM <%=entity%>_event
WHERE system_id = $1 AND id > $2
ORDER BY id ASC;
