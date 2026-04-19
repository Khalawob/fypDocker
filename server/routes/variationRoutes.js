// server/routes/variationRoutes.js
const express = require("express"); // Express framework for defining API routes
const axios = require("axios"); // Used to call the Python NLP microservice
const db = require("../db"); // Shared MySQL database connection
const { requireAuth } = require("../middleware/auth"); // Middleware that ensures the user is logged in

const router = express.Router(); // Router instance exported at the end of the file

/**
 * Promise wrapper for db.query (mysql/mysql2 callback style)
 */
// Converts callback-based db.query into a Promise so async/await can be used.
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

/**
 * POST /api/cards/:flashcardId/variations
 * Body: { variation_type, blank_ratio?, seed? }
 *
 * Generates a variation using Python NLP service and stores it in flashcard_variation table.
 */
// Generates a new answer variation for a flashcard, such as blanked text or clue-based text,
// by sending the flashcard answer to the NLP microservice.
// The generated variation is then saved into the flashcard_variation table.
router.post("/cards/:flashcardId/variations", requireAuth, async (req, res) => {
  const flashcardId = Number(req.params.flashcardId); // Parse flashcard ID from the URL
  const { variation_type, blank_ratio, seed } = req.body || {}; // Read variation settings from the request body

  // variation_type is required because the NLP service needs to know which type of variation to generate.
  if (!variation_type) {
    return res.status(400).json({
      message:
        "variation_type is required (e.g. ALL_BLANK_FIRST_LETTERS, RANDOM_BLANKS)",
    });
  }

  try {
    // Ensure the flashcard belongs to a set owned by this user & get the answer text
    // This query also loads the user's difficulty rating for the card if it exists.
    const rows = await query(
      `SELECT 
          f.flashcard_id, 
          f.answer,
          COALESCE(ufs.difficulty_rating, 0) AS user_difficulty_rating
      FROM flashcard f
      JOIN flashcard_set s ON s.set_id = f.set_id
      LEFT JOIN user_flashcard_stats ufs
        ON ufs.flashcard_id = f.flashcard_id AND ufs.user_id = ?
      WHERE f.flashcard_id = ? AND s.user_id = ?`,
      [req.user.userId, flashcardId, req.user.userId]
    );

    // If no matching flashcard is found, either it does not exist
    // or it does not belong to the logged-in user.
    if (rows.length === 0) {
      return res.status(404).json({ message: "Flashcard not found" });
    }

    const answerText = rows[0].answer; // The answer text is what the NLP service transforms

    // Convert the user's difficulty rating into a safe 0..100 number.
    const ratingRaw = rows[0].user_difficulty_rating;
    const rating = Math.max(0, Math.min(100, Number(ratingRaw ?? 0)));

    // Convert the rating into a 1..4 difficulty level
    // for the DIFFICULTY_LEVEL_BLANKS variation type.
    let difficulty_level = 1;
    if (rating > 75) difficulty_level = 4;
    else if (rating > 50) difficulty_level = 3;
    else if (rating > 25) difficulty_level = 2;

    // The NLP service cannot generate a variation if the flashcard answer is empty.
    if (!answerText || !String(answerText).trim()) {
      return res
        .status(400)
        .json({ message: "Flashcard answer is empty" });
    }

    // Call NLP microservice
    const nlpUrl = (process.env.NLP_URL || "http://127.0.0.1:6000").trim();

    // Helpful debug (leave in while developing; remove later)
    console.log("Using NLP_URL:", nlpUrl);

    let data;
    try {
      // Build the payload for the NLP service.
      const payload = {
        text: answerText,
        variation_type,
        blank_ratio,
        seed,
      };

      // Auto-add difficulty_level when using DIFFICULTY_LEVEL_BLANKS
      // This lets the NLP service decide how many words to blank.
      if (variation_type === "DIFFICULTY_LEVEL_BLANKS") {
        payload.difficulty_level = difficulty_level;
      }

      // Send the generation request to the Python NLP service.
      const axRes = await axios.post(`${nlpUrl}/generate`, payload, { timeout: 8000 });

      data = axRes.data;
    } catch (e) {
      // If the NLP call fails, return the most useful available error message.
      console.error("NLP call failed:", e.message);
      const status = e.response?.status || 500;
      const msg =
        e.response?.data?.error ||
        e.response?.data?.message ||
        e.message ||
        "NLP error";
      return res.status(status).json({ message: msg });
    }

    const { blanked_text, first_letter_clues } = data || {}; // Extract generated output from NLP response

    // blanked_text is required for the generated variation to be useful.
    if (!blanked_text) {
      return res.status(500).json({
        message: "NLP service returned no blanked_text",
      });
    }

    // Store in DB
    // Save the generated variation so it can be reused or viewed later.
    const insert = await query(
      `INSERT INTO flashcard_variation (flashcard_id, variation_type, blanked_text, first_letter_clues)
       VALUES (?, ?, ?, ?)`,
      [
        flashcardId,
        variation_type,
        blanked_text,
        first_letter_clues || null,
      ]
    );

    // Return the saved variation details to the frontend.
    res.status(201).json({
      variation_id: insert.insertId,
      flashcard_id: flashcardId,
      variation_type,
      blanked_text,
      first_letter_clues: first_letter_clues || null,
    });
  } catch (err) {
    console.error("Variation route error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/cards/:flashcardId/variations
 * Returns stored variations for a card (owned by user)
 */
// Returns all previously generated variations for a flashcard,
// but only if the flashcard belongs to the logged-in user.
router.get("/cards/:flashcardId/variations", requireAuth, async (req, res) => {
  const flashcardId = Number(req.params.flashcardId); // Parse flashcard ID from the URL

  try {
    // Ownership check
    // Ensure the flashcard belongs to a set owned by the logged-in user.
    const owned = await query(
      `SELECT f.flashcard_id
       FROM flashcard f
       JOIN flashcard_set s ON s.set_id = f.set_id
       WHERE f.flashcard_id = ? AND s.user_id = ?`,
      [flashcardId, req.user.userId]
    );

    if (owned.length === 0) {
      return res.status(404).json({ message: "Flashcard not found" });
    }

    // Load all stored variations for the flashcard, newest first.
    const variations = await query(
      `SELECT variation_id, flashcard_id, variation_type, blanked_text, first_letter_clues, generated_at
       FROM flashcard_variation
       WHERE flashcard_id = ?
       ORDER BY generated_at DESC`,
      [flashcardId]
    );

    res.json(variations);
  } catch (err) {
    console.error("Get variations error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Export the configured router so it can be mounted in app.js
module.exports = router;
