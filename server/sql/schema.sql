-- Медиаярмарка: схема MySQL 8
-- Идемпотентна: можно запускать повторно.

CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(24)  NOT NULL PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin','participant','volunteer') NOT NULL,
  team          VARCHAR(120) NOT NULL DEFAULT '',
  qr            VARCHAR(64)  NOT NULL,
  created_at    BIGINT       NOT NULL,
  UNIQUE KEY uniq_username (username),
  UNIQUE KEY uniq_qr (qr),
  KEY idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id          VARCHAR(24)  NOT NULL PRIMARY KEY,
  title       VARCHAR(160) NOT NULL,
  description TEXT         NULL,
  type        ENUM('station','quiz','game') NOT NULL,
  points      INT          NOT NULL DEFAULT 0,
  lat         DECIMAL(10,7) NULL,
  lng         DECIMAL(10,7) NULL,
  created_by  VARCHAR(24)  NULL,
  created_at  BIGINT       NOT NULL,
  KEY idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Журнал начислений. Одна строка на пару (участник, задание):
-- защищает от повторного начисления за одну и ту же станцию/квиз/игру.
CREATE TABLE IF NOT EXISTS awards (
  id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(24) NOT NULL,
  task_id     VARCHAR(24) NOT NULL DEFAULT '',
  kind        ENUM('station','quiz','game','manual') NOT NULL DEFAULT 'manual',
  points      INT         NOT NULL DEFAULT 0,
  awarded_by  VARCHAR(24) NULL,
  note        VARCHAR(255) NOT NULL DEFAULT '',
  awarded_at  BIGINT      NOT NULL,
  UNIQUE KEY uniq_user_task (user_id, task_id),
  KEY idx_awarded_at (awarded_at),
  CONSTRAINT fk_awards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(24) NOT NULL,
  correct    INT         NOT NULL DEFAULT 0,
  total      INT         NOT NULL DEFAULT 0,
  created_at BIGINT      NOT NULL,
  KEY idx_user (user_id),
  CONSTRAINT fk_quiz_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Лучший результат в змейке: очки начисляются только за улучшение.
CREATE TABLE IF NOT EXISTS game_best (
  user_id    VARCHAR(24) NOT NULL PRIMARY KEY,
  task_id    VARCHAR(24) NOT NULL DEFAULT '',
  best       INT         NOT NULL DEFAULT 0,
  updated_at BIGINT      NOT NULL,
  CONSTRAINT fk_game_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64)  NOT NULL PRIMARY KEY,
  v VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (k, v) VALUES
  ('quiz_points_per_correct', '10'),
  ('snake_points_per_score', '1'),
  ('station_points', '50'),
  ('event_active', '1'),
  ('registration_open', '1');
