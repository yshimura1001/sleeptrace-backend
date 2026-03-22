-- Reset Tables
DROP TABLE IF EXISTS sleep_logs;
DROP TABLE IF EXISTS users;

-- Re-create Tables
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sleep_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  sleep_date TEXT NOT NULL,
  sleep_score INTEGER NOT NULL,
  bed_time TEXT NOT NULL,
  wakeup_time TEXT NOT NULL,
  sleep_duration INTEGER NOT NULL,
  wakeup_count INTEGER NOT NULL,
  deep_sleep_continuity INTEGER NOT NULL,
  deep_sleep_percentage INTEGER NOT NULL,
  light_sleep_percentage INTEGER NOT NULL,
  rem_sleep_percentage INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Seed Users (PBKDF2: SHA-256, 100000 iterations, format: salt:hash)
INSERT INTO users (username, password_hash, is_public) VALUES ('yasuaki', '38ab0e407ee0daaae729b00484175cd4:7acf0632f957182278266723de7c53e7025e45171d8607e2d7b2d33534d36309', 1);
INSERT INTO users (username, password_hash) VALUES ('guest', '4b2b84ce6eaac2a104eb809197e231e0:c58fe856ca3a588e76c7373050ffe9393fa104e892cfc93bdf894276263ebd6f');
