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
WHERE id = $1 AND lastEventAppliedOn >= $2
ORDER BY version ASC
LIMIT 1;
