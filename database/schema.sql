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

  -- Legacy toggle (keep for backward compatibility)
  use_adaptive_timing   BOOLEAN NOT NULL DEFAULT FALSE,

  -- New split toggles
  use_adaptive_preview_timing BOOLEAN NOT NULL DEFAULT FALSE,
  use_adaptive_answer_timing  BOOLEAN NOT NULL DEFAULT FALSE,

  reading_speed_modifier FLOAT NOT NULL DEFAULT 1.0,
  prompt_type VARCHAR(50) NOT NULL DEFAULT 'NORMAL_HIDDEN',
  blank_ratio FLOAT NULL,
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


CREATE TABLE IF NOT EXISTS user_profile (
  user_id INT PRIMARY KEY,
  display_name VARCHAR(80) NULL,
  bio VARCHAR(255) NULL,
  avatar_url VARCHAR(255) NULL,

  -- app preferences / personalization
  timezone VARCHAR(64) NULL,
  study_goal_minutes_per_day INT NULL,
  preferred_difficulty ENUM('EASY','MODERATE','HARD') NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_user_profile_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE CASCADE
);


