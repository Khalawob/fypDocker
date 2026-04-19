const db = require("../db"); // Shared MySQL database connection

// Calculates the next review interval in hours for a set reminder
// based on the user's recent session accuracy and difficulty mode.
function calculateSetReviewIntervalHours({ accuracy, difficultyMode }) {
  let intervalHours = 24; // Default interval if no other rule changes it

  // Lower accuracy means the set should be reviewed sooner.
  if (accuracy < 0.5) {
    intervalHours = 12;
  } else if (accuracy < 0.75) {
    intervalHours = 24;
  } else if (accuracy < 0.9) {
    intervalHours = 72;
  } else {
    intervalHours = 120;
  }

  // If the session was HARD mode and the user performed very well,
  // extend the interval a bit more before the next reminder.
  if (difficultyMode === "HARD" && accuracy >= 0.9) {
    intervalHours += 24;
  }

  return intervalHours; // Return the calculated reminder interval
}

// Creates or updates an adaptive reminder for a flashcard set.
// The next review time is recalculated using the user's accuracy
// and the session difficulty mode.
function updateAdaptiveSetReminder({ userId, setId, accuracy, difficultyMode }) {
  return new Promise((resolve, reject) => {
    // First calculate how many hours until the next review reminder.
    const intervalHours = calculateSetReviewIntervalHours({
      accuracy,
      difficultyMode,
    });

    // Insert a new reminder row if one does not exist,
    // or update the existing row if it already exists.
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
        if (err) return reject(err); // Reject the Promise if the database update fails
        resolve(intervalHours); // Resolve with the new interval so callers can use it if needed
      }
    );
  });
}

// Export both helpers so other files, such as session completion logic,
// can calculate adaptive intervals and update reminders.
module.exports = {
  calculateSetReviewIntervalHours,
  updateAdaptiveSetReminder,
};