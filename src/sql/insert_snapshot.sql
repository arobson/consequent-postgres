INSERT INTO <%=entity%>_snapshot ( 
  id,
  version,
  vector,
  content,
  lastEventId,
  lastCommandId,
  lastCommandHandledOn,
  lastEventAppliedOn
)
VALUES ( $1, $2, $3, $4, $5, $6, $7, $8 );
