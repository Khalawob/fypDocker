const express = require("express"); // Express framework for defining API routes
const db = require("../db"); // Shared MySQL database connection
const { requireAuth } = require("../middleware/auth"); // Middleware that ensures the user is logged in

const router = express.Router(); // Router instance exported at the end of the file

/**
 * GET reminder for one set
 * GET /api/sets/:setId/reminder
 */
// Returns the reminder settings for one specific flashcard set
// belonging to the logged-in user.
router.get("/:setId/reminder", requireAuth, (req, res) => {
  db.query(
    `SELECT reminder_id, reminder_enabled, interval_hours, next_review_at, last_sent_at, adaptive_enabled, last_accuracy, last_interval_hours
     FROM set_review_reminder
     WHERE user_id = ? AND set_id = ?`,
    [req.user.userId, req.params.setId],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });

      // If no reminder row exists yet, return a default "not enabled" reminder object
      // so the frontend always receives a consistent response shape.
      if (results.length === 0) {
        return res.json({
          reminder_enabled: false,
          interval_hours: 24,
          next_review_at: null,
          last_sent_at: null,
          adaptive_enabled: false,
          last_accuracy: null,
          last_interval_hours: null,
        });
      }

      // If a reminder exists, return the stored reminder record.
      res.json(results[0]);
    }
  );
});

/**
 * CREATE or UPDATE reminder for one set
 * POST /api/sets/:setId/reminder
 * body: { reminder_enabled, interval_hours, adaptive_enabled }
 */
// Creates a new reminder row for the set or updates the existing one.
// Supports both:
// - manual reminders using a fixed interval
// - adaptive reminders whose schedule is updated elsewhere based on performance
router.post("/:setId/reminder", requireAuth, (req, res) => {
  const { reminder_enabled, interval_hours, adaptive_enabled } = req.body; // Read submitted reminder settings
  const setId = Number(req.params.setId); // Parse set ID from the URL

  // Validate setId before continuing.
  if (!setId) {
    return res.status(400).json({ message: "Valid setId is required" });
  }

  // reminder_enabled must be explicitly true or false.
  if (typeof reminder_enabled !== "boolean") {
    return res.status(400).json({ message: "reminder_enabled must be true or false" });
  }

  // adaptive_enabled must also be explicitly true or false.
  if (typeof adaptive_enabled !== "boolean") {
    return res.status(400).json({ message: "adaptive_enabled must be true or false" });
  }

  const hours = Number(interval_hours || 24); // Default manual interval is 24 hours

  // Manual reminders require at least 1 hour.
  // Adaptive reminders do not need this because their timing is recalculated elsewhere.
  if (reminder_enabled && !adaptive_enabled && (!hours || hours < 1)) {
    return res.status(400).json({ message: "interval_hours must be at least 1" });
  }

  // First ensure the set belongs to the logged-in user.
  db.query(
    `SELECT set_id
     FROM flashcard_set
     WHERE set_id = ? AND user_id = ?`,
    [setId, req.user.userId],
    (setErr, setResults) => {
      if (setErr) return res.status(500).json({ message: setErr.message });

      if (setResults.length === 0) {
        return res.status(404).json({ message: "Set not found" });
      }

      // Insert a new reminder row if one does not exist,
      // or update the existing row if it already exists.
      db.query(
        `INSERT INTO set_review_reminder
          (user_id, set_id, reminder_enabled, interval_hours, next_review_at, adaptive_enabled)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), ?)
         ON DUPLICATE KEY UPDATE
          reminder_enabled = VALUES(reminder_enabled),
          interval_hours = VALUES(interval_hours),
          adaptive_enabled = VALUES(adaptive_enabled),
          next_review_at = CASE
            WHEN VALUES(reminder_enabled) = 1 AND VALUES(adaptive_enabled) = 0
              THEN DATE_ADD(NOW(), INTERVAL VALUES(interval_hours) HOUR)
            WHEN VALUES(reminder_enabled) = 1 AND VALUES(adaptive_enabled) = 1
              THEN next_review_at
            ELSE next_review_at
          END`,
        [req.user.userId, setId, reminder_enabled, hours, hours, adaptive_enabled],
        (err) => {
          if (err) return res.status(500).json({ message: err.message });

          // Return a frontend-friendly success message based on the reminder mode.
          res.json({
            message: reminder_enabled
              ? adaptive_enabled
                ? "Adaptive reminder saved successfully"
                : "Manual reminder saved successfully"
              : "Reminder disabled successfully",
          });
        }
      );
    }
  );
});

// Export the configured router so it can be mounted in app.js
module.exports = router;
