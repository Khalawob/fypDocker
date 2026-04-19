// server/routes/sessionRoutes.js
// server/routes/sessionRoutes.js
const express = require("express"); // Express framework for defining API routes
const db = require("../db"); // Shared MySQL database connection
const { requireAuth } = require("../middleware/auth"); // Middleware that ensures the user is logged in
const { updateAdaptiveSetReminder } = require("../utils/setReviewScheduler"); // Helper used to reschedule adaptive reminders after a completed session

const router = express.Router(); // Router instance exported at the end of the file

// Promise wrapper for MySQL queries.
// Converts callback-based db.query into a Promise so async/await can be used.
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// Clamp helper.
// Restricts a number to stay within the provided min/max range.
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Awards a badge to a user using the badge's code value.
// If the badge does not exist, returns false.
// If the badge already exists for the user, the ON DUPLICATE KEY clause
// prevents duplicate rows being created.
async function awardBadgeByCode(userId, code) {
  const badgeRows = await query(
    "SELECT badge_id FROM badges WHERE code = ? LIMIT 1",
    [code]
  );

  if (badgeRows.length === 0) {
    return false;
  }

  const badgeId = badgeRows[0].badge_id;

  await query(
    `INSERT INTO user_badges (user_id, badge_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE earned_at = earned_at`,
    [userId, badgeId]
  );

  return true;
}

/**
 * COMPLETE SESSION ENGINE (REUSABLE)
 * Finalises a session and updates PER-USER difficulty in user_flashcard_stats
 * based on performance_result.
 */

// This is the main reusable session-completion engine.
// It is responsible for:
// 1) verifying the session belongs to the user
// 2) reading the performance_result records for the session
// 3) updating user_flashcard_stats for each attempted card
// 4) saving the final session score
// 5) updating adaptive reminders if needed
// 6) awarding badges triggered by the session
//
// It is reused both by this route file and by practiceRoutes.js.
async function completeSessionForUser(sessionId, userId) {
  // 1) Ensure session belongs to user
  // Load the session and related timing/adaptive settings.
  const sessionRows = await query(
    `SELECT
       ps.session_id,
       ps.set_id,
       ps.difficulty_mode,
       pset.use_adaptive_timing,
       pset.use_adaptive_preview_timing,
       pset.use_adaptive_answer_timing
     FROM practice_session ps
     LEFT JOIN practice_settings pset
       ON pset.session_id = ps.session_id
     WHERE ps.session_id = ? AND ps.user_id = ?`,
    [sessionId, userId]
  );

  // If the session does not belong to this user, stop immediately.
  if (sessionRows.length === 0) {
    const err = new Error("Session not found");
    err.status = 404;
    throw err;
  }

  const session = sessionRows[0];

  // 2) Aggregate performance per flashcard for this session
  // Summarise each flashcard's performance within this session:
  // - number of attempts
  // - how many were correct
  // - average answer time
  const perf = await query(
    `SELECT
       flashcard_id,
       COUNT(*) AS attempts,
       SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
       AVG(COALESCE(time_taken, 0)) AS avg_time
     FROM performance_result
     WHERE session_id = ?
     GROUP BY flashcard_id`,
    [sessionId]
  );

  // If no performance data exists, the session cannot be completed meaningfully.
  if (perf.length === 0) {
    const err = new Error("No performance data for this session");
    err.status = 400;
    throw err;
  }

  // 3) Load existing stats rows (if any) for this user + these flashcards
  // Build a list of flashcard IDs attempted in this session.
  const ids = perf.map((r) => r.flashcard_id);

  // Load any existing per-user stats rows for those cards.
  const existingStats = await query(
    `SELECT user_id, flashcard_id, difficulty_rating, times_seen, correct_count, incorrect_count, avg_time_taken
     FROM user_flashcard_stats
     WHERE user_id = ? AND flashcard_id IN (${ids.map(() => "?").join(",")})`,
    [userId, ...ids]
  );

  // Store existing stats in a Map for fast lookup by flashcard ID.
  const statsMap = new Map(existingStats.map((s) => [s.flashcard_id, s]));

  // 4) Compute updates + apply them
  // updates will be returned in the response so the frontend/other code
  // can inspect which cards changed.
  const updates = [];
  let totalCorrect = 0;
  let totalAttempts = 0;

  // Process each flashcard attempted in this session.
  for (const r of perf) {
    const flashcardId = r.flashcard_id;
    const attempts = Number(r.attempts || 0);
    const correct = Number(r.correct_count || 0);
    const avgTimeThisSession = Number(r.avg_time || 0);

    totalCorrect += correct;
    totalAttempts += attempts;

    const incorrect = attempts - correct;

    // Session difficulty score (0..100)
    // This score increases when:
    // - the user gets more answers wrong
    // - the user takes longer to answer
    //
    // incorrectRate contributes most of the difficulty score,
    // while timeFactor adds a smaller timing-based influence.
    const incorrectRate = attempts > 0 ? incorrect / attempts : 0; // 0..1
    const timeFactor = clamp(avgTimeThisSession / 10, 0, 2); // 0..2 (10s baseline)
    const sessionScore = clamp(incorrectRate * 80 + timeFactor * 10, 0, 100);

    const existing = statsMap.get(flashcardId);

    // If the user has never seen this flashcard before, create a fresh stats row.
    if (!existing) {
      // First time user has stats for this card
      const initialRating = clamp(sessionScore, 0, 100);
      const initialAvgTime = avgTimeThisSession || 0;

      await query(
        `INSERT INTO user_flashcard_stats
         (user_id, flashcard_id, difficulty_rating, times_seen, correct_count, incorrect_count, avg_time_taken, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [userId, flashcardId, initialRating, attempts, correct, incorrect, initialAvgTime]
      );

      updates.push({
        flashcardId,
        difficulty_rating: initialRating,
        times_seen: attempts,
        correct_count: correct,
        incorrect_count: incorrect,
        avg_time_taken: initialAvgTime,
      });
    } else {
      // If stats already exist, merge this session into the running totals.
      const oldRating = Number(existing.difficulty_rating || 0);
      const oldSeen = Number(existing.times_seen || 0);
      const oldCorrect = Number(existing.correct_count || 0);
      const oldIncorrect = Number(existing.incorrect_count || 0);
      const oldAvgTime = Number(existing.avg_time_taken || 0);

      const newSeen = oldSeen + attempts;
      const newCorrect = oldCorrect + correct;
      const newIncorrect = oldIncorrect + incorrect;

      // Running average time (weighted by attempts)
      // This preserves historical timing instead of overwriting it with only this session's average.
      const oldTotalTime = oldAvgTime * oldSeen;
      const newTotalTime = oldTotalTime + avgTimeThisSession * attempts;
      const newAvgTime = newSeen > 0 ? newTotalTime / newSeen : 0;

      // Smooth difficulty update (prevents wild jumps)
      // Old difficulty contributes 70%, current session contributes 30%.
      const updatedRating = clamp(oldRating * 0.7 + sessionScore * 0.3, 0, 100);

      await query(
        `UPDATE user_flashcard_stats
         SET difficulty_rating = ?, times_seen = ?, correct_count = ?, incorrect_count = ?, avg_time_taken = ?, last_seen = NOW()
         WHERE user_id = ? AND flashcard_id = ?`,
        [updatedRating, newSeen, newCorrect, newIncorrect, newAvgTime, userId, flashcardId]
      );

      updates.push({
        flashcardId,
        difficulty_rating: updatedRating,
        times_seen: newSeen,
        correct_count: newCorrect,
        incorrect_count: newIncorrect,
        avg_time_taken: Number(newAvgTime.toFixed(2)),
      });
    }
  }

  // 5) Final score for the session (percentage)
  // finalScore is stored in practice_session as a rounded percentage.
  const finalScore = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  await query(
    "UPDATE practice_session SET completed_at = NOW(), final_score = ? WHERE session_id = ?",
    [finalScore, sessionId]
  );

  // accuracy is kept as a 0..1 ratio because the reminder scheduler expects it in that form.
  const accuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

  // If the set has adaptive reminders enabled, update the next reminder timing
  // based on the user's session accuracy and difficulty mode.
  try {
    const reminderRows = await query(
      `SELECT reminder_enabled, adaptive_enabled
       FROM set_review_reminder
       WHERE user_id = ? AND set_id = ?`,
      [userId, session.set_id]
    );

    if (reminderRows.length > 0) {
      const reminder = reminderRows[0];

      if (Number(reminder.reminder_enabled) === 1 && Number(reminder.adaptive_enabled) === 1) {
        await updateAdaptiveSetReminder({
          userId,
          setId: session.set_id,
          accuracy,
          difficultyMode: session.difficulty_mode,
        });
      }
    }
  } catch (schedulerErr) {
    // Reminder scheduling failures should not block session completion.
    console.error("Adaptive reminder scheduling error:", schedulerErr);
  }

  // Award badges based on the finished session.
  // This is wrapped in its own try/catch so badge issues do not block completion.
  try {
    // Perfect score badge
    if (finalScore === 100) {
      await awardBadgeByCode(userId, "PERFECT_RECALL");
    }

    // Mode-specific badges
    if (String(session.difficulty_mode).toUpperCase() === "EASY") {
      await awardBadgeByCode(userId, "EASY_EXPLORER");
    }

    if (String(session.difficulty_mode).toUpperCase() === "MODERATE") {
      await awardBadgeByCode(userId, "MODERATE_MASTER");
    }

    if (String(session.difficulty_mode).toUpperCase() === "HARD") {
      await awardBadgeByCode(userId, "HARDCORE_HERO");
    }

    // Adaptive learner badge if any adaptive timing feature was enabled.
    const adaptiveUsed =
      Number(session.use_adaptive_timing) === 1 ||
      Number(session.use_adaptive_preview_timing) === 1 ||
      Number(session.use_adaptive_answer_timing) === 1;

    if (adaptiveUsed) {
      await awardBadgeByCode(userId, "ADAPTIVE_LEARNER");
    }

    // Consistent accuracy badge if the user has completed at least 5 sessions
    // with scores of 80% or higher.
    const consistentRows = await query(
      `SELECT COUNT(*) AS qualifying_count
       FROM practice_session
       WHERE user_id = ?
         AND completed_at IS NOT NULL
         AND final_score >= 80`,
      [userId]
    );

    if (Number(consistentRows[0]?.qualifying_count || 0) >= 5) {
      await awardBadgeByCode(userId, "CONSISTENT_ACCURACY");
    }
  } catch (badgeErr) {
    console.error("Badge award error during session completion:", badgeErr);
  }

  // Return completion payload (used by endpoint + practice auto-complete)
  // This summary is reused by both this route and practiceRoutes.js.
  return {
    session_id: sessionId,
    final_score: finalScore,
    total_attempts: totalAttempts,
    total_correct: totalCorrect,
    updated_cards: updates,
  };
}

// POST /api/sessions/:sessionId/complete
// Manually completes a practice session for the logged-in user
// by running the reusable completeSessionForUser engine.
router.post("/sessions/:sessionId/complete", requireAuth, async (req, res) => {
  const sessionId = Number(req.params.sessionId); // Parse session ID from the URL

  try {
    const result = await completeSessionForUser(sessionId, req.user.userId);
    res.json({
      message: "Session completed. Per-user difficulty updated.",
      ...result,
    });
  } catch (err) {
    console.error("Complete session error:", err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
});

// Export router + attach function for reuse in practiceRoutes.js
module.exports = router;
module.exports.completeSessionForUser = completeSessionForUser;


