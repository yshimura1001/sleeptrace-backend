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

-- Seed Users
-- Password hash for "password" (SHA-256 of "password")
-- Note: In real app we should use salt + multiple rounds, but for simplicity here we use raw SHA-256 hex string or handled by backend logic.
-- Actually, the backend will verify using WebCrypto. Let's just put a placeholder here, assuming we can login via Signup first OR assume a known hash.
-- Let's rely on Signup for creating valid hashes, or create 'yasuaki' via backend logic later.
-- Ideally we insert them now. "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8" is SHA-256 for "password".

INSERT INTO users (username, password_hash, is_public) VALUES ('yasuaki', '0f5a5eed0bc5c41cd6b434e7c01a350aabf81b85a2bbd5aa7673e697ce4b44f4', 1);
INSERT INTO users (username, password_hash) VALUES ('guest', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8');
