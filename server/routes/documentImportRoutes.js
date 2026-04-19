const express = require("express"); // Express framework for defining API routes
const axios = require("axios"); // Used to call the Flask NLP microservice
const db = require("../db"); // Shared MySQL database connection
const { requireAuth } = require("../middleware/auth"); // Middleware that ensures the user is logged in

const router = express.Router(); // Router instance exported at the end of the file

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

// Checks that the requested flashcard set belongs to the logged-in user.
// This stops users from importing or saving cards into sets they do not own.
async function ensureSetOwnership(setId, userId) {
  const rows = await query(
    `SELECT set_id
     FROM flashcard_set
     WHERE set_id = ? AND user_id = ?`,
    [setId, userId]
  );
  return rows.length > 0;
}

// Cleans a generated or submitted card object into a consistent format.
// It trims question/answer text and safely converts score to a number if present.
function cleanCard(card) {
  return {
    question: String(card?.question || "").trim(),
    answer: String(card?.answer || "").trim(),
    score:
      card?.score !== undefined && card?.score !== null
        ? Number(card.score)
        : null,
  };
}

// Validates that a card is usable before it is returned or saved.
// Rules:
// - question must exist
// - answer must exist
// - question must be 255 characters or less
// - answer must be 1000 characters or less
function isValidCard(card) {
  if (!card.question || !card.answer) return false;
  if (card.question.length > 255) return false;
  if (card.answer.length > 1000) return false;
  return true;
}

/**
 * POST /api/sets/:setId/import-document
 * Body: { text, max_cards? }
 *
 * Calls Flask NLP service to generate draft flashcards.
 * Does NOT save them yet.
 */
// This route takes document text, sends it to the Flask NLP service,
// and returns generated flashcard drafts for the frontend to review.
// The drafts are not inserted into the database at this stage.
router.post("/sets/:setId/import-document", requireAuth, async (req, res) => {
  const setId = Number(req.params.setId); // Parse set ID from the URL
  const { text, max_cards = 10 } = req.body || {}; // Read submitted text and optional max_cards value

  // The NLP service needs actual document text to generate cards from.
  if (!text || !String(text).trim()) {
    return res.status(400).json({ message: "text is required" });
  }

  try {
    // Ensure the target set belongs to the logged-in user before doing any work.
    const ok = await ensureSetOwnership(setId, req.user.userId);
    if (!ok) {
      return res.status(404).json({ message: "Set not found" });
    }

    // Use the configured NLP service URL, or fall back to the local Flask service.
    const nlpUrl = (process.env.NLP_URL || "http://127.0.0.1:6000").trim();

    let data;
    try {
      // Send the cleaned document text to the NLP microservice.
      // max_cards is clamped between 1 and 30 to avoid invalid or excessive requests.
      const axRes = await axios.post(
        `${nlpUrl}/generate-flashcards`,
        {
          text: String(text).trim(),
          max_cards: Math.max(1, Math.min(30, Number(max_cards) || 10)),
        },
        { timeout: 12000 } // Timeout so the request does not hang forever
      );
      data = axRes.data;
    } catch (e) {
      // If the NLP service fails, return the most useful available error message.
      console.error("Flashcard generation failed:", e.message);
      const status = e.response?.status || 500;
      const msg =
        e.response?.data?.error ||
        e.response?.data?.message ||
        e.message ||
        "NLP generation error";
      return res.status(status).json({ message: msg });
    }

    // Clean and validate the generated cards before returning them to the frontend.
    // Invalid cards are filtered out.
    const cards = Array.isArray(data?.cards)
      ? data.cards.map(cleanCard).filter(isValidCard)
      : [];

    // Return draft cards and a count so the frontend can preview them.
    return res.json({
      drafts: cards,
      count: cards.length,
    });
  } catch (err) {
    console.error("Import document route error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/sets/:setId/cards/bulk
 * Body: { cards: [{ question, answer }] }
 *
 * Saves approved flashcards into DB.
 */
// This route takes an array of reviewed/approved cards from the frontend
// and inserts them into the flashcard table in one bulk SQL query.
router.post("/sets/:setId/cards/bulk", requireAuth, async (req, res) => {
  const setId = Number(req.params.setId); // Parse set ID from the URL
  const rawCards = Array.isArray(req.body?.cards) ? req.body.cards : []; // Read submitted cards safely

  // At least one card must be provided.
  if (rawCards.length === 0) {
    return res.status(400).json({ message: "cards array is required" });
  }

  try {
    // Ensure the target set belongs to the logged-in user.
    const ok = await ensureSetOwnership(setId, req.user.userId);
    if (!ok) {
      return res.status(404).json({ message: "Set not found" });
    }

    // Clean all submitted cards and remove any invalid ones before saving.
    const cards = rawCards.map(cleanCard).filter(isValidCard);

    // If nothing valid remains after cleaning/filtering, stop here.
    if (cards.length === 0) {
      return res.status(400).json({ message: "No valid cards to save" });
    }

    // Build a bulk INSERT statement dynamically.
    // Example result:
    // INSERT INTO flashcard (set_id, question, answer) VALUES (?, ?, ?), (?, ?, ?), ...
    const values = [];
    const placeholders = [];

    for (const card of cards) {
      placeholders.push("(?, ?, ?)");
      values.push(setId, card.question, card.answer);
    }

    // Insert all valid cards in one query for efficiency.
    const result = await query(
      `INSERT INTO flashcard (set_id, question, answer)
       VALUES ${placeholders.join(", ")}`,
      values
    );

    // Return success message and how many cards were inserted.
    return res.status(201).json({
      message: "Flashcards saved successfully",
      inserted_count: result.affectedRows || cards.length,
    });
  } catch (err) {
    console.error("Bulk save cards route error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Export the configured router so it can be mounted in app.js
module.exports = router;