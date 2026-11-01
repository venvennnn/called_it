-- Applied transactionally by Store initialization. SQLite user_version=1.
-- One installation has one broadcaster; demo/live use separate database paths.
CREATE TABLE IF NOT EXISTS rounds(id INTEGER PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, delivery TEXT UNIQUE, round_id INTEGER, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operations(key TEXT PRIMARY KEY, response TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resolutions(round_id INTEGER NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(round_id,revision));
