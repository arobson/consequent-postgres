CREATE TABLE IF NOT EXISTS secondary_index (
	aggregate_id			character(42)	NOT NULL,
	aggregate 				varchar(1028)	NOT NULL,
	index_name				varchar(1028)	NOT NULL,
	index_value				text			NOT NULL,
	PRIMARY KEY (aggregate_id, index_name, index_value)
);
