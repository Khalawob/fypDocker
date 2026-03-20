// server/routes/profileRoutes.js
const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Promise wrapper 
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// GET /api/profile/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Join with users so frontend can show username/email too
    let rows = await query(
      `SELECT 
         u.user_id,
         u.username,
         u.email,
         p.display_name,
         p.bio,
         p.avatar_url,
         p.timezone,
         p.study_goal_minutes_per_day,
         p.preferred_difficulty,
         p.current_streak,
         p.longest_streak,
         p.last_login_date,
         p.selected_background_id,
         p.created_at,
         p.updated_at
       FROM users u
       LEFT JOIN user_profile p ON p.user_id = u.user_id
       WHERE u.user_id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // If profile row doesn't exist for some reason, create it automatically
    if (
      rows[0].display_name === null &&
      rows[0].bio === null &&
      rows[0].avatar_url === null &&
      rows[0].timezone === null
    ) {
      await query(
        "INSERT INTO user_profile (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id",
        [userId]
      );

      rows = await query(
        `SELECT 
           u.user_id,
           u.username,
           u.email,
           p.display_name,
           p.bio,
           p.avatar_url,
           p.timezone,
           p.study_goal_minutes_per_day,
           p.preferred_difficulty,
           p.current_streak,
           p.longest_streak,
           p.last_login_date,
           p.selected_background_id,
           p.created_at,
           p.updated_at
         FROM users u
         LEFT JOIN user_profile p ON p.user_id = u.user_id
         WHERE u.user_id = ?`,
        [userId]
      );
    }

    const badgeRows = await query(
      `SELECT
         b.badge_id,
         b.code,
         b.name,
         b.description,
         b.icon,
         ub.earned_at
       FROM user_badges ub
       INNER JOIN badges b
         ON b.badge_id = ub.badge_id
       WHERE ub.user_id = ?
       ORDER BY ub.earned_at DESC, b.badge_id ASC`,
      [userId]
    );

    return res.json({
      ...rows[0],
      badges: badgeRows,
    });
  } catch (err) {
    console.error("Profile me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/profile/me
router.put("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      display_name,
      bio,
      avatar_url,
      timezone,
      study_goal_minutes_per_day,
      preferred_difficulty,
    } = req.body || {};

    // basic validation + safety clamps
    const safeDisplay =
      display_name !== undefined
        ? String(display_name).trim().slice(0, 80)
        : undefined;
    const safeBio =
      bio !== undefined ? String(bio).trim().slice(0, 255) : undefined;
    const safeAvatar =
      avatar_url !== undefined
        ? String(avatar_url).trim().slice(0, 255)
        : undefined;
    const safeTimezone =
      timezone !== undefined
        ? String(timezone).trim().slice(0, 64)
        : undefined;

    let safeGoal = study_goal_minutes_per_day;
    if (safeGoal !== undefined && safeGoal !== null) {
      safeGoal = Number(safeGoal);
      if (!Number.isFinite(safeGoal)) {
        return res
          .status(400)
          .json({ message: "study_goal_minutes_per_day must be a number" });
      }
      safeGoal = Math.max(0, Math.min(600, Math.round(safeGoal))); // 0..600 minutes
    }

    let safePref = preferred_difficulty;
    if (safePref !== undefined && safePref !== null) {
      safePref = String(safePref).toUpperCase();
      if (!["EASY", "MODERATE", "HARD"].includes(safePref)) {
        return res.status(400).json({
          message: "preferred_difficulty must be EASY, MODERATE, or HARD",
        });
      }
    }

    // ensure profile exists then update only provided fields
    await query(
      "INSERT INTO user_profile (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id",
      [userId]
    );

    const updates = [];
    const params = [];

    function add(field, value) {
      if (value !== undefined) {
        updates.push(`${field} = ?`);
        params.push(value === "" ? null : value);
      }
    }

    add("display_name", safeDisplay);
    add("bio", safeBio);
    add("avatar_url", safeAvatar);
    add("timezone", safeTimezone);
    add("study_goal_minutes_per_day", safeGoal);
    add("preferred_difficulty", safePref);

    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields provided to update" });
    }

    params.push(userId);

    await query(
      `UPDATE user_profile SET ${updates.join(", ")} WHERE user_id = ?`,
      params
    );

    res.json({ message: "Profile updated" });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
