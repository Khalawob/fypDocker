const express = require("express"); // Import Express
const db = require("../db"); // Import MySQL connection
const { requireAuth } = require("../middleware/auth"); // Import JWT auth middleware

const router = express.Router(); // Create Express router

// Promise wrapper for MySQL queries (so we can use async/await)
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err); // Reject promise on SQL error
      resolve(results); // Resolve promise with results
    });
  });
}

// Clamp helper to keep values in a safe range
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n)); // Clamp number
}

// Count words in a sentence (simple split)
function countWords(text) {
  const s = String(text || "").trim(); // Ensure string and trim whitespace
  if (!s) return 0; // If empty, return 0
  return s.split(/\s+/).filter(Boolean).length; // Split on spaces and count tokens
}

// Hard-coded calibration prompts (For TESTING) Need Ideas on how to personalize this
const CALIBRATION_PROMPTS = [
  { id: 1, text: "The mitochondria produces energy for the cell." }, // Biology example
  { id: 2, text: "HTTP is the protocol used for communication on the web." }, // CS example
  { id: 3, text: "A stack follows last in, first out ordering." }, // Data structures
  { id: 4, text: "A database index can improve query performance." }, // Databases
  { id: 5, text: "Encryption protects data by converting it into ciphertext." }, // Security
  { id: 6, text: "A function takes input and returns an output." }, // Programming
  { id: 7, text: "Operating systems manage hardware resources for applications." }, // OS
  { id: 8, text: "Machine learning models learn patterns from data." }, // AI
];

// GET /api/calibration/prompts
// Returns a list of prompts the frontend can show for calibration timing
router.get("/calibration/prompts", requireAuth, async (req, res) => {
  try {
    // Add word_count for each prompt (useful for frontend total_words)
    const prompts = CALIBRATION_PROMPTS.map((p) => ({
      ...p, // Keep id and text
      word_count: countWords(p.text), // Add word count
    }));

    res.json({ prompts }); // Return prompts
  } catch (err) {
    console.error("Calibration prompts error:", err); // Log error
    res.status(500).json({ message: "Server error" }); // Generic 500
  }
});

// POST /api/calibration/submit
// Body: { total_words, total_seconds }
// Computes words_per_second and stores it for the user
router.post("/calibration/submit", requireAuth, async (req, res) => {
  try {
    const { total_words, total_seconds } = req.body || {}; // Read request body

    const words = Number(total_words); // Convert to number
    const seconds = Number(total_seconds); // Convert to number

    if (!Number.isFinite(words) || words <= 0) {
      return res.status(400).json({ message: "total_words must be a positive number" }); // Validate words
    }

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return res.status(400).json({ message: "total_seconds must be a positive number" }); // Validate seconds
    }

    // Calculate raw words per second
    const rawWps = words / seconds; // WPS = words / seconds

    // Clamp reading speed to a sensible range to avoid nonsense values
    // Typical range: ~1.0 to 6.0 words/sec (60 to 360 WPM)
    const wordsPerSecond = clamp(rawWps, 1.0, 6.0); // Clamp WPS

    // Upsert into user_calibration (insert or update)
    await query(
      `INSERT INTO user_calibration (user_id, words_per_second, calibrated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         words_per_second = VALUES(words_per_second),
         calibrated_at = NOW()`,
      [req.user.userId, wordsPerSecond] // Params
    );

    res.json({
      message: "Calibration saved", // Success message
      user_id: req.user.userId, // Return user id
      words_per_second: Number(wordsPerSecond.toFixed(2)), // Return WPS rounded
      words_per_minute: Math.round(wordsPerSecond * 60), // Return WPM for user-friendly display
    });
  } catch (err) {
    console.error("Calibration submit error:", err); // Log error
    res.status(500).json({ message: "Server error" }); // Generic 500
  }
});

// GET /api/calibration/me
// Returns the current user's calibration (useful for testing/debugging)
router.get("/calibration/me", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT user_id, words_per_second, calibrated_at FROM user_calibration WHERE user_id = ?",
      [req.user.userId] // Param
    );

    // If not calibrated yet, return defaults
    if (rows.length === 0) {
      return res.json({
        user_id: req.user.userId, // Return user id
        words_per_second: 2.5, // Default WPS
        words_per_minute: 150, // Default WPM
        calibrated_at: null, // No calibration time
        is_default: true, // Mark as default
      });
    }

    const row = rows[0]; // First row

    res.json({
      user_id: row.user_id, // User id
      words_per_second: Number(Number(row.words_per_second).toFixed(2)), // WPS
      words_per_minute: Math.round(Number(row.words_per_second) * 60), // WPM
      calibrated_at: row.calibrated_at, // Time calibrated
      is_default: false, // Not default
    });
  } catch (err) {
    console.error("Calibration me error:", err); // Log error
    res.status(500).json({ message: "Server error" }); // Generic 500
  }
});

module.exports = router; // Export router
