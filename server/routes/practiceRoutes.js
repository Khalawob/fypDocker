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

// Clamp helper to keep numbers in a safe range
function clamp(n, min, max) { // Define clamp function
  return Math.max(min, Math.min(max, n)); // Return clamped value
}

// Count words in a string (simple)
function countWords(text) { // Define word counter
  const s = String(text || "").trim(); // Convert to string and trim
  if (!s) return 0; // If empty string, return 0
  return s.split(/\s+/).filter(Boolean).length; // Split on whitespace and count
}

// Get user's calibrated words_per_second (fallback to default)
async function getUserWordsPerSecond(userId) { // Define calibration fetch
  const rows = await query( // Query DB
    "SELECT words_per_second FROM user_calibration WHERE user_id = ?", // Select calibration
    [userId] // Params
  );

  if (rows.length === 0) return 2.5; // Default reading speed if not calibrated
  const wps = Number(rows[0].words_per_second); // Convert to number
  if (!Number.isFinite(wps) || wps <= 0) return 2.5; // Safety fallback
  return clamp(wps, 1.0, 6.0); // Clamp to sensible range
}

// Get per-user difficulty rating for a flashcard (fallback 50)
async function getUserDifficultyRating(userId, flashcardId) { // Define difficulty fetch
  const rows = await query( // Query DB
    "SELECT difficulty_rating FROM user_flashcard_stats WHERE user_id = ? AND flashcard_id = ?", // Select rating
    [userId, flashcardId] // Params
  );

  if (rows.length === 0) return 50; // Default difficulty if no stats
  const rating = Number(rows[0].difficulty_rating); // Convert to number
  if (!Number.isFinite(rating)) return 50; // Safety fallback
  return clamp(rating, 0, 100); // Clamp 0..100
}

// Compute adaptive time (seconds) using reading speed + difficulty + modifier
async function computeAdaptiveTimeSeconds({ // Define adaptive timing calculator
  userId, // User id
  flashcardId, // Flashcard id
  textForTiming, // Text whose length determines timing
  readingSpeedModifier, // User preference multiplier
}) {
  const wps = await getUserWordsPerSecond(userId); // Fetch words per second
  const rating = await getUserDifficultyRating(userId, flashcardId); // Fetch difficulty rating

  const wordCount = Math.max(1, countWords(textForTiming)); // Count words (min 1)

  const baseSeconds = wordCount / wps; // Base time from reading speed

  const difficultyMultiplier = 0.9 + (rating / 100) * 0.7; // 0.9 (easy) -> 1.6 (hard)

  const modifier = Number(readingSpeedModifier || 1.0); // Convert modifier to number
  const safeModifier = Number.isFinite(modifier) ? clamp(modifier, 0.5, 2.0) : 1.0; // Clamp modifier

  const raw = baseSeconds * difficultyMultiplier * safeModifier; // Compute raw time

  const seconds = clamp(raw, 3, 20); // Clamp final time to 3..20 seconds

  return { // Return both final seconds and debug info
    seconds: Number(seconds.toFixed(2)), // Rounded seconds
    debug: { // Debug info object
      word_count: wordCount, // Words in text
      words_per_second: Number(wps.toFixed(2)), // Calibrated speed
      difficulty_rating: rating, // Rating 0..100
      difficulty_multiplier: Number(difficultyMultiplier.toFixed(2)), // Multiplier
      reading_speed_modifier: Number(safeModifier.toFixed(2)), // Modifier
      base_seconds: Number(baseSeconds.toFixed(2)), // Base time
      raw_seconds: Number(raw.toFixed(2)), // Raw time before clamp
      final_seconds: Number(seconds.toFixed(2)), // Final time
    },
  };
}

// Count "blanks" in blanked_text (underscore runs like ____ or r________)
function countBlanks(blankedText) {
  const s = String(blankedText || "");
  if (!s) return 0;
  const matches = s.match(/_{2,}/g); // runs of 2+ underscores
  return matches ? matches.length : 0;
}

// Adaptive ANSWER time (seconds) based on:
// - user reading speed (wps)
// - per-user difficulty_rating (0..100)
// - question + (answer OR blanked_text) word count
// - number of blanks
async function computeAdaptiveAnswerLimitSeconds({
  userId,
  flashcardId,
  questionText,
  answerText,
  blankedText,               // optional (if blanks mode)
  baseAnswerLimitSeconds,    // session.answer_time_limit (e.g. 120)
  readingSpeedModifier,      // settings.reading_speed_modifier
}) {
  const wps = await getUserWordsPerSecond(userId);
  const rating = await getUserDifficultyRating(userId, flashcardId);

  const qWords = countWords(questionText);
  const aWords = countWords(answerText);
  const bWords = countWords(blankedText);

  // If blanks exist, user reads question + blanked text; else question + answer
  const totalWordsToProcess = blankedText ? (qWords + bWords) : (qWords + aWords);

  const blanks = countBlanks(blankedText);

  const baseLimit = Number(baseAnswerLimitSeconds || 120);
  const safeBase = Number.isFinite(baseLimit) ? clamp(baseLimit, 30, 300) : 120;

  const modifier = Number(readingSpeedModifier || 1.0);
  const safeModifier = Number.isFinite(modifier) ? clamp(modifier, 0.5, 2.0) : 1.0;

  // Model:
  // - reading/thinking time depends on words and wps
  // - difficulty scales it up
  // - blanks add fixed overhead
  const readingThinkingSeconds = (Math.max(1, totalWordsToProcess) / wps) * 2.0;
  const difficultyMultiplier = 1.0 + (rating / 100) * 0.8; // 1.0..1.8
  const blanksPenalty = blanks * 1.5; // seconds per blank

  const raw =
    (safeBase * 0.6) +
    (readingThinkingSeconds * difficultyMultiplier * 4) +
    blanksPenalty;

  const finalSeconds = clamp(raw * safeModifier, 30, 300);

  return {
    seconds: Math.round(finalSeconds),
    debug: {
      words_per_second: Number(wps.toFixed(2)),
      difficulty_rating: rating,
      question_words: qWords,
      answer_words: aWords,
      blanked_words: bWords,
      total_words_used: totalWordsToProcess,
      blanks_count: blanks,
      base_answer_limit: safeBase,
      difficulty_multiplier: Number(difficultyMultiplier.toFixed(2)),
      reading_speed_modifier: Number(safeModifier.toFixed(2)),
      raw_seconds: Number(raw.toFixed(2)),
      final_seconds: Math.round(finalSeconds),
    },
  };
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
    `SELECT session_id, set_id, difficulty_mode,
            display_time_per_card, answer_time_limit,
            card_order_json, easy_phase, easy_index,
            moderate_phase, moderate_group_index, moderate_preview_index, 
            moderate_test_index,
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
      display_time_per_card = null, // reading time (how long card is shown before answering)
      answer_time_limit = null, // answering time limit (default 2 minutes)
      group_size = 5, // MODERATE grouping size
      randomize_order = true, // Shuffle option
      use_adaptive_timing = false, // legacy (kept for backward compatibility)
      use_adaptive_preview_timing = null, // new (null means "inherit from legacy")
      use_adaptive_answer_timing = null,  // new (null means "inherit from legacy")
      reading_speed_modifier = 1.0, // User-controlled timing modifier (e.g. 0.8 for 20% faster, 1.2 for 20% slower)
      prompt_type = "NORMAL_HIDDEN", // NORMAL_HIDDEN or NLP variation type
      blank_ratio = null, // For random blanking types
      seed = null, // For deterministic randomness
    } = req.body || {}; // Default to {} if missing body


    if (!set_id) return res.status(400).json({ message: "set_id is required" }); // Validate set_id


    const ok = await ensureSetOwnership(set_id, req.user.userId); // Check set ownership
    if (!ok) return res.status(404).json({ message: "Set not found" }); // If not owned, 404

    // Decide display (reading) time default based on mode
    let displayTime = Number(display_time_per_card); // Use new field if provided

    if (!Number.isFinite(displayTime) || displayTime <= 0) { // If not provided
      if (String(difficulty_mode) === "EASY") displayTime = 5;
      else if (String(difficulty_mode) === "MODERATE") displayTime = 10;
      else if (String(difficulty_mode) === "HARD") displayTime = 10;
      else displayTime = 10;
    }

    // Decide answer time limit default (2 minutes)
    let answerLimit = Number(answer_time_limit); // Parse answer limit
    if (!Number.isFinite(answerLimit) || answerLimit <= 0) answerLimit = 120; // Default 120 seconds

    const sessionInsert = await query(
      `INSERT INTO practice_session (user_id, set_id, difficulty_mode, display_time_per_card, answer_time_limit)
       VALUES (?, ?, ?, ?, ?)`, // Insert session row
      [req.user.userId, set_id, difficulty_mode, displayTime, answerLimit] // Values
    );


    const session_id = sessionInsert.insertId; // Grab new session ID
    
    // Build and store a stable card order for this session + initialize phases
    const cardIdRows = await query(
      `SELECT flashcard_id
      FROM flashcard
      WHERE set_id = ?
      ORDER BY flashcard_id ASC`,
      [set_id]
    );

    const ids = cardIdRows.map(r => Number(r.flashcard_id)).filter(Boolean);

    // 
    const sessionSeed = seed !== null && seed !== undefined ? Number(seed) : session_id;
    const orderedIds = randomize_order ? seededShuffle(ids, sessionSeed) : ids;

    const updates = [];
    const params = [];

    // Always store card order for ALL modes (useful for consistency)
    updates.push("card_order_json = ?");
    params.push(JSON.stringify(orderedIds));

    // Initialize only the chosen mode
    if (String(difficulty_mode) === "EASY") {
      updates.push("easy_phase = 'PREVIEW'");
      updates.push("easy_index = 0");
    }

    if (String(difficulty_mode) === "MODERATE") {
      updates.push("moderate_phase = 'PREVIEW'");
      updates.push("moderate_group_index = 0");
      updates.push("moderate_preview_index = 0");
      updates.push("moderate_test_index = 0");
    }

    if (String(difficulty_mode) === "HARD") {
      updates.push("hard_phase = 'PREVIEW'");
      updates.push("hard_preview_index = 0");
      updates.push("hard_queue = NULL");
    }

    // finalize update
    params.push(session_id);

    await query(
      `UPDATE practice_session
      SET ${updates.join(", ")}
      WHERE session_id = ?`,
      params
    );

    // Backward compatible behavior:
    // If new toggles are omitted (null), inherit from legacy use_adaptive_timing.
    const adaptivePreview =
      use_adaptive_preview_timing === null || use_adaptive_preview_timing === undefined
        ? !!use_adaptive_timing
        : !!use_adaptive_preview_timing;

    const adaptiveAnswer =
      use_adaptive_answer_timing === null || use_adaptive_answer_timing === undefined
        ? !!use_adaptive_timing
        : !!use_adaptive_answer_timing;

  
    await query(
      `INSERT INTO practice_settings
       (session_id, group_size, randomize_order, 
       use_adaptive_timing, use_adaptive_preview_timing, use_adaptive_answer_timing, 
       reading_speed_modifier, prompt_type, blank_ratio, seed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, // Insert settings row
      [
        session_id, // FK to session
        group_size, // Store group size
        !!randomize_order, // Store boolean shuffle

        //legacy and new split toggles
        !!use_adaptive_timing, // Store boolean adaptive timing
        adaptivePreview, // Store adaptive preview timing
        adaptiveAnswer, // Store adaptive answer timing

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
    if (settingsRows.length === 0) {
      return res.status(500).json({ message: "Missing practice settings" }); // Must exist
    }
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

        let displayTimeToSend = Number(session.display_time_per_card || 10); // Reading time
        let timingDebug = null; // Optional debug info

        if (settings.use_adaptive_preview_timing) {
          const timing = await computeAdaptiveTimeSeconds({
            userId: req.user.userId,
            flashcardId: card.flashcard_id,
            textForTiming: `${card.question} ${card.answer}`, // Use full text for timing in preview
            readingSpeedModifier: settings.reading_speed_modifier,
          });

          displayTimeToSend = timing.seconds;
          timingDebug = timing.debug;
        }

        const answerTimeLimit = Number(session.answer_time_limit || 120);

        return res.json({
          difficulty_mode: "HARD", // Mode
          phase: "PREVIEW", // Phase
          display_time_per_card: displayTimeToSend, // display card tome
          answer_time_limit: answerTimeLimit,       // answer card time
          adaptive_preview_time: !!settings.use_adaptive_preview_timing,
          adaptive_answer_time: !!settings.use_adaptive_answer_timing,
          timing_debug: timingDebug,
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
        let displayTimeToSend = Number(session.display_time_per_card || 10);
        let timingDebug = null;

        // BASE answer limit from session
        let answerTimeLimitToSend = Number(session.answer_time_limit || 120);
        let answerTimingDebug = null;

        if (settings.use_adaptive_answer_timing) {
          // Reading time (for showing the question)
          const timing = await computeAdaptiveTimeSeconds({
            userId: req.user.userId,
            flashcardId: card.flashcard_id,
            textForTiming: card.question,
            readingSpeedModifier: settings.reading_speed_modifier,
          });
          displayTimeToSend = timing.seconds;
          timingDebug = timing.debug;

          // Answer time (user must type answer)
          const at = await computeAdaptiveAnswerLimitSeconds({
            userId: req.user.userId,
            flashcardId: card.flashcard_id,
            questionText: card.question,
            answerText: card.answer,
            blankedText: null,
            baseAnswerLimitSeconds: answerTimeLimitToSend,
            readingSpeedModifier: settings.reading_speed_modifier,
          });
          answerTimeLimitToSend = at.seconds;
          answerTimingDebug = at.debug;
        }

        return res.json({
          difficulty_mode: "HARD",
          phase: "TEST",
          display_time_per_card: displayTimeToSend,
          answer_time_limit: answerTimeLimitToSend,
          adaptive_preview_time: !!settings.use_adaptive_preview_timing,
          adaptive_answer_time: !!settings.use_adaptive_answer_timing,
          timing_debug: timingDebug,
          answer_timing_debug: answerTimingDebug,
          progress: { remaining: remaining.length, total: cards.length },
          flashcard_id: card.flashcard_id,
          question: card.question,
          prompt_type: "NORMAL_HIDDEN",
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

      let displayTimeToSend = Number(session.display_time_per_card || 10);
      let timingDebug = null;

      // BASE answer limit from session
      let answerTimeLimitToSend = Number(session.answer_time_limit || 120);
      let answerTimingDebug = null;

      const blankedText = axRes.data.blanked_text || null;

      if (settings.use_adaptive_answer_timing) {
        // Reading time (blanked text is what user reads in TEST)
        const timing = await computeAdaptiveTimeSeconds({
          userId: req.user.userId,
          flashcardId: card.flashcard_id,
          textForTiming: blankedText || card.answer,
          readingSpeedModifier: settings.reading_speed_modifier,
        });
        displayTimeToSend = timing.seconds;
        timingDebug = timing.debug;

        // Answer time (depends on question + blanked text + blanks count + difficulty)
        const at = await computeAdaptiveAnswerLimitSeconds({
          userId: req.user.userId,
          flashcardId: card.flashcard_id,
          questionText: card.question,
          answerText: card.answer,
          blankedText,
          baseAnswerLimitSeconds: answerTimeLimitToSend,
          readingSpeedModifier: settings.reading_speed_modifier,
        });
        answerTimeLimitToSend = at.seconds;
        answerTimingDebug = at.debug;
      }

      return res.json({
        difficulty_mode: "HARD",
        phase: "TEST",
        display_time_per_card: displayTimeToSend,
        answer_time_limit: answerTimeLimitToSend,
        adaptive_preview_time: !!settings.use_adaptive_preview_timing,
        adaptive_answer_time: !!settings.use_adaptive_answer_timing,
        timing_debug: timingDebug,
        answer_timing_debug: answerTimingDebug,
        progress: { remaining: remaining.length, total: cards.length },
        flashcard_id: card.flashcard_id,
        question: card.question,
        prompt_type: promptType,
        blanked_text: axRes.data.blanked_text,
        first_letter_clues: axRes.data.first_letter_clues,
      });
    }


    //EASY / MODERATE


    // Build stable order from DB
    const orderedIds = safeJsonParse(session.card_order_json || "[]", []);
    if (orderedIds.length === 0) {
      return res.status(500).json({ message: "Missing card_order_json for session" });
    }

// Map for quick lookup
const cardById = new Map(cards.map(c => [Number(c.flashcard_id), c]));

// Helper: complete when truly finished (based on phase indices)
async function completeIfNeeded() {
  // If already completed, avoid re-completing
  if (session.completed_at) {
    return res.json({
      done: true,
      difficulty_mode: session.difficulty_mode,
      message: "Session already completed.",
      final_score: session.final_score,
    });
  }

  const completion = await completeSessionForUser(sessionId, req.user.userId);
  const summary = await buildCompactSummary(
    completion,
    session.difficulty_mode,
    cards.length,
    session.set_id
  );

  return res.json({
    done: true,
    difficulty_mode: session.difficulty_mode,
    message: "Session finished. Auto-completed.",
    summary,
    completion,
  });
}

// ---------- EASY (2-phase: PREVIEW -> TEST) ----------
if (String(session.difficulty_mode) === "EASY") {
  const idx = Number(session.easy_index || 0);
  if (idx >= orderedIds.length) return completeIfNeeded();

  const phase = String(session.easy_phase || "PREVIEW"); // default PREVIEW
  const cardId = orderedIds[idx];
  const card = cardById.get(Number(cardId));
  if (!card) return res.status(500).json({ message: "Invalid card in card_order_json" });

  // -------- PREVIEW: show full answer, then flip to TEST --------
  if (phase === "PREVIEW") {
    let revealSeconds = 15;
    let timingDebug = null;

    if (settings.use_adaptive_preview_timing) {
      const timing = await computeAdaptiveTimeSeconds({
        userId: req.user.userId,
        flashcardId: card.flashcard_id,
        textForTiming: `${card.question} ${card.answer}`,
        readingSpeedModifier: settings.reading_speed_modifier,
      });
      revealSeconds = timing.seconds;
      timingDebug = timing.debug;
    }

    await query(
      `UPDATE practice_session
       SET easy_phase = 'TEST'
       WHERE session_id = ?`,
      [sessionId]
    );

    return res.json({
      difficulty_mode: "EASY",
      phase: "PREVIEW",
      reveal_seconds: revealSeconds,
      timing_debug: timingDebug,
      progress: { current: idx + 1, total: orderedIds.length },
      flashcard_id: card.flashcard_id,
      question: card.question,
      answer: card.answer, // full answer in preview
    });
  }

  // -------- TEST: question only, optionally blanks --------
  if (phase === "TEST") {
    // NORMAL
    if (promptType === "NORMAL_HIDDEN") {
      let answerTimeLimitToSend = Number(session.answer_time_limit || 120);
      let answerTimingDebug = null;

    if (settings.use_adaptive_answer_timing) {
        const at = await computeAdaptiveAnswerLimitSeconds({
          userId: req.user.userId,
          flashcardId: card.flashcard_id,
          questionText: card.question,
          answerText: card.answer,
          blankedText: null,
          baseAnswerLimitSeconds: answerTimeLimitToSend,
          readingSpeedModifier: settings.reading_speed_modifier,
        });
        answerTimeLimitToSend = at.seconds;
        answerTimingDebug = at.debug;
      }
      return res.json({
        difficulty_mode: "EASY",
        phase: "TEST",
        progress: { current: idx + 1, total: orderedIds.length },
        flashcard_id: card.flashcard_id,
        question: card.question,
        answer_time_limit: answerTimeLimitToSend,
        answer_timing_debug: answerTimingDebug,
        prompt_type: "NORMAL_HIDDEN",
      });
    }

    // BLANKS (generate from answer, like MODERATE TEST / HARD TEST)
    const payload = { text: card.answer, variation_type: promptType };

    if (
      promptType === "RANDOM_BLANKS" ||
      promptType === "RANDOM_FULL_BLANKS" ||
      promptType === "INCREASING_DIFFICULTY"
    ) {
      if (settings.blank_ratio !== null && settings.blank_ratio !== undefined) {
        payload.blank_ratio = Number(settings.blank_ratio);
      }
      payload.seed = seed + idx; // stable per card
    }

    if (promptType === "INCREASING_DIFFICULTY") {
      const attemptRows = await query(
        "SELECT COUNT(*) AS c FROM performance_result WHERE session_id = ? AND flashcard_id = ?",
        [sessionId, card.flashcard_id]
      );
      payload.attempt_number = Number(attemptRows[0]?.c || 0) + 1;
    }

    if (promptType === "DIFFICULTY_LEVEL_BLANKS") {
      const stats = await query(
        "SELECT COALESCE(difficulty_rating, 0) AS difficulty_rating FROM user_flashcard_stats WHERE user_id = ? AND flashcard_id = ?",
        [req.user.userId, card.flashcard_id]
      );

      const rating = Math.max(0, Math.min(100, Number(stats[0]?.difficulty_rating ?? 0)));

      let difficulty_level = 1;
      if (rating > 75) difficulty_level = 4;
      else if (rating > 50) difficulty_level = 3;
      else if (rating > 25) difficulty_level = 2;

      payload.difficulty_level = difficulty_level;
    }

    const axRes = await axios.post(`${nlpUrl}/generate`, payload);

    const blankedText = axRes.data.blanked_text || null;

    let answerTimeLimitToSend = Number(session.answer_time_limit || 120);
    let answerTimingDebug = null;

    if (settings.use_adaptive_answer_timing) {
      const at = await computeAdaptiveAnswerLimitSeconds({
        userId: req.user.userId,
        flashcardId: card.flashcard_id,
        questionText: card.question,
        answerText: card.answer,
        blankedText,
        baseAnswerLimitSeconds: answerTimeLimitToSend,
        readingSpeedModifier: settings.reading_speed_modifier,
      });
      answerTimeLimitToSend = at.seconds;
      answerTimingDebug = at.debug;
    }

    return res.json({
      difficulty_mode: "EASY",
      phase: "TEST",
      progress: { current: idx + 1, total: orderedIds.length },
      flashcard_id: card.flashcard_id,
      question: card.question,
      answer_time_limit: answerTimeLimitToSend,
      answer_timing_debug: answerTimingDebug,
      prompt_type: promptType,
      blanked_text: axRes.data.blanked_text,
      first_letter_clues: axRes.data.first_letter_clues,
    });
  }

  // If phase somehow invalid
  return res.status(500).json({ message: "Invalid easy_phase state" });
}




// ---------- MODERATE ----------
if (String(session.difficulty_mode) === "MODERATE") {
  const gs = Math.max(1, Number(settings.group_size) || 5);
  const groupIndex = Number(session.moderate_group_index || 0);
  const groupStart = groupIndex * gs;
  const groupEnd = Math.min(groupStart + gs, orderedIds.length);

  if (groupStart >= orderedIds.length) return completeIfNeeded();

  const phase = String(session.moderate_phase || "PREVIEW");

  // PREVIEW: show Q+A for each card in group, then switch to TEST
  if (phase === "PREVIEW") {
    const previewIndex = Number(session.moderate_preview_index || 0);
    const absoluteIndex = groupStart + previewIndex;

    // Finished preview -> switch to TEST
    if (absoluteIndex >= groupEnd) {
      await query(
        `UPDATE practice_session
         SET moderate_phase = 'TEST',
             moderate_test_index = 0
         WHERE session_id = ?`,
        [sessionId]
      );

      return res.json({
        difficulty_mode: "MODERATE",
        phase: "TEST",
        message: "Group preview finished. Start answering this group.",
        call_next_again: true,
      });
    }

    const cardId = orderedIds[absoluteIndex];
    const card = cardById.get(Number(cardId));
    if (!card) return res.status(500).json({ message: "Invalid card in card_order_json" });

    // Advance preview cursor
    await query(
      `UPDATE practice_session
       SET moderate_preview_index = moderate_preview_index + 1
       WHERE session_id = ?`,
      [sessionId]
    );

    // Decide answer reveal seconds (calibration affects answer reveal)
    let revealSeconds = 15;
    let timingDebug = null;

    if (settings.use_adaptive_preview_timing) {
      const timing = await computeAdaptiveTimeSeconds({
        userId: req.user.userId,
        flashcardId: card.flashcard_id,
        textForTiming: `${card.question} ${card.answer}`,
        readingSpeedModifier: settings.reading_speed_modifier,
      });
      revealSeconds = timing.seconds;
      timingDebug = timing.debug;
    }

    return res.json({
      difficulty_mode: "MODERATE",
      phase: "PREVIEW",
      reveal_seconds: revealSeconds,
      timing_debug: timingDebug,
      group: { index: groupIndex + 1, size: gs },
      progress: { in_group: previewIndex + 1, group_total: groupEnd - groupStart },
      flashcard_id: card.flashcard_id,
      question: card.question,
      answer: card.answer,
    });
  }

  // TEST: show question only; must answer all in group before next group
  const testIndex = Number(session.moderate_test_index || 0);
  const absoluteIndex = groupStart + testIndex;

  // Finished test -> next group preview
  if (absoluteIndex >= groupEnd) {
    await query(
      `UPDATE practice_session
       SET moderate_group_index = moderate_group_index + 1,
           moderate_phase = 'PREVIEW',
           moderate_preview_index = 0,
           moderate_test_index = 0
       WHERE session_id = ?`,
      [sessionId]
    );

    return res.json({
      difficulty_mode: "MODERATE",
      phase: "PREVIEW",
      message: "Group completed. Moving to next group preview.",
      call_next_again: true,
    });
  }

  const cardId = orderedIds[absoluteIndex];
  const card = cardById.get(Number(cardId));
  if (!card) return res.status(500).json({ message: "Invalid card in card_order_json" });

  // NORMAL
  if (promptType === "NORMAL_HIDDEN") {
    let answerTimeLimitToSend = Number(session.answer_time_limit || 120);
    let answerTimingDebug = null;

    if (settings.use_adaptive_answer_timing) {
      const at = await computeAdaptiveAnswerLimitSeconds({
        userId: req.user.userId,
        flashcardId: card.flashcard_id,
        questionText: card.question,
        answerText: card.answer,
        blankedText: null,
        baseAnswerLimitSeconds: answerTimeLimitToSend,
        readingSpeedModifier: settings.reading_speed_modifier,
      });
      answerTimeLimitToSend = at.seconds;
      answerTimingDebug = at.debug;
    }

    return res.json({
      difficulty_mode: "MODERATE",
      phase: "TEST",
      group: { index: groupIndex + 1, size: gs },
      progress: { answered_in_group: testIndex + 1, group_total: groupEnd - groupStart },
      flashcard_id: card.flashcard_id,
      question: card.question,
      answer_time_limit: answerTimeLimitToSend,
      answer_timing_debug: answerTimingDebug,
      prompt_type: "NORMAL_HIDDEN",
    });
  }

  // BLANKS (generate from answer like HARD TEST)
  const payload = { text: card.answer, variation_type: promptType };

  if (
    promptType === "RANDOM_BLANKS" ||
    promptType === "RANDOM_FULL_BLANKS" ||
    promptType === "INCREASING_DIFFICULTY"
  ) {
    if (settings.blank_ratio !== null && settings.blank_ratio !== undefined) {
      payload.blank_ratio = Number(settings.blank_ratio);
    }
    payload.seed = seed + absoluteIndex;
  }

  if (promptType === "INCREASING_DIFFICULTY") {
    const attemptRows = await query(
      "SELECT COUNT(*) AS c FROM performance_result WHERE session_id = ? AND flashcard_id = ?",
      [sessionId, card.flashcard_id]
    );
    payload.attempt_number = Number(attemptRows[0]?.c || 0) + 1;
  }

  if (promptType === "DIFFICULTY_LEVEL_BLANKS") {
    const stats = await query(
      "SELECT COALESCE(difficulty_rating, 0) AS difficulty_rating FROM user_flashcard_stats WHERE user_id = ? AND flashcard_id = ?",
      [req.user.userId, card.flashcard_id]
    );

    const rating = Math.max(0, Math.min(100, Number(stats[0]?.difficulty_rating ?? 0)));

    let difficulty_level = 1;
    if (rating > 75) difficulty_level = 4;
    else if (rating > 50) difficulty_level = 3;
    else if (rating > 25) difficulty_level = 2;

    payload.difficulty_level = difficulty_level;
  }

  const axRes = await axios.post(`${nlpUrl}/generate`, payload);

  const blankedText = axRes.data.blanked_text || null;

  let answerTimeLimitToSend = Number(session.answer_time_limit || 120);
  let answerTimingDebug = null;

  if (settings.use_adaptive_answer_timing) {
    const at = await computeAdaptiveAnswerLimitSeconds({
      userId: req.user.userId,
      flashcardId: card.flashcard_id,
      questionText: card.question,
      answerText: card.answer,
      blankedText,
      baseAnswerLimitSeconds: answerTimeLimitToSend,
      readingSpeedModifier: settings.reading_speed_modifier,
    });
    answerTimeLimitToSend = at.seconds;
    answerTimingDebug = at.debug;
  }

  return res.json({
    difficulty_mode: "MODERATE",
    phase: "TEST",
    group: { index: groupIndex + 1, size: gs },
    progress: { answered_in_group: testIndex + 1, group_total: groupEnd - groupStart },
    flashcard_id: card.flashcard_id,
    question: card.question,
    answer_time_limit: answerTimeLimitToSend,
    answer_timing_debug: answerTimingDebug,
    prompt_type: promptType,
    blanked_text: axRes.data.blanked_text,
    first_letter_clues: axRes.data.first_letter_clues,
  });
}

// Fallback
return res.status(400).json({ message: "Unsupported difficulty_mode" });

} catch (err) {
    console.error("Next card error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// POST /api/practice/:sessionId/answer
// Save performance_result attempt (EASY/MODERATE/HARD TEST)
   
router.post("/:sessionId/answer", requireAuth, async (req, res) => {
  const sessionId = Number(req.params.sessionId); // Parse sessionId

  try {
    const session = await getSession(sessionId, req.user.userId); // Load session
    if (!session) return res.status(404).json({ message: "Session not found" }); // Not found/owned

    const settingsRows = await query(
      "SELECT * FROM practice_settings WHERE session_id = ?",
      [sessionId]
    );
    if (settingsRows.length === 0) {
      return res.status(500).json({ message: "Missing practice settings" });
    }
    const settings = settingsRows[0];


    // Block answering during phases that are not answer phases
    if (String(session.difficulty_mode) === "HARD" && String(session.hard_phase) === "PREVIEW") {
      return res.status(400).json({ message: "Cannot submit answers during HARD preview phase" });
    }

    if (String(session.difficulty_mode) === "EASY" && String(session.easy_phase || "PREVIEW") !== "TEST") {
      return res.status(400).json({ message: "Not in test phase yet" });
    }



    if (String(session.difficulty_mode) === "MODERATE" && String(session.moderate_phase || "PREVIEW") === "PREVIEW") {
      return res.status(400).json({ message: "Cannot submit answers during MODERATE preview phase" });
    }


    const { flashcard_id, user_answer, time_taken = null } = req.body || {}; // Read body


    if (!flashcard_id || user_answer === undefined) {
      return res.status(400).json({ message: "flashcard_id and user_answer are required" }); // Validate
    }

    // Enforce answering the current card (MODERATE)
    if (String(session.difficulty_mode) === "MODERATE") {
      // Only allow answering in TEST phase
      if (String(session.moderate_phase || "PREVIEW") !== "TEST") {
        return res.status(400).json({ message: "Cannot submit answers during MODERATE preview phase" });
      }

      const orderedIds = safeJsonParse(session.card_order_json || "[]", []);
      const gs = Math.max(1, Number(settings.group_size) || 5);

      const groupIndex = Number(session.moderate_group_index || 0);
      const testIndex = Number(session.moderate_test_index || 0);

      const groupStart = groupIndex * gs;
      const absoluteIndex = groupStart + testIndex;

      // Safety: if we're past the end, group/session is effectively done
      if (absoluteIndex >= orderedIds.length) {
        return res.status(400).json({ message: "No current card to answer (session/group finished)." });
      }

      const expectedId = Number(orderedIds[absoluteIndex]);

      if (Number(flashcard_id) !== expectedId) {
        return res.status(400).json({
          message: "You must answer the current card.",
          expected_flashcard_id: expectedId,
          phase: "TEST",
          difficulty_mode: "MODERATE",
          group: { index: groupIndex + 1, size: gs },
          progress: { answered_in_group: testIndex, group_total: Math.min(gs, orderedIds.length - groupStart) }
        });
      }
    }

    function normalizeForFullSentence(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    // normalize common unicode punctuation
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    // remove punctuation (keep letters/numbers/space)
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}


    // Enforce answering the current card (EASY)
    if (String(session.difficulty_mode) === "EASY") {
      const orderedIds = safeJsonParse(session.card_order_json || "[]", []);
      const idx = Number(session.easy_index || 0);

      if (idx >= orderedIds.length) {
        return res.status(400).json({ message: "Session already finished (no current card)." });
      }
      
      const expectedId = Number(orderedIds[idx]);

      if (Number(flashcard_id) !== expectedId) {
        return res.status(400).json({
          message: "You must answer the current card.",
          expected_flashcard_id: expectedId,
        });
      }
    }


    const cardRows = await query(
      "SELECT answer FROM flashcard WHERE flashcard_id = ? AND set_id = ?", // Get correct answer
      [flashcard_id, session.set_id] // Params
    );


    if (cardRows.length === 0) return res.status(404).json({ message: "Flashcard not found in this set" }); // Validate card


    const correctAnswer = cardRows[0].answer; // Correct answer
    const is_correct =
      normalizeForFullSentence(user_answer) === normalizeForFullSentence(correctAnswer) ? 1 : 0;


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

    // Advance phase/index for EASY and MODERATE after an answer is submitted
    if (String(session.difficulty_mode) === "EASY") {
      await query(
        `UPDATE practice_session
         SET easy_index = easy_index + 1,
            easy_phase = 'PREVIEW'
        WHERE session_id = ?`,
        [sessionId]
      );
    }

    if (String(session.difficulty_mode) === "MODERATE") {
      await query(
        `UPDATE practice_session
        SET moderate_test_index = moderate_test_index + 1
        WHERE session_id = ?`,
        [sessionId]
      );
    }



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
