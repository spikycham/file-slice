PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE files (
file_hash TEXT PRIMARY KEY,
file_size INTEGER NOT NULL,
filename TEXT NOT NULL
);
CREATE TABLE upload_sessions (
upload_id TEXT PRIMARY KEY,
file_hash TEXT NOT NULL,
filename TEXT NOT NULL,
chunk_size TEXT NOT NULL
);
INSERT INTO upload_sessions VALUES('id1','a1b2c3','1.txt','10');
INSERT INTO upload_sessions VALUES('gbfvje75181768376937637','123123','001.jpg','10');
CREATE TABLE chunks (
id INTEGER PRIMARY KEY,
upload_id TEXT NOT NULL,
chunk_hash TEXT NOT NULL,
chunk_index INTEGER NOT NULL,
total_index INTEGER NOT NULL,
chunk_size INTEGER NOT NULL
);
INSERT INTO chunks VALUES(1,'id1','a1b2',0,3,10);
INSERT INTO chunks VALUES(2,'id1','b2c3',1,3,10);
COMMIT;
