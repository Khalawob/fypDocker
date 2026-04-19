const express = require("express"); // Express framework for defining API routes
const db = require("../db"); // Shared MySQL database connection
const { requireAuth } = require("../middleware/auth"); // Middleware that ensures the user is logged in

const router = express.Router(); // Router instance exported at the end of the file

// Validates a colour value from the frontend.
// Only full 6-digit hex colours like #ffffff are accepted.
// If the value is missing or invalid, the fallback is used instead.
function safeColor(value, fallback) {
  if (!value) return fallback;
  const trimmed = String(value).trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : fallback;
}

// Validates the allowed border radius values for card styling.
// If the provided value is not one of the approved options,
// the default rounded value "12px" is used.
function safeRadius(value) {
  const allowed = ["0px", "12px", "24px"];
  return allowed.includes(value) ? value : "12px";
}

// Promise wrapper around db.query so async/await can be used
// instead of callback-based SQL handling.
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

/**
 * CREATE set
 * POST /api/sets
 * body: { title, description? }
 */
// Creates a new flashcard set for the logged-in user.
// It also stores the chosen card appearance settings and awards
// the FIRST_SET badge if that badge exists.
router.post("/", requireAuth, async (req, res) => {
  const {
    title,
    description,
    top_color,
    bottom_color,
    text_color,
    accent_color,
    border_radius,
  } = req.body;

  // Title is required to create a set.
  if (!title) return res.status(400).json({ message: "title is required" });

  // Sanitize all appearance-related fields before saving.
  const safeTopColor = safeColor(top_color, "#121a2a");
  const safeBottomColor = safeColor(bottom_color, "#0b1220");
  const safeTextColor = safeColor(text_color, "#ffffff");
  const safeAccentColor = safeColor(accent_color, "#3b82f6");
  const safeBorderRadius = safeRadius(border_radius);

  try {
    // Insert the new set into the database.
    const result = await query(
      `INSERT INTO flashcard_set
      (user_id, title, description, top_color, bottom_color, text_color, accent_color, border_radius)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.userId,
        title,
        description || null,
        safeTopColor,
        safeBottomColor,
        safeTextColor,
        safeAccentColor,
        safeBorderRadius,
      ]
    );

    // Try to award the FIRST_SET badge after the user's first set creation.
    const badgeRows = await query(
      "SELECT badge_id FROM badges WHERE code = ?",
      ["FIRST_SET"]
    );

    if (badgeRows.length > 0) {
      await query(
        "INSERT IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)",
        [req.user.userId, badgeRows[0].badge_id]
      );
    }

    // Return the newly created set details to the frontend.
    res.status(201).json({
      set_id: result.insertId,
      title,
      description: description || null,
      top_color: safeTopColor,
      bottom_color: safeBottomColor,
      text_color: safeTextColor,
      accent_color: safeAccentColor,
      border_radius: safeBorderRadius,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/**
 * GET all my sets
 * GET /api/sets
 */
// Returns every flashcard set that belongs to the logged-in user.
// Sets are ordered by most recently modified first.
router.get("/", requireAuth, (req, res) => {
  db.query(
    `SELECT
      set_id,
      title,
      description,
      top_color,
      bottom_color,
      text_color,
      accent_color,
      border_radius,
      created_at,
      last_modified
    FROM flashcard_set
    WHERE user_id = ?
    ORDER BY last_modified DESC`,
    [req.user.userId],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(results);
    }
  );
});

/**
 * GET one set (must belong to user)
 * GET /api/sets/:setId
 */
// Returns a single flashcard set if it belongs to the logged-in user.
router.get("/:setId", requireAuth, (req, res) => {
  db.query(
    `SELECT
      set_id,
      title,
      description,
      top_color,
      bottom_color,
      text_color,
      accent_color,
      border_radius,
      created_at,
      last_modified
    FROM flashcard_set
    WHERE set_id = ? AND user_id = ?`,
    [req.params.setId, req.user.userId],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      if (results.length === 0) return res.status(404).json({ message: "Set not found" });
      res.json(results[0]);
    }
  );
});

/**
 * UPDATE set
 * PUT /api/sets/:setId
 * body: { title, description }
 */
// Updates an existing set belonging to the logged-in user.
// This includes both the set content fields and the visual appearance fields.
router.put("/:setId", requireAuth, (req, res) => {
  const {
    title,
    description,
    top_color,
    bottom_color,
    text_color,
    accent_color,
    border_radius,
  } = req.body;

  // Title is still required when updating a set.
  if (!title) return res.status(400).json({ message: "title is required" });

  // Sanitize all appearance-related fields before saving.
  const safeTopColor = safeColor(top_color, "#121a2a");
  const safeBottomColor = safeColor(bottom_color, "#0b1220");
  const safeTextColor = safeColor(text_color, "#ffffff");
  const safeAccentColor = safeColor(accent_color, "#3b82f6");
  const safeBorderRadius = safeRadius(border_radius);

  db.query(
    `UPDATE flashcard_set
    SET title = ?, description = ?, top_color = ?, bottom_color = ?, text_color = ?, accent_color = ?, border_radius = ?
    WHERE set_id = ? AND user_id = ?`,
    [
      title,
      description || null,
      safeTopColor,
      safeBottomColor,
      safeTextColor,
      safeAccentColor,
      safeBorderRadius,
      req.params.setId,
      req.user.userId,
    ],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Set not found" });
      res.json({ message: "Set updated" });
    }
  );
});

/**
 * DELETE set (cascades to flashcards etc.)
 * DELETE /api/sets/:setId
 */
// Deletes a set belonging to the logged-in user.
// The comment notes that related records such as flashcards are expected
// to cascade automatically through database relationships.
router.delete("/:setId", requireAuth, (req, res) => {
  db.query(
    "DELETE FROM flashcard_set WHERE set_id = ? AND user_id = ?",
    [req.params.setId, req.user.userId],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Set not found" });
      res.json({ message: "Set deleted" });
    }
  );
});

// Export the configured router so it can be mounted in app.js
module.exports = router;
