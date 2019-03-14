SELECT
    system_id
FROM <%=entity%>_id_map
WHERE aggregate_id = $1 AND starting_on <= $2
ORDER BY starting_on DESC
LIMIT 1;