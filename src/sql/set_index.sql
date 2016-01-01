DO $$
BEGIN
IF NOT EXISTS ( SELECT * FROM secondary_index WHERE aggregate_id = $1 AND index_name = $3 ) THEN
	INSERT INTO secondary_index (aggregate_id, aggregate, index_name, index_value)
	VALUES ( $1, $2, $3, $4 );
ELSE
	UPDATE secondary_index
	SET index_value = $4
	WHERE aggregate_id = $1 AND aggregate = $2 AND index_name = $3;
END IF;
END$$;
