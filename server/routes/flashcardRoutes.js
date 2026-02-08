const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * Helper: verify set belongs to user
 */
function ensureSetOwnership(setId, userId, cb) {
  db.query(
    "SELECT set_id FROM flashcard_set WHERE set_id = ? AND user_id = ?",
    [setId, userId],
    (err, results) => {
      if (err) return cb(err);
      if (results.length === 0) return cb(null, false);
      cb(null, true);
    }
  );
}

/**
 * CREATE flashcard in a set
 * POST /api/sets/:setId/cards
 * body: { question, answer }
 */
router.post("/sets/:setId/cards", requireAuth, (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return res
      .status(400)
      .json({ message: "question and answer are required" });
  }

  const setId = req.params.setId;

  ensureSetOwnership(setId, req.user.userId, (err, ok) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!ok) return res.status(404).json({ message: "Set not found" });

    db.query(
      "INSERT INTO flashcard (set_id, question, answer) VALUES (?, ?, ?)",
      [setId, question, answer],
      (err2, result) => {
        if (err2) return res.status(500).json({ message: err2.message });

        res.status(201).json({
          flashcard_id: result.insertId,
          set_id: Number(setId),
          question,
          answer,
        });
      }
    );
  });
});

/**
 * GET flashcards in a set
 * GET /api/sets/:setId/cards
 */
router.get("/sets/:setId/cards", requireAuth, (req, res) => {
  const setId = req.params.setId;

  ensureSetOwnership(setId, req.user.userId, (err, ok) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!ok) return res.status(404).json({ message: "Set not found" });

    db.query(
      "SELECT flashcard_id, set_id, question, answer, difficulty_rating, times_seen, created_at FROM flashcard WHERE set_id = ? ORDER BY flashcard_id DESC",
      [setId],
      (err2, results) => {
        if (err2) return res.status(500).json({ message: err2.message });
        res.json(results);
      }
    );
  });
});

/**
 * UPDATE flashcard
 * PUT /api/cards/:flashcardId
 * body: { question, answer }
 */
router.put("/cards/:flashcardId", requireAuth, (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return res
      .status(400)
      .json({ message: "question and answer are required" });
  }

  const flashcardId = req.params.flashcardId;

  // Ensure the flashcard belongs to a set owned by this user
  db.query(
    `SELECT f.flashcard_id
     FROM flashcard f
     JOIN flashcard_set s ON s.set_id = f.set_id
     WHERE f.flashcard_id = ? AND s.user_id = ?`,
    [flashcardId, req.user.userId],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      if (results.length === 0)
        return res.status(404).json({ message: "Flashcard not found" });

      db.query(
        "UPDATE flashcard SET question = ?, answer = ? WHERE flashcard_id = ?",
        [question, answer, flashcardId],
        (err2) => {
          if (err2) return res.status(500).json({ message: err2.message });
          res.json({ message: "Flashcard updated" });
        }
      );
    }
  );
});

/**
 * DELETE flashcard
 * DELETE /api/cards/:flashcardId
 */
router.delete("/cards/:flashcardId", requireAuth, (req, res) => {
  const flashcardId = req.params.flashcardId;

  db.query(
    `DELETE f
     FROM flashcard f
     JOIN flashcard_set s ON s.set_id = f.set_id
     WHERE f.flashcard_id = ? AND s.user_id = ?`,
    [flashcardId, req.user.userId],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Flashcard not found" });
      res.json({ message: "Flashcard deleted" });
    }
  );
});

module.exports = router;
