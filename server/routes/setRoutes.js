const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * CREATE set
 * POST /api/sets
 * body: { title, description? }
 */
router.post("/", requireAuth, (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ message: "title is required" });

  db.query(
    "INSERT INTO flashcard_set (user_id, title, description) VALUES (?, ?, ?)",
    [req.user.userId, title, description || null],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      res.status(201).json({ set_id: result.insertId, title, description: description || null });
    }
  );
});

/**
 * GET all my sets
 * GET /api/sets
 */
router.get("/", requireAuth, (req, res) => {
  db.query(
    "SELECT set_id, title, description, created_at, last_modified FROM flashcard_set WHERE user_id = ? ORDER BY last_modified DESC",
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
    "SELECT set_id, title, description, created_at, last_modified FROM flashcard_set WHERE set_id = ? AND user_id = ?",
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
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ message: "title is required" });

  db.query(
    "UPDATE flashcard_set SET title = ?, description = ? WHERE set_id = ? AND user_id = ?",
    [title, description || null, req.params.setId, req.user.userId],
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
