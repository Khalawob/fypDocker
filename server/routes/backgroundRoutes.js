const express = require("express");
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

// GET /api/backgrounds
// Returns all active backgrounds
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
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    await query(
      "INSERT INTO user_profile (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id",
      [userId]
    );

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
router.put("/me/select", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const rawBackgroundId = req.body?.background_id;

    await query(
      "INSERT INTO user_profile (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id",
      [userId]
    );

    // Default background selected
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

    const backgroundId = Number(rawBackgroundId);

    if (!Number.isInteger(backgroundId) || backgroundId <= 0) {
      return res.status(400).json({ message: "Valid background_id is required" });
    }

    const backgroundRows = await query(
      `SELECT background_id, is_active
       FROM backgrounds
       WHERE background_id = ?`,
      [backgroundId]
    );

    if (backgroundRows.length === 0) {
      return res.status(404).json({ message: "Background not found" });
    }

    if (!backgroundRows[0].is_active) {
      return res.status(400).json({ message: "Background is not active" });
    }

    const unlockedRows = await query(
      `SELECT user_background_id
       FROM user_backgrounds
       WHERE user_id = ? AND background_id = ?`,
      [userId, backgroundId]
    );

    if (unlockedRows.length === 0) {
      return res.status(403).json({ message: "Background not unlocked" });
    }

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

module.exports = router;