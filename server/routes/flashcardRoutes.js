const express = require("express"); // Express framework for defining API routes
const db = require("../db"); // Shared MySQL database connection
const { requireAuth } = require("../middleware/auth"); // Middleware that ensures the user is logged in

const router = express.Router(); // Router instance exported at the end of the file

/**
 * Helper: verify set belongs to user
 */
// Callback-based helper function that checks whether a flashcard set belongs
// to the logged-in user. This is used before allowing access to cards inside a set.
function ensureSetOwnership(setId, userId, cb) {
  db.query(
    "SELECT set_id FROM flashcard_set WHERE set_id = ? AND user_id = ?",
    [setId, userId],
    (err, results) => {
      if (err) return cb(err); // Pass database errors back to the caller
      if (results.length === 0) return cb(null, false); // Set was not found or does not belong to the user
      cb(null, true); // Ownership confirmed
    }
  );
}

/**
 * CREATE flashcard in a set
 * POST /api/sets/:setId/cards
 * body: { question, answer }
 */
// Creates a new flashcard inside one of the user's sets.
router.post("/sets/:setId/cards", requireAuth, (req, res) => {
  const { question, answer } = req.body; // Read question and answer from the request body

  // Both question and answer are required to create a flashcard.
  if (!question || !answer) {
    return res
      .status(400)
      .json({ message: "question and answer are required" });
  }

  const setId = req.params.setId; // Get the target set ID from the URL

  // First check that the set belongs to the logged-in user.
  ensureSetOwnership(setId, req.user.userId, (err, ok) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!ok) return res.status(404).json({ message: "Set not found" });

    // Insert the new flashcard into the database.
    db.query(
      "INSERT INTO flashcard (set_id, question, answer) VALUES (?, ?, ?)",
      [setId, question, answer],
      (err2, result) => {
        if (err2) return res.status(500).json({ message: err2.message });

        // Return the newly created flashcard information to the frontend.
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
// Returns all flashcards that belong to one of the user's sets.
router.get("/sets/:setId/cards", requireAuth, (req, res) => {
  const setId = req.params.setId; // Get the set ID from the URL

  // First check that the set belongs to the logged-in user.
  ensureSetOwnership(setId, req.user.userId, (err, ok) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!ok) return res.status(404).json({ message: "Set not found" });

    // Load all flashcards for that set.
    // Cards are returned newest first because of ORDER BY flashcard_id DESC.
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
// Updates the question and answer of an existing flashcard.
router.put("/cards/:flashcardId", requireAuth, (req, res) => {
  const { question, answer } = req.body; // Read updated question and answer from request body

  // Both fields are required for an update.
  if (!question || !answer) {
    return res
      .status(400)
      .json({ message: "question and answer are required" });
  }

  const flashcardId = req.params.flashcardId; // Get flashcard ID from URL

  // Ensure the flashcard belongs to a set owned by this user.
  // This prevents users from editing flashcards in other users' sets.
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

      // If ownership is confirmed, update the flashcard text.
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
// Deletes a flashcard if it belongs to one of the logged-in user's sets.
router.delete("/cards/:flashcardId", requireAuth, (req, res) => {
  const flashcardId = req.params.flashcardId; // Get flashcard ID from URL

  // Delete the flashcard only if it belongs to a set owned by the user.
  // The JOIN ensures ownership is checked inside the delete query itself.
  db.query(
    `DELETE f
     FROM flashcard f
     JOIN flashcard_set s ON s.set_id = f.set_id
     WHERE f.flashcard_id = ? AND s.user_id = ?`,
    [flashcardId, req.user.userId],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });

      // If no row was deleted, the flashcard either did not exist
      // or did not belong to this user.
      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Flashcard not found" });

      res.json({ message: "Flashcard deleted" });
    }
  );
});

// Export the configured router so it can be mounted in app.js
module.exports = router;
