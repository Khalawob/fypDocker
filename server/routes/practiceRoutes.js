const express = require("express"); // Import Express
const axios = require("axios"); // Import axios (for calling NLP service)
const db = require("../db"); // Import MySQL connection
const { requireAuth } = require("../middleware/auth"); // Import JWT auth middleware
const { completeSessionForUser } = require("./sessionRoutes"); // Import reusable session completion logic


const router = express.Router(); // Create Express router


// Promise wrapper for MySQL queries (so we can use async/await)
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err); // Reject the promise if SQL fails
      resolve(results); // Resolve with query results
    });
  });
}


// Deterministic PRNG (seeded randomness)
function mulberry32(seed) {
  let a = seed >>> 0; // Force unsigned 32-bit
  return function () {
    a |= 0; // Force int32
    a = (a + 0x6D2B79F5) | 0; // Advance seed
    let t = Math.imul(a ^ (a >>> 15), 1 | a); // Mix bits
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; // Mix bits more
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // Return [0,1)
  };
}


// Seeded shuffle for stable random ordering per session
function seededShuffle(arr, seed) {
  const rng = mulberry32(seed); // Create RNG from seed
  const a = [...arr]; // Clone array so we don’t mutate original
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); // Pick swap index
    [a[i], a[j]] = [a[j], a[i]]; // Swap elements
  }
  return a; // Return shuffled array
}


// Normalize answers for comparison (ignore punctuation/case)
function normalizeAnswer(s) {
  return String(s ?? "") // Convert to string safely
    .toLowerCase() // Ignore case
    .trim() // Remove leading/trailing spaces
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " "); // Collapse multiple spaces
}


// Check if flashcard set belongs to the logged-in user
async function ensureSetOwnership(setId, userId) {
  const rows = await query(
    "SELECT set_id FROM flashcard_set WHERE set_id = ? AND user_id = ?", // Ownership query
    [setId, userId] // Params
  );
  return rows.length > 0; // True if owned
}


// Get session (and ensure it belongs to the user) + completion info
async function getSession(sessionId, userId) {
  const rows = await query(
    `SELECT session_id, set_id, difficulty_mode, time_per_card,
            hard_phase, hard_preview_index, hard_queue,
            completed_at, final_score
     FROM practice_session
     WHERE session_id = ? AND user_id = ?`, // Session query
    [sessionId, userId] // Params
  );
  return rows[0] || null; // Return session row or null
}


// MODERATE helper: shuffle WITHIN each group (not across groups)
function orderCardsModerate(cards, groupSize, seed, randomize) {
  const gs = Math.max(1, Number(groupSize) || 5); // Ensure group size >= 1
  const out = []; // Output array


  for (let start = 0; start < cards.length; start += gs) {
    const group = cards.slice(start, start + gs); // Take one group slice
    if (randomize) {
      const groupIndex = Math.floor(start / gs); // Which group number
      out.push(...seededShuffle(group, seed + groupIndex * 101)); // Shuffle within group
    } else {
      out.push(...group); // Keep group order
    }
  }


  return out; // Return grouped ordering
}


// Safe JSON parse for HARD queue
function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text); // Parse JSON
  } catch {
    return fallback; // Return fallback if parsing fails
  }
}


// Build a compact summary for the frontend end screen (with top 3 hardest cards)
async function buildCompactSummary(completion, mode, totalCards, setId) {
  const totalAttempts = Number(completion.total_attempts || 0);         // Total attempts
  const totalCorrect = Number(completion.total_correct || 0);            // Total correct
  const totalIncorrect = Math.max(0, totalAttempts - totalCorrect);       // Total incorrect
  const accuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;   // Accuracy fraction 0..1
  const cardsAttempted = Array.isArray(completion.updated_cards)           // Unique cards attempted
    ? completion.updated_cards.length
    : 0;


  // Pick top 3 by highest difficulty_rating (hardest for this user)
  const topHard = Array.isArray(completion.updated_cards)
    ? [...completion.updated_cards]
        .sort((a, b) => Number(b.difficulty_rating || 0) - Number(a.difficulty_rating || 0)) // Desc
        .slice(0, 3)                                                                          // Top 3
    : [];


  const topIds = topHard.map((x) => Number(x.flashcardId)).filter(Boolean);     // Extract IDs


  let topCards = [];                                                           // Will become [{flashcard_id, question, difficulty_rating}]
  if (topIds.length > 0) {
    // Fetch questions for those cards (ensure they belong to the set for safety)
    const rows = await query(
      `SELECT flashcard_id, question
       FROM flashcard
       WHERE set_id = ? AND flashcard_id IN (${topIds.map(() => "?").join(",")})`,
      [setId, ...topIds]
    );


    // Map id -> question
    const qMap = new Map(rows.map((r) => [Number(r.flashcard_id), r.question]));


    // Build ordered list (keep the same “hardest first” order)
    topCards = topHard.map((x) => ({
      flashcard_id: Number(x.flashcardId),
      question: qMap.get(Number(x.flashcardId)) || null,
      difficulty_rating: Number(x.difficulty_rating || 0),
    }));
  }


  return {
    mode,   // EASY/MODERATE/HARD
    final_score: Number(completion.final_score || 0),     // Score 0..100
    total_attempts: totalAttempts,       // Attempts
    total_correct: totalCorrect,           // Correct
    total_incorrect: totalIncorrect,       // Incorrect
    accuracy,                              // 0..1
    cards_total: Number(totalCards || 0),     // Cards in set
    cards_attempted: cardsAttempted,      // Unique cards attempted
    top_hardest_cards: topCards,          //  Top 3 hardest
  };
}






// POST /api/practice/start. Creates practice_session + practice_settings


router.post("/start", requireAuth, async (req, res) => {
  try {
    const {
      set_id, // Set to practice
      difficulty_mode = "EASY", // EASY/MODERATE/HARD
      time_per_card = 5, // Timer (frontend uses this)
      group_size = 5, // MODERATE grouping size
      randomize_order = true, // Shuffle option
      use_adaptive_timing = false, // Future feature
      reading_speed_modifier = 1.0, // Future feature
      prompt_type = "NORMAL_HIDDEN", // NORMAL_HIDDEN or NLP variation type
      blank_ratio = null, // For random blanking types
      seed = null, // For deterministic randomness
    } = req.body || {}; // Default to {} if missing body


    if (!set_id) return res.status(400).json({ message: "set_id is required" }); // Validate set_id


    const ok = await ensureSetOwnership(set_id, req.user.userId); // Check set ownership
    if (!ok) return res.status(404).json({ message: "Set not found" }); // If not owned, 404


    const sessionInsert = await query(
      `INSERT INTO practice_session (user_id, set_id, difficulty_mode, time_per_card)
       VALUES (?, ?, ?, ?)`, // Insert session row
      [req.user.userId, set_id, difficulty_mode, time_per_card] // Values
    );


    const session_id = sessionInsert.insertId; // Grab new session ID


    await query(
      `INSERT INTO practice_settings
       (session_id, group_size, randomize_order, use_adaptive_timing, reading_speed_modifier, prompt_type, blank_ratio, seed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, // Insert settings row
      [
        session_id, // FK to session
        group_size, // Store group size
        !!randomize_order, // Store boolean shuffle
        !!use_adaptive_timing, // Store boolean adaptive timing
        Number(reading_speed_modifier) || 1.0, // Store reading speed modifier
        String(prompt_type), // Store prompt type
        blank_ratio !== null && blank_ratio !== undefined ? Number(blank_ratio) : null, // Store blank ratio
        seed !== null && seed !== undefined ? Number(seed) : session_id, // Default seed to session_id
      ]
    );


    res.status(201).json({ session_id }); // Return created session id
  } catch (err) {
    console.error("Practice start error:", err); // Log error
    res.status(500).json({ message: "Server error" }); // Generic 500
  }
});


// GET /api/practice/:sessionId/next
// EASY + MODERATE: linear flow, auto-complete when finished
// HARD: PREVIEW -> TEST flow, auto-complete when queue empty




router.get("/:sessionId/next", requireAuth, async (req, res) => {
  const sessionId = Number(req.params.sessionId); // Parse sessionId from URL


  try {
    const session = await getSession(sessionId, req.user.userId); // Load session (and ownership)
    if (!session) return res.status(404).json({ message: "Session not found" }); // Not found/owned


    const settingsRows = await query(
      "SELECT * FROM practice_settings WHERE session_id = ?", // Load practice settings
      [sessionId] // Param
    );
    if (settingsRows.length === 0) return res.status(500).json({ message: "Missing practice settings" }); // Must exist


    const settings = settingsRows[0]; // Single settings row


    const cards = await query(
      `SELECT flashcard_id, question, answer
       FROM flashcard
       WHERE set_id = ?
       ORDER BY flashcard_id ASC`, // Load all flashcards in set
      [session.set_id] // Param
    );


    if (cards.length === 0) return res.status(400).json({ message: "No flashcards in this set" }); // No cards


    const seed = Number(settings.seed ?? sessionId); // Determine seed
    const groupSize = Math.max(1, Number(settings.group_size) || 5); // Determine group size
    const promptType = String(settings.prompt_type || "NORMAL_HIDDEN"); // Determine prompt type
    const nlpUrl = (process.env.NLP_URL || "http://127.0.0.1:6000").trim(); // NLP base URL


    // ---------------- HARD MODE ----------------
    if (String(session.difficulty_mode) === "HARD") {
      const phase = String(session.hard_phase || "PREVIEW"); // Current HARD phase


      // PREVIEW phase: show full answers for study (no answering)
      if (phase === "PREVIEW") {
        const idx = Number(session.hard_preview_index || 0); // Current preview index


        // If preview finished, move to TEST phase and create queue
        if (idx >= cards.length) {
          const ids = cards.map((c) => c.flashcard_id); // Extract flashcard IDs
          const queue = seededShuffle(ids, seed); // Shuffle IDs for random test order


          await query(
            `UPDATE practice_session
             SET hard_phase = 'TEST', hard_queue = ?, hard_preview_index = ?
             WHERE session_id = ?`, // Switch to TEST and store queue
            [JSON.stringify(queue), cards.length, sessionId] // Values
          );


          return res.json({
            difficulty_mode: "HARD", // Mode
            phase: "TEST", // New phase
            message: "Preview finished. Start test phase.", // Message
            call_next_again: true, // Frontend can immediately call /next again
          });
        }


        const card = cards[idx]; // Current preview card


        await query(
          "UPDATE practice_session SET hard_preview_index = hard_preview_index + 1 WHERE session_id = ?", // Advance index
          [sessionId] // Param
        );


        return res.json({
          difficulty_mode: "HARD", // Mode
          phase: "PREVIEW", // Phase
          time_per_card: session.time_per_card, // Timer for frontend (e.g. 10s)
          progress: { index: idx + 1, total: cards.length }, // Preview progress
          flashcard_id: card.flashcard_id, // Card id
          question: card.question, // Question
          show_answer: true, // Tell frontend to show answer
          answer: card.answer, // Full answer (study phase)
        });
      }


      // TEST phase: take from queue and serve random cards
      const queue = safeJsonParse(session.hard_queue || "[]", []); // Parse queue from DB


      // If queue empty -> HARD finished -> AUTO COMPLETE SESSION 
      if (queue.length === 0) {
        // If already completed, just return done (avoid re-completing)
        if (session.completed_at) {
          return res.json({
            done: true, // Completed
            difficulty_mode: "HARD", // Mode
            phase: "TEST", // Phase
            message: "Test finished. Session already completed.", // Message
            final_score: session.final_score, // Provide final score if stored
          });
        }


        const completion = await completeSessionForUser(sessionId, req.user.userId); // Run completion engine


        const summary = await buildCompactSummary(
          completion,
          "HARD",
          cards.length,
          session.set_id
        );


        return res.json({
          done: true, // Completed
          difficulty_mode: "HARD", // Mode
          phase: "TEST", // Phase
          message: "Test finished. Session auto-completed.", // Message
          summary,
          completion, // Completion payload (score + updated cards)
        });
      }


      const nextId = queue[0]; // Next flashcard id to serve
      const remaining = queue.slice(1); // Remaining queue after popping


      await query(
        "UPDATE practice_session SET hard_queue = ? WHERE session_id = ?", // Persist new queue
        [JSON.stringify(remaining), sessionId] // Values
      );


      const card = cards.find((c) => c.flashcard_id === nextId); // Find card by id
      if (!card) return res.status(500).json({ message: "Queue contained invalid flashcard_id" }); // Safety check


      // NORMAL_HIDDEN in TEST: show question only
      if (promptType === "NORMAL_HIDDEN") {
        return res.json({
          difficulty_mode: "HARD", // Mode
          phase: "TEST", // Phase
          time_per_card: session.time_per_card, // Timer
          progress: { remaining: remaining.length, total: cards.length }, // Remaining count
          flashcard_id: card.flashcard_id, // Card id
          question: card.question, // Question
          prompt_type: "NORMAL_HIDDEN", // Prompt type
        });
      }


      // NLP prompt in TEST: generate variation from answer
      const payload = { text: card.answer, variation_type: promptType }; // NLP request payload


      // Add randomness controls for random-based variations
      if (promptType === "RANDOM_BLANKS" || promptType === "RANDOM_FULL_BLANKS" || promptType === "INCREASING_DIFFICULTY") {
        if (settings.blank_ratio !== null && settings.blank_ratio !== undefined) payload.blank_ratio = Number(settings.blank_ratio); // Add blank ratio
        payload.seed = seed + remaining.length; // Vary seed per step
      }


      // Increasing difficulty can use attempt_number (per card in session)
      if (promptType === "INCREASING_DIFFICULTY") {
        const attemptRows = await query(
          "SELECT COUNT(*) AS c FROM performance_result WHERE session_id = ? AND flashcard_id = ?", // Count attempts
          [sessionId, card.flashcard_id] // Params
        );
        payload.attempt_number = Number(attemptRows[0]?.c || 0) + 1; // Next attempt number
      }


      // Difficulty-level blanks uses per-user difficulty stats to set difficulty_level 1-4
      if (promptType === "DIFFICULTY_LEVEL_BLANKS") {
        const stats = await query(
          "SELECT COALESCE(difficulty_rating, 0) AS difficulty_rating FROM user_flashcard_stats WHERE user_id = ? AND flashcard_id = ?", // Get rating
          [req.user.userId, card.flashcard_id] // Params
        );


        const rating = Math.max(0, Math.min(100, Number(stats[0]?.difficulty_rating ?? 0))); // Clamp 0..100


        let difficulty_level = 1; // Default level
        if (rating > 75) difficulty_level = 4; // Level 4
        else if (rating > 50) difficulty_level = 3; // Level 3
        else if (rating > 25) difficulty_level = 2; // Level 2


        payload.difficulty_level = difficulty_level; // Add to NLP payload
      }


      const axRes = await axios.post(`${nlpUrl}/generate`, payload); // Call NLP service


      return res.json({
        difficulty_mode: "HARD", // Mode
        phase: "TEST", // Phase
        time_per_card: session.time_per_card, // Timer
        progress: { remaining: remaining.length, total: cards.length }, // Remaining count
        flashcard_id: card.flashcard_id, // Card id
        question: card.question, // Question
        prompt_type: promptType, // Prompt type
        blanked_text: axRes.data.blanked_text, // Variation output
        first_letter_clues: axRes.data.first_letter_clues, // Clues output
      });
    }


    //EASY / MODERATE


    const progressRows = await query(
      "SELECT COUNT(*) AS answered_count FROM performance_result WHERE session_id = ?", // Count submitted answers
      [sessionId] // Param
    );


    const answeredCount = Number(progressRows[0]?.answered_count || 0); // Cursor position


    // AUTO-COMPLETE EASY/MODERATE when answeredCount >= total
    if (answeredCount >= cards.length) {
      // If already completed, just return done (avoid double-complete)
      if (session.completed_at) {
        return res.json({
          done: true, // Done
          difficulty_mode: session.difficulty_mode, // Mode
          message: "Session already completed.", // Message
          final_score: session.final_score, // Score if stored
        });
      }


      // Complete the session and update per-user difficulty stats
      const completion = await completeSessionForUser(sessionId, req.user.userId); // Completion engine


      const summary = await buildCompactSummary(
        completion,
        session.difficulty_mode,
        cards.length,
        session.set_id
      );


      return res.json({
        done: true, // Done
        difficulty_mode: session.difficulty_mode, // Mode
        message: "Session finished. Auto-completed.", // Message
        summary, // Compact summary for frontend end screen
        completion, // Completion payload
      });
    }


    let ordered; // Will hold ordered list of cards


    // MODERATE: grouped ordering
    if (String(session.difficulty_mode) === "MODERATE") {
      ordered = orderCardsModerate(cards, settings.group_size, seed, settings.randomize_order); // Group ordering
    } else {
      // EASY (and default): shuffle whole set if enabled
      ordered = settings.randomize_order ? seededShuffle(cards, seed) : cards; // Full shuffle ordering
    }


    const currentCard = ordered[answeredCount]; // Select next card using answeredCount


    const groupIndex = Math.floor(answeredCount / groupSize); // Compute group number
    const indexInGroup = answeredCount % groupSize; // Compute position in group


    const basePayload = {
      flashcard_id: currentCard.flashcard_id, // Card id
      question: currentCard.question, // Question
      prompt_type: promptType, // Prompt type
      difficulty_mode: session.difficulty_mode, // Mode
      time_per_card: session.time_per_card, // Timer
      group: {
        group_index: groupIndex + 1, // Human-friendly group number
        group_size: groupSize, // Group size
        index_in_group: indexInGroup + 1, // Human-friendly position
      },
      progress: {
        answered: answeredCount, // Answered so far
        total: cards.length, // Total cards
      },
    };


    // NORMAL flashcard: frontend hides answer
    if (promptType === "NORMAL_HIDDEN") return res.json(basePayload); // Return base payload only


    // NLP flashcard prompt: build payload
    const payload = {
      text: currentCard.answer, // Use correct answer as source text for blanking
      variation_type: promptType, // Variation type
    };


    // Add randomness controls for random-based variations
    if (promptType === "RANDOM_BLANKS" || promptType === "RANDOM_FULL_BLANKS" || promptType === "INCREASING_DIFFICULTY") {
      if (settings.blank_ratio !== null && settings.blank_ratio !== undefined) payload.blank_ratio = Number(settings.blank_ratio); // Ratio
      payload.seed = seed + answeredCount; // Seed per step
    }


    // Increasing difficulty uses attempt_number
    if (promptType === "INCREASING_DIFFICULTY") {
      const attemptRows = await query(
        "SELECT COUNT(*) AS c FROM performance_result WHERE session_id = ? AND flashcard_id = ?", // Count attempts
        [sessionId, currentCard.flashcard_id] // Params
      );
      payload.attempt_number = Number(attemptRows[0]?.c || 0) + 1; // Next attempt number
    }


    // Difficulty-level blanks uses per-user stats
    if (promptType === "DIFFICULTY_LEVEL_BLANKS") {
      const stats = await query(
        "SELECT COALESCE(difficulty_rating, 0) AS difficulty_rating FROM user_flashcard_stats WHERE user_id = ? AND flashcard_id = ?", // Rating query
        [req.user.userId, currentCard.flashcard_id] // Params
      );


      const rating = Math.max(0, Math.min(100, Number(stats[0]?.difficulty_rating ?? 0))); // Clamp 0..100


      let difficulty_level = 1; // Default
      if (rating > 75) difficulty_level = 4; // Level 4
      else if (rating > 50) difficulty_level = 3; // Level 3
      else if (rating > 25) difficulty_level = 2; // Level 2


      payload.difficulty_level = difficulty_level; // Add to payload
    }


    const axRes = await axios.post(`${nlpUrl}/generate`, payload); // Call NLP generator


    return res.json({
      ...basePayload, // Include base fields
      blanked_text: axRes.data.blanked_text, // Include blanked prompt
      first_letter_clues: axRes.data.first_letter_clues, // Include clues
    });
  } catch (err) {
    console.error("Next card error:", err); // Log error
    res.status(500).json({ message: "Server error" }); // Generic 500
  }
});


// POST /api/practice/:sessionId/answer
// Save performance_result attempt (EASY/MODERATE/HARD TEST)
   
router.post("/:sessionId/answer", requireAuth, async (req, res) => {
  const sessionId = Number(req.params.sessionId); // Parse sessionId


  try {
    const session = await getSession(sessionId, req.user.userId); // Load session
    if (!session) return res.status(404).json({ message: "Session not found" }); // Not found/owned


    // Block answering during HARD preview phase
    if (session.difficulty_mode === "HARD" && session.hard_phase === "PREVIEW") {
      return res.status(400).json({ message: "Cannot submit answers during HARD preview phase" }); // Reject
    }


    const { flashcard_id, user_answer, time_taken = null } = req.body || {}; // Read body


    if (!flashcard_id || user_answer === undefined) {
      return res.status(400).json({ message: "flashcard_id and user_answer are required" }); // Validate
    }


    const cardRows = await query(
      "SELECT answer FROM flashcard WHERE flashcard_id = ? AND set_id = ?", // Get correct answer
      [flashcard_id, session.set_id] // Params
    );


    if (cardRows.length === 0) return res.status(404).json({ message: "Flashcard not found in this set" }); // Validate card


    const correctAnswer = cardRows[0].answer; // Correct answer


    const is_correct = normalizeAnswer(user_answer) === normalizeAnswer(correctAnswer) ? 1 : 0; // Compare


    const attemptRows = await query(
      "SELECT COUNT(*) AS c FROM performance_result WHERE session_id = ? AND flashcard_id = ?", // Count attempts
      [sessionId, flashcard_id] // Params
    );


    const attempt_number = Number(attemptRows[0]?.c || 0) + 1; // Next attempt number


    await query(
      `INSERT INTO performance_result
       (session_id, flashcard_id, is_correct, user_answer, time_taken, attempt_number)
       VALUES (?, ?, ?, ?, ?, ?)`, // Insert attempt row
      [
        sessionId, // Session
        flashcard_id, // Flashcard
        is_correct, // Correct flag
        String(user_answer), // User answer
        time_taken !== null && time_taken !== undefined ? Number(time_taken) : null, // Time taken
        attempt_number, // Attempt number
      ]
    );


    res.json({
      is_correct: !!is_correct, // Boolean correctness
      correct_answer: correctAnswer, // Return correct answer (useful for feedback)
      attempt_number, // Return attempt number
    });
  } catch (err) {
    console.error("Answer error:", err); // Log error
    res.status(500).json({ message: "Server error" }); // Generic 500
  }
});


// Returns top hardest cards for this user in this session's set


router.get("/:sessionId/review-hardest", requireAuth, async (req, res) => {
  const sessionId = Number(req.params.sessionId);                        // Read session id from URL
  const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 3)); // Clamp limit (1..20), default 3


  try {
    const session = await getSession(sessionId, req.user.userId);        // Load session + ensure ownership
    if (!session) return res.status(404).json({ message: "Session not found" }); // Reject if not owned


    // Pull top hardest cards based on user_flashcard_stats difficulty_rating
    // Only within this session’s set for safety/consistency
    const rows = await query(
      `SELECT
         f.flashcard_id,                                                -- Card id
         f.question,                                                    -- Question text
         f.answer,                                                      -- Answer text (for review)
         COALESCE(ufs.difficulty_rating, 0) AS difficulty_rating,       -- User-specific difficulty
         COALESCE(ufs.times_seen, 0) AS times_seen,                     -- Times seen
         COALESCE(ufs.correct_count, 0) AS correct_count,               -- Correct count
         COALESCE(ufs.incorrect_count, 0) AS incorrect_count,           -- Incorrect count
         COALESCE(ufs.avg_time_taken, 0) AS avg_time_taken              -- Avg time
       FROM flashcard f
       LEFT JOIN user_flashcard_stats ufs
         ON ufs.flashcard_id = f.flashcard_id AND ufs.user_id = ?
       WHERE f.set_id = ?
       ORDER BY COALESCE(ufs.difficulty_rating, 0) DESC, f.flashcard_id DESC
       LIMIT ?`,
      [req.user.userId, session.set_id, limit]                          // Params
    );


    res.json({
      session_id: sessionId,                                            // Echo session id
      set_id: session.set_id,                                           // Echo set id
      limit,                                                           // Echo limit used
      cards: rows,                                                     // Return cards for review
    });
  } catch (err) {
    console.error("Review-hardest error:", err);                        // Log server error
    res.status(500).json({ message: "Server error" });                  // Generic 500
  }
});


module.exports = router; // Export router
