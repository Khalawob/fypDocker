CREATE DATABASE IF NOT EXISTS fyp;
USE fyp;

CREATE TABLE users ( 
    user_id 
    INT AUTO_INCREMENT 
    PRIMARY KEY, username 
    VARCHAR(50) NOT NULL, 
    email VARCHAR(100) NOT NULL UNIQUE, 
    password_hash VARCHAR(255) NOT NULL, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP ) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- FLASHCARD_SET (a deck owned by a user)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flashcard_set (
  set_id        INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  title         VARCHAR(120) NOT NULL,
  description   VARCHAR(500),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  background_color VARCHAR(20) NOT NULL DEFAULT '#121a2a',
  top_color VARCHAR(20) NOT NULL DEFAULT '#121a2a',
  bottom_color VARCHAR(20) NOT NULL DEFAULT '#0b1220',
  text_color VARCHAR(20) NOT NULL DEFAULT '#ffffff',
  accent_color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
  border_radius VARCHAR(20) NOT NULL DEFAULT '12px',
  last_modified DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  

  CONSTRAINT fk_flashcard_set_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_flashcard_set_user_id ON flashcard_set(user_id);


-- ------------------------------------------------------------
-- FLASHCARD (belongs to a set)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flashcard (
  flashcard_id      INT AUTO_INCREMENT PRIMARY KEY,
  set_id            INT NOT NULL,
  question          TEXT NOT NULL,
  answer            TEXT NOT NULL,

  -- difficulty_rating: system-calculated score (you can still set an initial value)
  difficulty_rating DECIMAL(5,2) NOT NULL DEFAULT 0.00,

  times_seen        INT NOT NULL DEFAULT 0,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_flashcard_set
    FOREIGN KEY (set_id) REFERENCES flashcard_set(set_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_flashcard_set_id ON flashcard(set_id);


-- ------------------------------------------------------------
-- FLASHCARD_VARIATION (generated versions like fill-in-the-blank)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flashcard_variation (
  variation_id       INT AUTO_INCREMENT PRIMARY KEY,
  flashcard_id       INT NOT NULL,
  variation_type     VARCHAR(50) NOT NULL,   -- e.g. 'ALL_BLANK_FIRST_LETTERS', 'RANDOM_BLANKS'
  blanked_text       TEXT NOT NULL,
  first_letter_clues TEXT,
  generated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_variation_flashcard
    FOREIGN KEY (flashcard_id) REFERENCES flashcard(flashcard_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_variation_flashcard_id ON flashcard_variation(flashcard_id);
CREATE INDEX idx_variation_type ON flashcard_variation(variation_type);


-- ------------------------------------------------------------
-- PRACTICE_SESSION (one run of practice by a user on a set)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS practice_session (
  session_id       INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  set_id           INT NOT NULL,
  difficulty_mode  VARCHAR(20) NOT NULL,     -- 'EASY', 'MODERATE', 'HARD'
  display_time_per_card INT NOT NULL DEFAULT 10,
  answer_time_limit INT NOT NULL DEFAULT 120, -- seconds before marking as incorrect
  started_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at     DATETIME NULL,
  final_score      INT NOT NULL DEFAULT 0,
  hard_phase VARCHAR(10) NOT NULL DEFAULT 'PREVIEW',
  hard_preview_index INT NOT NULL DEFAULT 0,
  hard_queue TEXT NULL,
  card_order_json LONGTEXT NULL,

  easy_phase VARCHAR(10) NULL DEFAULT 'REVEAL',
  easy_index INT NOT NULL DEFAULT 0,

  moderate_phase VARCHAR(12) NULL DEFAULT 'PREVIEW',
  moderate_group_index INT NOT NULL DEFAULT 0,
  moderate_preview_index INT NOT NULL DEFAULT 0,
  moderate_test_index INT NOT NULL DEFAULT 0,

  CONSTRAINT fk_session_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_session_set
    FOREIGN KEY (set_id) REFERENCES flashcard_set(set_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_session_user_id ON practice_session(user_id);
CREATE INDEX idx_session_set_id ON practice_session(set_id);


-- ------------------------------------------------------------
-- PRACTICE_SETTINGS (1-to-1 with practice_session)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS practice_settings (
  settings_id           INT AUTO_INCREMENT PRIMARY KEY,
  session_id            INT NOT NULL,
  group_size            INT NOT NULL DEFAULT 5,
  randomize_order       BOOLEAN NOT NULL DEFAULT TRUE,

  -- Legacy toggle (keeping for backward compatibility)
  use_adaptive_timing   BOOLEAN NOT NULL DEFAULT FALSE,

  -- New split toggles for adaptive preview timing and adaptive answer timing
  use_adaptive_preview_timing BOOLEAN NOT NULL DEFAULT FALSE,
  use_adaptive_answer_timing  BOOLEAN NOT NULL DEFAULT FALSE,

  reading_speed_modifier FLOAT NOT NULL DEFAULT 1.0,
  prompt_type VARCHAR(50) NOT NULL DEFAULT 'NORMAL_HIDDEN',
  blank_ratio FLOAT NULL,
  blank_style VARCHAR(30) NOT NULL DEFAULT 'FIRST_LETTER',
  seed INT NULL,


  CONSTRAINT fk_settings_session
    FOREIGN KEY (session_id) REFERENCES practice_session(session_id)
    ON DELETE CASCADE,

  CONSTRAINT uq_settings_session UNIQUE (session_id)
) ENGINE=InnoDB;


-- ------------------------------------------------------------
-- PERFORMANCE_RESULT (result per flashcard per attempt in a session)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS performance_result (
  result_id       INT AUTO_INCREMENT PRIMARY KEY,
  session_id      INT NOT NULL,
  flashcard_id    INT NOT NULL,
  is_correct      BOOLEAN NOT NULL,
  user_answer     TEXT,
  time_taken      INT,              -- seconds
  attempt_number  INT NOT NULL DEFAULT 1,

  CONSTRAINT fk_result_session
    FOREIGN KEY (session_id) REFERENCES practice_session(session_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_result_flashcard
    FOREIGN KEY (flashcard_id) REFERENCES flashcard(flashcard_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_result_session_id ON performance_result(session_id);
CREATE INDEX idx_result_flashcard_id ON performance_result(flashcard_id);
CREATE INDEX idx_result_session_flashcard ON performance_result(session_id, flashcard_id);


-- ------------------------------------------------------------
-- HINT (hints attached to a flashcard)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hint (
  hint_id      INT AUTO_INCREMENT PRIMARY KEY,
  flashcard_id INT NOT NULL,
  hint_text    TEXT NOT NULL,
  hint_type    VARCHAR(30) NOT NULL,  -- e.g. 'MNEMONIC', 'CLUE', 'AI'

  CONSTRAINT fk_hint_flashcard
    FOREIGN KEY (flashcard_id) REFERENCES flashcard(flashcard_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_hint_flashcard_id ON hint(flashcard_id);
CREATE INDEX idx_hint_type ON hint(hint_type);


CREATE TABLE IF NOT EXISTS user_flashcard_stats (
  user_id           INT NOT NULL,
  flashcard_id      INT NOT NULL,

  difficulty_rating DECIMAL(5,2) NOT NULL DEFAULT 0.00,  -- 0..100 (per-user)
  times_seen        INT NOT NULL DEFAULT 0,
  correct_count     INT NOT NULL DEFAULT 0,
  incorrect_count   INT NOT NULL DEFAULT 0,
  avg_time_taken    DECIMAL(6,2) NOT NULL DEFAULT 0.00,  -- seconds
  last_seen         DATETIME NULL,

  PRIMARY KEY (user_id, flashcard_id),

  CONSTRAINT fk_stats_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_stats_flashcard
    FOREIGN KEY (flashcard_id) REFERENCES flashcard(flashcard_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_stats_flashcard ON user_flashcard_stats(flashcard_id);


CREATE TABLE IF NOT EXISTS user_calibration (
  user_id INT PRIMARY KEY,
  words_per_second FLOAT NOT NULL DEFAULT 2.5,
  calibrated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_calib_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;


CREATE TABLE IF NOT EXISTS badges (
  badge_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,        -- e.g. "STREAK_7"
  name VARCHAR(80) NOT NULL,               -- e.g. "7-day streak"
  description VARCHAR(255) NULL,
  icon VARCHAR(64) NULL,                   -- optional (frontend chooses icon)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Insert some default badges (Can be expanded later)
INSERT INTO badges (code, name, description) VALUES
('STREAK_1', '1-day streak', 'Log in 1 day in a row'),
('STREAK_3', '3-day streak', 'Log in 3 days in a row'),
('STREAK_7', '7-day streak', 'Log in 7 days in a row'),
('STREAK_30', '30-day streak', 'Log in 30 days in a row')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);


CREATE TABLE IF NOT EXISTS user_badges (
  user_id INT NOT NULL,
  badge_id INT NOT NULL,
  earned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, badge_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (badge_id) REFERENCES badges(badge_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS backgrounds (
  background_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  image_url VARCHAR(255) NOT NULL,
  unlock_badge_code VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO backgrounds (code, name, image_url, unlock_badge_code)
VALUES
  ('PIXEL_STARTER', 'Pixel Starter', '/backgrounds/PixelStarter.jpg', 'STREAK_1'),
  ('PIXEL_CITY', 'City', '/backgrounds/City.jpg', 'STREAK_3'),
  ('PIXEL_CITY_NIGHT', 'Pixel City (Night)', '/backgrounds/CityNight.webp', 'STREAK_7'),
  ('NATURE', 'Pixel Nature', '/backgrounds/Nature.webp', 'STREAK_30')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  image_url = VALUES(image_url),
  unlock_badge_code = VALUES(unlock_badge_code);




CREATE TABLE IF NOT EXISTS user_profile (
  user_id INT PRIMARY KEY,
  display_name VARCHAR(80) NULL,
  bio VARCHAR(255) NULL,
  avatar_url VARCHAR(255) NULL,

  timezone VARCHAR(64) NULL,
  study_goal_minutes_per_day INT NULL,
  preferred_difficulty ENUM('EASY','MODERATE','HARD') NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_login_date DATE NULL,
  selected_background_id INT NULL,

  CONSTRAINT fk_user_profile_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_user_profile_selected_background
    FOREIGN KEY (selected_background_id) REFERENCES backgrounds(background_id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS set_review_reminder (
  reminder_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  set_id INT NOT NULL,
  reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  interval_hours INT NOT NULL,
  next_review_at DATETIME NOT NULL,
  last_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  adaptive_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_accuracy DECIMAL(5,2) NULL,
  last_interval_hours INT NULL,

  CONSTRAINT fk_set_reminder_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_set_reminder_set
    FOREIGN KEY (set_id) REFERENCES flashcard_set(set_id)
    ON DELETE CASCADE,

  CONSTRAINT uq_user_set_reminder UNIQUE (user_id, set_id)
);


CREATE TABLE IF NOT EXISTS user_backgrounds (
  user_background_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  background_id INT NOT NULL,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY unique_user_background (user_id, background_id),

  CONSTRAINT fk_user_backgrounds_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_user_backgrounds_background
    FOREIGN KEY (background_id) REFERENCES backgrounds(background_id)
    ON DELETE CASCADE
);