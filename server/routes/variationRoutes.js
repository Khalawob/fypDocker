// server/routes/variationRoutes.js
const express = require("express");
const axios = require("axios");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * Promise wrapper for db.query (mysql/mysql2 callback style)
 */
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
router.post("/cards/:flashcardId/variations", requireAuth, async (req, res) => {
  const flashcardId = Number(req.params.flashcardId);
  const { variation_type, blank_ratio, seed } = req.body || {};

  if (!variation_type) {
    return res.status(400).json({
      message:
        "variation_type is required (e.g. ALL_BLANK_FIRST_LETTERS, RANDOM_BLANKS)",
    });
  }

  try {
    // Ensure the flashcard belongs to a set owned by this user & get the answer text
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


    if (rows.length === 0) {
      return res.status(404).json({ message: "Flashcard not found" });
    }

    const answerText = rows[0].answer;

    const ratingRaw = rows[0].user_difficulty_rating;
    const rating = Math.max(0, Math.min(100, Number(ratingRaw ?? 0)));

    let difficulty_level = 1;
    if (rating > 75) difficulty_level = 4;
    else if (rating > 50) difficulty_level = 3;
    else if (rating > 25) difficulty_level = 2;

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
      const payload = {
        text: answerText,
        variation_type,
        blank_ratio,
        seed,
      };

      // Auto-add difficulty_level when using DIFFICULTY_LEVEL_BLANKS
      if (variation_type === "DIFFICULTY_LEVEL_BLANKS") {
        payload.difficulty_level = difficulty_level;
      }
      const axRes = await axios.post(`${nlpUrl}/generate`, payload, { timeout: 8000 });

      data = axRes.data;
    } catch (e) {
      console.error("NLP call failed:", e.message);
      const status = e.response?.status || 500;
      const msg =
        e.response?.data?.error ||
        e.response?.data?.message ||
        e.message ||
        "NLP error";
      return res.status(status).json({ message: msg });
    }

    const { blanked_text, first_letter_clues } = data || {};

    if (!blanked_text) {
      return res.status(500).json({
        message: "NLP service returned no blanked_text",
      });
    }

    // Store in DB
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
router.get("/cards/:flashcardId/variations", requireAuth, async (req, res) => {
  const flashcardId = Number(req.params.flashcardId);

  try {
    // Ownership check
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

module.exports = router;
