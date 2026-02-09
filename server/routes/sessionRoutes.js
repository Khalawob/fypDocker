// server/routes/sessionRoutes.js
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * POST /api/sessions/:sessionId/complete
 * Finalises a session and updates PER-USER difficulty in user_flashcard_stats
 * based on performance_result.
 */
router.post("/sessions/:sessionId/complete", requireAuth, async (req, res) => {
  const sessionId = Number(req.params.sessionId);

  try {
    // 1) Ensure session belongs to user
    const sessionRows = await query(
      "SELECT session_id FROM practice_session WHERE session_id = ? AND user_id = ?",
      [sessionId, req.user.userId]
    );

    if (sessionRows.length === 0) {
      return res.status(404).json({ message: "Session not found" });
    }

    // 2) Aggregate performance per flashcard for this session
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

    if (perf.length === 0) {
      return res
        .status(400)
        .json({ message: "No performance data for this session" });
    }

    // 3) Load existing stats rows (if any) for this user + these flashcards
    const ids = perf.map((r) => r.flashcard_id);

    const existingStats = await query(
      `SELECT user_id, flashcard_id, difficulty_rating, times_seen, correct_count, incorrect_count, avg_time_taken
       FROM user_flashcard_stats
       WHERE user_id = ? AND flashcard_id IN (${ids.map(() => "?").join(",")})`,
      [req.user.userId, ...ids]
    );

    const statsMap = new Map(existingStats.map((s) => [s.flashcard_id, s]));

    // 4) Compute updates + apply them
    const updates = [];
    let totalCorrect = 0;
    let totalAttempts = 0;

    for (const r of perf) {
      const flashcardId = r.flashcard_id;
      const attempts = Number(r.attempts || 0);
      const correct = Number(r.correct_count || 0);
      const avgTimeThisSession = Number(r.avg_time || 0);

      totalCorrect += correct;
      totalAttempts += attempts;

      const incorrect = attempts - correct;

      // Session difficulty score (0..100)
      const incorrectRate = attempts > 0 ? incorrect / attempts : 0; // 0..1
      const timeFactor = clamp(avgTimeThisSession / 10, 0, 2); // 0..2 (10s baseline)
      const sessionScore = clamp((incorrectRate * 80) + (timeFactor * 10), 0, 100);

      const existing = statsMap.get(flashcardId);

      if (!existing) {
        // First time user has stats for this card
        const initialRating = clamp(sessionScore, 0, 100);
        const initialAvgTime = avgTimeThisSession || 0;

        await query(
          `INSERT INTO user_flashcard_stats
           (user_id, flashcard_id, difficulty_rating, times_seen, correct_count, incorrect_count, avg_time_taken, last_seen)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            req.user.userId,
            flashcardId,
            initialRating,
            attempts,
            correct,
            incorrect,
            initialAvgTime,
          ]
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
        const oldRating = Number(existing.difficulty_rating || 0);
        const oldSeen = Number(existing.times_seen || 0);
        const oldCorrect = Number(existing.correct_count || 0);
        const oldIncorrect = Number(existing.incorrect_count || 0);
        const oldAvgTime = Number(existing.avg_time_taken || 0);

        const newSeen = oldSeen + attempts;
        const newCorrect = oldCorrect + correct;
        const newIncorrect = oldIncorrect + incorrect;

        // Running average time (weighted by attempts)
        const oldTotalTime = oldAvgTime * oldSeen;
        const newTotalTime = oldTotalTime + (avgTimeThisSession * attempts);
        const newAvgTime = newSeen > 0 ? (newTotalTime / newSeen) : 0;

        // Smooth difficulty update (prevents wild jumps)
        const updatedRating = clamp(oldRating * 0.7 + sessionScore * 0.3, 0, 100);

        await query(
          `UPDATE user_flashcard_stats
           SET difficulty_rating = ?, times_seen = ?, correct_count = ?, incorrect_count = ?, avg_time_taken = ?, last_seen = NOW()
           WHERE user_id = ? AND flashcard_id = ?`,
          [
            updatedRating,
            newSeen,
            newCorrect,
            newIncorrect,
            newAvgTime,
            req.user.userId,
            flashcardId,
          ]
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
    const finalScore =
      totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

    await query(
      "UPDATE practice_session SET completed_at = NOW(), final_score = ? WHERE session_id = ?",
      [finalScore, sessionId]
    );

    res.json({
      message: "Session completed. Per-user difficulty updated.",
      session_id: sessionId,
      final_score: finalScore,
      updated_cards: updates,
    });
  } catch (err) {
    console.error("Complete session error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

