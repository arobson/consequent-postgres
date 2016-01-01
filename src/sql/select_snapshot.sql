SELECT
	id,
	version,
	vector,
	content
FROM <%=entity%>_snapshot
WHERE id = $1
ORDER BY version DESC
LIMIT 1;
