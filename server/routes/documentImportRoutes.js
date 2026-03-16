const express = require("express");
const axios = require("axios");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

async function ensureSetOwnership(setId, userId) {
  const rows = await query(
    `SELECT set_id
     FROM flashcard_set
     WHERE set_id = ? AND user_id = ?`,
    [setId, userId]
  );
  return rows.length > 0;
}

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
router.post("/sets/:setId/import-document", requireAuth, async (req, res) => {
  const setId = Number(req.params.setId);
  const { text, max_cards = 10 } = req.body || {};

  if (!text || !String(text).trim()) {
    return res.status(400).json({ message: "text is required" });
  }

  try {
    const ok = await ensureSetOwnership(setId, req.user.userId);
    if (!ok) {
      return res.status(404).json({ message: "Set not found" });
    }

    const nlpUrl = (process.env.NLP_URL || "http://127.0.0.1:6000").trim();

    let data;
    try {
      const axRes = await axios.post(
        `${nlpUrl}/generate-flashcards`,
        {
          text: String(text).trim(),
          max_cards: Math.max(1, Math.min(30, Number(max_cards) || 10)),
        },
        { timeout: 12000 }
      );
      data = axRes.data;
    } catch (e) {
      console.error("Flashcard generation failed:", e.message);
      const status = e.response?.status || 500;
      const msg =
        e.response?.data?.error ||
        e.response?.data?.message ||
        e.message ||
        "NLP generation error";
      return res.status(status).json({ message: msg });
    }

    const cards = Array.isArray(data?.cards)
      ? data.cards.map(cleanCard).filter(isValidCard)
      : [];

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
router.post("/sets/:setId/cards/bulk", requireAuth, async (req, res) => {
  const setId = Number(req.params.setId);
  const rawCards = Array.isArray(req.body?.cards) ? req.body.cards : [];

  if (rawCards.length === 0) {
    return res.status(400).json({ message: "cards array is required" });
  }

  try {
    const ok = await ensureSetOwnership(setId, req.user.userId);
    if (!ok) {
      return res.status(404).json({ message: "Set not found" });
    }

    const cards = rawCards.map(cleanCard).filter(isValidCard);

    if (cards.length === 0) {
      return res.status(400).json({ message: "No valid cards to save" });
    }

    const values = [];
    const placeholders = [];

    for (const card of cards) {
      placeholders.push("(?, ?, ?)");
      values.push(setId, card.question, card.answer);
    }

    const result = await query(
      `INSERT INTO flashcard (set_id, question, answer)
       VALUES ${placeholders.join(", ")}`,
      values
    );

    return res.status(201).json({
      message: "Flashcards saved successfully",
      inserted_count: result.affectedRows || cards.length,
    });
  } catch (err) {
    console.error("Bulk save cards route error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;