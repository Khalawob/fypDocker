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
  icon VARCHAR(255) NULL,                   -- optional (frontend chooses icon)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Insert some default badges (Can be expanded later)
INSERT INTO badges (code, name, description, icon) VALUES
('STREAK_1', '1-day streak', 'Log in 1 day in a row', NULL),
('STREAK_3', '3-day streak', 'Log in 3 days in a row', NULL),
('STREAK_7', '7-day streak', 'Log in 7 days in a row', NULL),
('STREAK_30', '30-day streak', 'Log in 30 days in a row', NULL),
('FIRST_SET', 'First Steps', 'Create your first flashcard set', '/Badges/Book.webp'),
('PERFECT_RECALL', 'Perfect Recall', 'Complete a practice session with 100% accuracy', '/Badges/PerfectRecall.jpg'),
('CONSISTENT_ACCURACY', 'Consistent Accuracy', 'Complete 5 practice sessions with at least 80% final score', '/Badges/ConsistentAccuracy.jpg'),
('EASY_EXPLORER', 'Easy Explorer', 'Complete a practice session in EASY mode', '/Badges/EasyExplorer.jpg'),
('MODERATE_MASTER', 'Moderate Master', 'Complete a practice session in MODERATE mode', '/Badges/ModerateMaster.jpg'),
('HARDCORE_HERO', 'Hardcore Hero', 'Complete a practice session in HARD mode', '/Badges/HardcoreHero.png'),
('CALIBRATED_READER', 'Calibrated Reader', 'Complete reading calibration for the first time', '/Badges/CalibratedReader.webp'),
('ADAPTIVE_LEARNER', 'Adaptive Learner', 'Complete a practice session using adaptive timing', '/Badges/AdaptiveLearner.jpg')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  icon = VALUES(icon);


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

-- ------------------------------------------------------------
-- MULTIPLAYER ROOM
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS multiplayer_room (
  room_id INT AUTO_INCREMENT PRIMARY KEY,
  host_user_id INT NOT NULL,
  set_id INT NOT NULL,
  join_code VARCHAR(12) NOT NULL UNIQUE,
  title VARCHAR(120) NULL,

  difficulty_mode VARCHAR(20) NOT NULL DEFAULT 'EASY',
  prompt_type VARCHAR(50) NOT NULL DEFAULT 'NORMAL_HIDDEN',

  display_time_per_card INT NOT NULL DEFAULT 10,
  answer_time_limit INT NOT NULL DEFAULT 120,
  group_size INT NOT NULL DEFAULT 5,
  randomize_order TINYINT(1) NOT NULL DEFAULT 1,

  blank_style VARCHAR(30) NOT NULL DEFAULT 'FIRST_LETTER',
  blank_ratio FLOAT NULL,
  seed INT NULL,

  card_order_json LONGTEXT NULL,

  easy_phase VARCHAR(10) NULL DEFAULT 'PREVIEW',
  easy_index INT NOT NULL DEFAULT 0,

  moderate_phase VARCHAR(12) NULL DEFAULT 'PREVIEW',
  moderate_group_index INT NOT NULL DEFAULT 0,
  moderate_preview_index INT NOT NULL DEFAULT 0,
  moderate_test_index INT NOT NULL DEFAULT 0,

  hard_phase VARCHAR(10) NOT NULL DEFAULT 'PREVIEW',
  hard_preview_index INT NOT NULL DEFAULT 0,
  hard_queue LONGTEXT NULL,

  current_card_index INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'LOBBY',
  phase VARCHAR(20) NOT NULL DEFAULT 'LOBBY',
  phase_ends_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,

  CONSTRAINT fk_multiplayer_room_host
    FOREIGN KEY (host_user_id) REFERENCES users(user_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_multiplayer_room_set
    FOREIGN KEY (set_id) REFERENCES flashcard_set(set_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_multiplayer_room_host ON multiplayer_room(host_user_id);
CREATE INDEX idx_multiplayer_room_set ON multiplayer_room(set_id);
CREATE INDEX idx_multiplayer_room_code ON multiplayer_room(join_code);

-- ------------------------------------------------------------
-- MULTIPLAYER PARTICIPANT
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS multiplayer_participant (
  participant_id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  user_id INT NULL,
  display_name VARCHAR(80) NOT NULL,

  score INT NOT NULL DEFAULT 0,

  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  is_host TINYINT(1) NOT NULL DEFAULT 0,
  is_playing TINYINT(1) NOT NULL DEFAULT 1,
  is_connected TINYINT(1) NOT NULL DEFAULT 1,

  CONSTRAINT fk_multiplayer_participant_room
    FOREIGN KEY (room_id) REFERENCES multiplayer_room(room_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_multiplayer_participant_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_multiplayer_participant_room ON multiplayer_participant(room_id);
CREATE INDEX idx_multiplayer_participant_user ON multiplayer_participant(user_id);

-- ------------------------------------------------------------
-- MULTIPLAYER ANSWER
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS multiplayer_answer (
  answer_id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  participant_id INT NOT NULL,
  flashcard_id INT NOT NULL,

  user_answer TEXT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  time_taken INT NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_multiplayer_answer_room
    FOREIGN KEY (room_id) REFERENCES multiplayer_room(room_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_multiplayer_answer_participant
    FOREIGN KEY (participant_id) REFERENCES multiplayer_participant(participant_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_multiplayer_answer_flashcard
    FOREIGN KEY (flashcard_id) REFERENCES flashcard(flashcard_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_multiplayer_answer_room ON multiplayer_answer(room_id);
CREATE INDEX idx_multiplayer_answer_participant ON multiplayer_answer(participant_id);
CREATE INDEX idx_multiplayer_answer_flashcard ON multiplayer_answer(flashcard_id);
CREATE INDEX idx_multiplayer_answer_room_flashcard ON multiplayer_answer(room_id, flashcard_id);

-- TEST USER WITH EVERYTHING UNLOCKED

-- password hash corresponds to "Roehampton"
INSERT INTO users (user_id, username, email, password_hash)
VALUES (
  999,
  'testuser',
  'testuser@example.com',
  '$2b$10$DJcAhiMaIRQ83eH16LRc/.vPoghzvMV304Va/J.ejm/L/qnZ0E3Zu'
)
ON DUPLICATE KEY UPDATE
  username = VALUES(username),
  email = VALUES(email),
  password_hash = VALUES(password_hash);

INSERT INTO user_profile (
  user_id,
  display_name,
  bio,
  avatar_url,
  timezone,
  study_goal_minutes_per_day,
  preferred_difficulty,
  current_streak,
  longest_streak,
  last_login_date,
  selected_background_id
)
VALUES (
  999,
  'Test User',
  'Fully unlocked test account',
  NULL,
  'Europe/London',
  30,
  'MODERATE',
  30,
  30,
  CURDATE(),
  NULL
)
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  bio = VALUES(bio),
  avatar_url = VALUES(avatar_url),
  timezone = VALUES(timezone),
  study_goal_minutes_per_day = VALUES(study_goal_minutes_per_day),
  preferred_difficulty = VALUES(preferred_difficulty),
  current_streak = VALUES(current_streak),
  longest_streak = VALUES(longest_streak),
  last_login_date = VALUES(last_login_date);

-- unlock every badge for the test user
INSERT INTO user_badges (user_id, badge_id, earned_at)
SELECT 999, b.badge_id, NOW()
FROM badges b
ON DUPLICATE KEY UPDATE
  earned_at = user_badges.earned_at;

-- unlock every background for the test user
INSERT INTO user_backgrounds (user_id, background_id, unlocked_at)
SELECT 999, bg.background_id, NOW()
FROM backgrounds bg
WHERE bg.is_active = 1
ON DUPLICATE KEY UPDATE
  unlocked_at = user_backgrounds.unlocked_at;

-- set selected background to the first active background
UPDATE user_profile
SET selected_background_id = (
  SELECT picked.background_id
  FROM (
    SELECT background_id
    FROM backgrounds
    WHERE is_active = 1
    ORDER BY background_id ASC
    LIMIT 1
  ) AS picked
)
WHERE user_id = 999;