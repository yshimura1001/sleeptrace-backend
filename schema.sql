CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sleep_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,     -- ユーザーID (FK)
  sleep_date TEXT NOT NULL,                -- 睡眠日 ex. 2026-01-12
  sleep_score INTEGER NOT NULL,            -- 総合点数 ex. 0～100
  bed_time TEXT NOT NULL,                  -- 入眠時間 ex. 23:00
  wakeup_time TEXT NOT NULL,               -- 起床時間 ex. 07:00
  sleep_duration INTEGER NOT NULL,         -- 夜間の睡眠時間(分単位) ex. 480=60*8
  wakeup_count INTEGER NOT NULL, 	         -- 目が覚めた回数
  deep_sleep_continuity INTEGER NOT NULL,  -- 深い睡眠の持続性 ex. 0～100
  deep_sleep_percentage INTEGER NOT NULL,  -- 深い睡眠の割合(%) ex. 0～100
  light_sleep_percentage INTEGER NOT NULL, -- 浅い睡眠の割合(%) ex. 0～100
  rem_sleep_percentage INTEGER NOT NULL,   -- レム睡眠の割合(%) ex. 0～100
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);