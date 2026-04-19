const express = require("express"); // Express framework for defining API routes
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

// GET /api/backgrounds
// Returns all active backgrounds
// This route returns every background in the system that is currently marked active.
// It does not personalise the result for the current user.
router.get("/", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT
         background_id,
         code,
         name,
         image_url,
         unlock_badge_code,
         is_active,
         created_at
       FROM backgrounds
       WHERE is_active = 1
       ORDER BY background_id ASC`
    );

    return res.json({ backgrounds: rows });
  } catch (err) {
    console.error("Get backgrounds error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/backgrounds/me
// Returns all active backgrounds with unlocked/selected flags for current user
// This route returns the list of active backgrounds, but enriched with
// user-specific information showing:
// - whether the current user has unlocked each background
// - which background is currently selected
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId; // Read logged-in user ID from the auth middleware

    // Ensure a user_profile row exists before checking the selected background.
    await query(
      "INSERT INTO user_profile (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id",
      [userId]
    );

    // Load all active backgrounds and join them with:
    // - user_backgrounds to determine whether each one is unlocked
    // - user_profile to determine which one is currently selected
    const rows = await query(
      `SELECT
         b.background_id,
         b.code,
         b.name,
         b.image_url,
         b.unlock_badge_code,
         CASE WHEN ub.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_unlocked,
         CASE WHEN up.selected_background_id = b.background_id THEN 1 ELSE 0 END AS is_selected
       FROM backgrounds b
       LEFT JOIN user_backgrounds ub
         ON ub.background_id = b.background_id
        AND ub.user_id = ?
       LEFT JOIN user_profile up
         ON up.user_id = ?
       WHERE b.is_active = 1
       ORDER BY b.background_id ASC`,
      [userId, userId]
    );

    // Find the currently selected background, if one exists.
    const selected = rows.find((r) => Number(r.is_selected) === 1) || null;

    return res.json({
      backgrounds: rows,
      selected_background_id: selected ? selected.background_id : null,
    });
  } catch (err) {
    console.error("Get my backgrounds error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/backgrounds/me/select
// Body: { background_id } or { background_id: null } for default
// This route lets the user choose which unlocked background should be active
// on their profile and pages.
router.put("/me/select", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId; // Read logged-in user ID from the auth middleware
    const rawBackgroundId = req.body?.background_id; // Read the requested background ID from the request body

    // Ensure a user_profile row exists before updating the selected background.
    await query(
      "INSERT INTO user_profile (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id",
      [userId]
    );

    // Default background selected
    // If background_id is null or missing, reset selection back to the default background.
    if (rawBackgroundId === null || rawBackgroundId === undefined) {
      await query(
        `UPDATE user_profile
         SET selected_background_id = NULL
         WHERE user_id = ?`,
        [userId]
      );

      return res.json({
        message: "Default background selected",
        selected_background_id: null,
      });
    }

    const backgroundId = Number(rawBackgroundId); // Convert the submitted value to a number

    // Validate the background ID before querying the database.
    if (!Number.isInteger(backgroundId) || backgroundId <= 0) {
      return res.status(400).json({ message: "Valid background_id is required" });
    }

    // Check that the background exists and load its active status.
    const backgroundRows = await query(
      `SELECT background_id, is_active
       FROM backgrounds
       WHERE background_id = ?`,
      [backgroundId]
    );

    if (backgroundRows.length === 0) {
      return res.status(404).json({ message: "Background not found" });
    }

    // Prevent selection of backgrounds that exist but are not currently active.
    if (!backgroundRows[0].is_active) {
      return res.status(400).json({ message: "Background is not active" });
    }

    // Check whether the user has actually unlocked this background.
    const unlockedRows = await query(
      `SELECT user_background_id
       FROM user_backgrounds
       WHERE user_id = ? AND background_id = ?`,
      [userId, backgroundId]
    );

    if (unlockedRows.length === 0) {
      return res.status(403).json({ message: "Background not unlocked" });
    }

    // Save the chosen background as the user's selected background.
    await query(
      `UPDATE user_profile
       SET selected_background_id = ?
       WHERE user_id = ?`,
      [backgroundId, userId]
    );

    return res.json({
      message: "Background selected successfully",
      selected_background_id: backgroundId,
    });
  } catch (err) {
    console.error("Select background error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Export the configured router so it can be mounted in app.js
module.exports = router;