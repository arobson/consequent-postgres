CREATE OR REPLACE FUNCTION set_<%=entity%>_search_fields(actorId TEXT, fields JSONB)
RETURNS INT AS $$
DECLARE result int;
DECLARE systemId text;
BEGIN
    SELECT 0 into result;
    SELECT system_id INTO systemId
    FROM <%=entity%>_id_map
    WHERE aggregate_id = actorId
    ORDER BY starting_on DESC
    LIMIT 1;
    IF NOT EXISTS(SELECT * FROM <%=entity%>_search WHERE id = systemId) THEN
        WITH ins_row AS (
            INSERT INTO <%=entity%>_search (id, fields)
	        VALUES ( systemId, fields )
            RETURNING *
        )
        SELECT count(*) FROM ins_row INTO result;
        RETURN result;
    ELSE
        WITH upd_row AS (
            UPDATE <%=entity%>_search
            SET fields = set_<%=entity%>_search_fields.fields
            WHERE id = systemId
            RETURNING *
        )
        SELECT count(*) FROM upd_row INTO result;
        RETURN result;
    END IF;
END;
$$ LANGUAGE plpgsql;
