SELECT
	id,
	vector,
	content
FROM <%=entity%>_eventpack
WHERE id = $1 AND vector = $2;
