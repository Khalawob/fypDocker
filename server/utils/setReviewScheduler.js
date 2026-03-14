const db = require("../db");

function calculateSetReviewIntervalHours({ accuracy, difficultyMode }) {
  let intervalHours = 24;

  if (accuracy < 0.5) {
    intervalHours = 12;
  } else if (accuracy < 0.75) {
    intervalHours = 24;
  } else if (accuracy < 0.9) {
    intervalHours = 72;
  } else {
    intervalHours = 120;
  }

  if (difficultyMode === "HARD" && accuracy >= 0.9) {
    intervalHours += 24;
  }

  return intervalHours;
}

function updateAdaptiveSetReminder({ userId, setId, accuracy, difficultyMode }) {
  return new Promise((resolve, reject) => {
    const intervalHours = calculateSetReviewIntervalHours({
      accuracy,
      difficultyMode,
    });

    db.query(
      `INSERT INTO set_review_reminder
        (user_id, set_id, reminder_enabled, interval_hours, next_review_at, adaptive_enabled, last_accuracy, last_interval_hours)
       VALUES (?, ?, 1, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), 1, ?, ?)
       ON DUPLICATE KEY UPDATE
        reminder_enabled = 1,
        interval_hours = VALUES(interval_hours),
        next_review_at = DATE_ADD(NOW(), INTERVAL VALUES(interval_hours) HOUR),
        adaptive_enabled = 1,
        last_accuracy = VALUES(last_accuracy),
        last_interval_hours = VALUES(last_interval_hours)`,
      [userId, setId, intervalHours, intervalHours, accuracy, intervalHours],
      (err) => {
        if (err) return reject(err);
        resolve(intervalHours);
      }
    );
  });
}

module.exports = {
  calculateSetReviewIntervalHours,
  updateAdaptiveSetReminder,
}