CREATE OR REPLACE FUNCTION set_<%=entity%>_id_map(systemId TEXT, aggregateId TEXT)
RETURNS INT AS $$
DECLARE result int;
BEGIN
    SELECT 0 into result;
    IF NOT EXISTS(SELECT * FROM <%=entity%>_id_map WHERE system_id = systemId) THEN
        WITH ins_row AS (
            INSERT INTO <%=entity%>_id_map (system_id, aggregate_id)
            VALUES ( systemId, aggregateId )
            RETURNING *
        )
        SELECT count(*) FROM ins_row INTO result;
        RETURN result;
    ELSE
        WITH upd_row AS (
            UPDATE <%=entity%>_id_map
            SET aggregate_id = aggregateId, starting_on = now()
            WHERE system_id = systemId
            RETURNING *
        )
        SELECT count(*) FROM upd_row INTO result;
        RETURN result;
    END IF;
END;
$$ LANGUAGE plpgsql;
