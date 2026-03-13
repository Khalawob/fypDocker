const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function safeColor(value, fallback) {
  if (!value) return fallback;
  const trimmed = String(value).trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : fallback;
}

function safeRadius(value) {
  const allowed = ["0px", "12px", "24px"];
  return allowed.includes(value) ? value : "12px";
}

/**
 * CREATE set
 * POST /api/sets
 * body: { title, description? }
 */
router.post("/", requireAuth, (req, res) => {
  const {
    title,
    description,
    top_color,
    bottom_color,
    text_color,
    accent_color,
    border_radius,
  } = req.body;

  if (!title) return res.status(400).json({ message: "title is required" });

  const safeTopColor = safeColor(top_color, "#121a2a");
  const safeBottomColor = safeColor(bottom_color, "#0b1220");
  const safeTextColor = safeColor(text_color, "#ffffff");
  const safeAccentColor = safeColor(accent_color, "#3b82f6");
  const safeBorderRadius = safeRadius(border_radius);

  db.query(
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
    ],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
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
    }
  );
});

/**
 * GET all my sets
 * GET /api/sets
 */
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

  if (!title) return res.status(400).json({ message: "title is required" });

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

module.exports = router;
