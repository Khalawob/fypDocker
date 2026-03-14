const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * GET reminder for one set
 * GET /api/sets/:setId/reminder
 */
router.get("/:setId/reminder", requireAuth, (req, res) => {
  db.query(
    `SELECT reminder_id, reminder_enabled, interval_hours, next_review_at, last_sent_at, adaptive_enabled, last_accuracy, last_interval_hours
     FROM set_review_reminder
     WHERE user_id = ? AND set_id = ?`,
    [req.user.userId, req.params.setId],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });

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

      res.json(results[0]);
    }
  );
});

/**
 * CREATE or UPDATE reminder for one set
 * POST /api/sets/:setId/reminder
 * body: { reminder_enabled, interval_hours, adaptive_enabled }
 */
router.post("/:setId/reminder", requireAuth, (req, res) => {
  const { reminder_enabled, interval_hours, adaptive_enabled } = req.body;
  const setId = Number(req.params.setId);

  if (!setId) {
    return res.status(400).json({ message: "Valid setId is required" });
  }

  if (typeof reminder_enabled !== "boolean") {
    return res.status(400).json({ message: "reminder_enabled must be true or false" });
  }

  if (typeof adaptive_enabled !== "boolean") {
    return res.status(400).json({ message: "adaptive_enabled must be true or false" });
  }

  const hours = Number(interval_hours || 24);

  if (reminder_enabled && !adaptive_enabled && (!hours || hours < 1)) {
    return res.status(400).json({ message: "interval_hours must be at least 1" });
  }

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

module.exports = router;
