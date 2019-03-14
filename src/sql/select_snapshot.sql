SELECT
	id,
	version,
	vector,
	content,
	lastEventId,
	lastCommandId,
	lastCommandHandledOn,
	lastEventAppliedOn
FROM <%=entity%>_snapshot
WHERE id = $1
ORDER BY version DESC
LIMIT 1;
