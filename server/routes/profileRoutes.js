// server/routes/profileRoutes.js
const express = require("express"); // Express framework for defining API routes
const db = require("../db"); // Shared MySQL database connection
const { requireAuth } = require("../middleware/auth"); // Middleware that ensures the user is logged in

const router = express.Router(); // Router instance exported at the end of the file

// Promise wrapper
// Converts callback-based db.query into a Promise so async/await can be used.
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// GET /api/profile/me
// Returns the logged-in user's profile information, along with account details
// from the users table and the full badge list showing which badges are earned.
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId; // Read logged-in user ID from the auth middleware

    // Join with users so frontend can show username/email too
    // This query combines account information from the users table
    // with profile-specific information from user_profile.
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

    // If the user account itself does not exist, return 404.
    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // If profile row doesn't exist for some reason, create it automatically
    // The LEFT JOIN can return user data even if no matching user_profile row exists.
    // This block ensures a profile row is created so the system stays consistent.
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

      // Re-run the profile query so the response includes the freshly ensured profile row.
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

    // Load every badge in the system and mark whether this user has earned it.
    // Earned badges are sorted first, then by most recent earned date.
    const badgeRows = await query(
      `SELECT
         b.badge_id,
         b.code,
         b.name,
         b.description,
         b.icon,
         ub.earned_at,
         CASE WHEN ub.badge_id IS NOT NULL THEN 1 ELSE 0 END AS is_earned
       FROM badges b
       LEFT JOIN user_badges ub
         ON ub.badge_id = b.badge_id
        AND ub.user_id = ?
       ORDER BY
         is_earned DESC,
         ub.earned_at DESC,
         b.badge_id ASC`,
      [userId]
    );

    // Return the full profile object plus the badges array.
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
// Updates selected editable profile fields for the logged-in user.
// Only fields provided in the request body are updated.
router.put("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId; // Read logged-in user ID from the auth middleware

    const {
      display_name,
      bio,
      avatar_url,
      timezone,
      study_goal_minutes_per_day,
      preferred_difficulty,
    } = req.body || {};

    // basic validation + safety clamps
    // Trim and limit string fields to safe lengths before storing them.
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

    // Validate and clamp the daily study goal.
    // It must be a number between 0 and 600 minutes.
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

    // Validate preferred difficulty if it is provided.
    // Only EASY, MODERATE, or HARD are allowed.
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
    // This guarantees there is a user_profile row before trying to update it.
    await query(
      "INSERT INTO user_profile (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id",
      [userId]
    );

    const updates = []; // Holds SQL assignments like "bio = ?"
    const params = []; // Holds values for the SQL placeholders

    // Helper for dynamically building the UPDATE query.
    // Empty strings are converted to null so users can clear optional fields.
    function add(field, value) {
      if (value !== undefined) {
        updates.push(`${field} = ?`);
        params.push(value === "" ? null : value);
      }
    }

    // Add only the fields that were actually supplied in the request.
    add("display_name", safeDisplay);
    add("bio", safeBio);
    add("avatar_url", safeAvatar);
    add("timezone", safeTimezone);
    add("study_goal_minutes_per_day", safeGoal);
    add("preferred_difficulty", safePref);

    // If nothing was provided, return an error instead of running an empty update.
    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields provided to update" });
    }

    params.push(userId); // Final WHERE clause parameter

    // Update only the selected fields for this user's profile row.
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

// Export the configured router so it can be mounted in app.js
module.exports = router;
