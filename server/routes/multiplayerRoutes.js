const express = require("express"); // Express framework for defining API routes
const axios = require("axios"); // Used to call the Flask NLP microservice for blanked prompts
const db = require("../db"); // Shared MySQL database connection
const { requireAuth } = require("../middleware/auth"); // Middleware that ensures the user is logged in

const router = express.Router(); // Router instance exported at the end of the file

// In-memory map of active timers, keyed by join code.
// This lets the server control timed phase changes for each room independently.
const roomTimers = new Map();

// Number of seconds the shared RESULT phase is shown before moving on.
const RESULT_SECONDS = 3;

// Small Promise wrapper around db.query so the route file can use async/await
// instead of nested callback functions for SQL queries.
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// Safely parse JSON values stored in database columns such as card_order_json
// and hard_queue. If parsing fails, return a fallback value instead of crashing.
function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}


// Answer checking (matches solo Mode logic)

// Normalises text before comparing answers.
// This makes answer checking more forgiving by:
// - converting to lowercase
// - trimming spaces
// - standardising quotes/dashes
// - removing punctuation
// - collapsing repeated spaces
function normalizeForFullSentence(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

// Standard Levenshtein distance algorithm.
// Measures how many single-character edits are needed to transform one string
// into another. Used later for typo-tolerant answer matching.
function levenshteinDistance(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");

  const m = s.length;
  const n = t.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

// Converts the Levenshtein distance into a similarity ratio from 0 to 1,
// where 1 means identical strings.
function similarityRatio(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");
  const maxLen = Math.max(s.length, t.length);

  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(s, t);
  return 1 - distance / maxLen;
}

// Sorts words alphabetically after normalisation.
// This helps accept answers where the same words are used but in a different order.
function tokenSortNormalize(s) {
  return normalizeForFullSentence(s)
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

// Hybrid answer checker used for multiplayer marking.
// It accepts:
// - exact normalised matches
// - token-sorted matches
// - small typo differences for one-word answers
// - similarity-based matches for longer phrases/sentences
//
// This mirrors the same forgiving behaviour as the solo practice mode
// so answer marking stays consistent across both systems.
function isAnswerCorrectHybrid(userAnswer, correctAnswer) {
  const normalizedUser = normalizeForFullSentence(userAnswer);
  const normalizedCorrect = normalizeForFullSentence(correctAnswer);

  if (!normalizedUser || !normalizedCorrect) {
    return false;
  }

  if (normalizedUser === normalizedCorrect) {
    return true;
  }

  if (tokenSortNormalize(normalizedUser) === tokenSortNormalize(normalizedCorrect)) {
    return true;
  }

  const correctWords = normalizedCorrect.split(" ").filter(Boolean);
  const userWords = normalizedUser.split(" ").filter(Boolean);

  // For single-word answers, use stricter typo logic based on word length.
  if (correctWords.length === 1 && userWords.length === 1) {
    const distance = levenshteinDistance(normalizedUser, normalizedCorrect);
    const maxLen = Math.max(normalizedUser.length, normalizedCorrect.length);

    if (maxLen <= 4) return distance === 0;
    if (maxLen <= 7) return distance <= 1;
    return distance <= 2;
  }

  // For short phrases, use a higher similarity threshold.
  const ratio = similarityRatio(normalizedUser, normalizedCorrect);

  if (correctWords.length <= 3) {
    return ratio >= 0.9;
  }

  // For longer answers, allow a slightly lower threshold.
  return ratio >= 0.85;
}

// Generates a readable room join code using letters/numbers that avoid
// ambiguous characters like 0/O and 1/I.
function randomJoinCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// Tries up to 20 times to generate a unique join code that does not already
// exist in the multiplayer_room table.
async function generateUniqueJoinCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = randomJoinCode(6);
    const rows = await query(
      "SELECT room_id FROM multiplayer_room WHERE join_code = ? LIMIT 1",
      [code]
    );
    if (rows.length === 0) return code;
  }
  throw new Error("Failed to generate unique join code");
}

// Clears and removes any existing timer for a room.
// This prevents overlapping timers when a room phase changes early.
function clearRoomTimer(joinCode) {
  const key = String(joinCode).toUpperCase();
  const existing = roomTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    roomTimers.delete(key);
  }
}

// Sets a timer for a room phase.
// Only one timer is allowed per room, so any previous one is cleared first.
// When the timer finishes, the provided async callback runs.
function setRoomTimer(joinCode, fn, ms) {
  clearRoomTimer(joinCode);
  const key = String(joinCode).toUpperCase();
  const timer = setTimeout(async () => {
    roomTimers.delete(key);
    try {
      await fn();
    } catch (err) {
      console.error(`Timer failed for room ${key}:`, err);
    }
  }, ms);
  roomTimers.set(key, timer);
}

// Computes the number of whole seconds remaining until a given date/time.
// Used so the frontend can show countdown timers.
function secondsUntil(dateValue) {
  if (!dateValue) return null;
  const endsAt = new Date(dateValue).getTime();
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

// Simple deterministic pseudo-random generator based on a numeric seed.
// This is used so shuffled card order can be consistent across all players.
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Deterministic shuffle function.
// Given the same array and seed, it always returns the same shuffled order.
// This ensures every player sees the same room-wide card sequence.
function seededShuffle(arr, seed) {
  const copy = [...arr];
  let s = Number(seed) || 1;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    s += 1;
    const j = Math.floor(seededRandom(s) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Normalises incoming prompt type values from the frontend.
// Also maps older/special aliases into the internal prompt types used
// throughout multiplayer.
function normalizePromptType(promptType) {
  const raw = String(promptType || "NORMAL_HIDDEN").trim().toUpperCase();

  if (raw === "ALL_BLANK_FIRST_LETTERS") return "ALL_BLANKS";
  if (raw === "ALL_FULL_BLANKS") return "ALL_BLANKS";
  if (raw === "RANDOM_FULL_BLANKS") return "RANDOM_BLANKS";

  const allowed = new Set([
    "NORMAL_HIDDEN",
    "ALL_BLANKS",
    "RANDOM_BLANKS",
    "KEY_TERMS_ONLY",
    "EVERY_OTHER_WORD",
    "INCREASING_DIFFICULTY",
    "DIFFICULTY_LEVEL_BLANKS",
  ]);

  return allowed.has(raw) ? raw : "NORMAL_HIDDEN";
}

// Normalises blank style separately from prompt type.
// If the frontend does not explicitly send FULL/FIRST_LETTER,
// this function derives the correct style from the chosen prompt type.
function normalizeBlankStyle(blankStyle, promptType) {
  const rawStyle = String(blankStyle || "").trim().toUpperCase();
  const rawPromptType = String(promptType || "").trim().toUpperCase();

  if (rawStyle === "FIRST_LETTER" || rawStyle === "FULL") {
    return rawStyle;
  }

  if (rawPromptType === "ALL_FULL_BLANKS" || rawPromptType === "RANDOM_FULL_BLANKS") {
    return "FULL";
  }

  return "FIRST_LETTER";
}

// Converts internal multiplayer prompt types into the variation_type value
// expected by the Flask NLP service.
function mapPromptTypeToVariationType(promptType) {
  const pt = normalizePromptType(promptType);

  if (pt === "ALL_BLANKS") return "ALL_BLANKS";
  return pt;
}

// Builds the request payload sent to the Flask NLP service.
// This centralises how answer text, prompt type, blank style, blank ratio,
// and seed are packaged together.
function buildBlankPayload({
  answerText,
  promptType,
  blankStyle,
  blankRatio,
  seed,
}) {
  return {
    text: answerText,
    variation_type: mapPromptTypeToVariationType(promptType),
    blank_style: normalizeBlankStyle(blankStyle, promptType),
    ...(blankRatio !== null && blankRatio !== undefined
      ? { blank_ratio: Number(blankRatio) }
      : {}),
    ...(seed !== null && seed !== undefined ? { seed: Number(seed) } : {}),
  };
}

// Converts a flashcard's stored difficulty rating into difficulty levels 1-4.
// This is used for the DIFFICULTY_LEVEL_BLANKS NLP mode.
async function getDifficultyLevelForCard(flashcardId) {
  const rows = await query(
    `SELECT COALESCE(difficulty_rating, 0) AS difficulty_rating
     FROM flashcard
     WHERE flashcard_id = ?`,
    [flashcardId]
  );

  const rating = Math.max(
    0,
    Math.min(100, Number(rows[0]?.difficulty_rating ?? 0))
  );

  let difficulty_level = 1;
  if (rating > 75) difficulty_level = 4;
  else if (rating > 50) difficulty_level = 3;
  else if (rating > 25) difficulty_level = 2;

  return difficulty_level;
}

// Generates the test prompt for a single card in a multiplayer room.
// If prompt_type is NORMAL_HIDDEN, no NLP call is needed.
// Otherwise this function calls the Flask NLP service to generate blanked text
// and optional first-letter clues for the answer.
async function generatePromptForCard({
  room,
  card,
  stableIndex = 0,
  roomId,
}) {
  const promptType = normalizePromptType(room.prompt_type);
  const blankStyle = normalizeBlankStyle(room.blank_style, promptType);

  // Normal hidden mode just means hide the full answer and ask for recall.
  if (promptType === "NORMAL_HIDDEN") {
    return {
      prompt_type: "NORMAL_HIDDEN",
      blank_style: blankStyle,
      blanked_text: null,
      first_letter_clues: null,
    };
  }

  const nlpUrl = (process.env.NLP_URL || "http://127.0.0.1:6000").trim();
  const seedBase = Number(room.seed || roomId || 1);

  const payload = buildBlankPayload({
    answerText: card.answer,
    promptType,
    blankStyle,
    blankRatio: room.blank_ratio,
    seed: seedBase + stableIndex,
  });

  // Random-based modes need consistent per-card seeding and optional blank ratio.
  if (
    promptType === "RANDOM_BLANKS" ||
    promptType === "INCREASING_DIFFICULTY"
  ) {
    if (room.blank_ratio !== null && room.blank_ratio !== undefined) {
      payload.blank_ratio = Number(room.blank_ratio);
    }
    payload.seed = seedBase + stableIndex;
  }

  // Multiplayer currently always uses attempt 1 for increasing difficulty mode.
  if (promptType === "INCREASING_DIFFICULTY") {
    payload.attempt_number = 1;
  }

  // Difficulty-level blanks are based on the flashcard's difficulty bucket.
  if (promptType === "DIFFICULTY_LEVEL_BLANKS") {
    payload.difficulty_level = await getDifficultyLevelForCard(card.flashcard_id);
  }

  const axRes = await axios.post(`${nlpUrl}/generate`, payload, {
    timeout: 8000,
  });

  return {
    prompt_type: promptType,
    blank_style: blankStyle,
    blanked_text: axRes.data?.blanked_text || null,
    first_letter_clues: axRes.data?.first_letter_clues || null,
  };
}

// Checks that a given flashcard set belongs to the authenticated user.
// Used when creating a room or replay room to prevent access to other users' sets.
async function ensureSetOwnership(setId, userId) {
  const rows = await query(
    "SELECT set_id, title FROM flashcard_set WHERE set_id = ? AND user_id = ?",
    [setId, userId]
  );
  return rows[0] || null;
}

// Loads a single room by join code, including room settings, progression state,
// timestamps, and the title of the linked flashcard set.
async function getRoomByCode(joinCode) {
  const rows = await query(
    `SELECT
      mr.room_id,
      mr.host_user_id,
      mr.set_id,
      mr.join_code,
      mr.title,
      mr.difficulty_mode,
      mr.prompt_type,
      mr.display_time_per_card,
      mr.answer_time_limit,
      mr.group_size,
      mr.randomize_order,
      mr.blank_style,
      mr.blank_ratio,
      mr.seed,
      mr.card_order_json,
      mr.easy_phase,
      mr.easy_index,
      mr.moderate_phase,
      mr.moderate_group_index,
      mr.moderate_preview_index,
      mr.moderate_test_index,
      mr.hard_phase,
      mr.hard_preview_index,
      mr.hard_queue,
      mr.current_card_index,
      mr.status,
      mr.phase,
      mr.phase_ends_at,
      mr.created_at,
      mr.started_at,
      mr.finished_at,
      fs.title AS set_title
     FROM multiplayer_room mr
     JOIN flashcard_set fs ON fs.set_id = mr.set_id
     WHERE mr.join_code = ?
     LIMIT 1`,
    [joinCode]
  );
  return rows[0] || null;
}

// Returns every participant in a room, including the host/controller.
// Ordering places host first, then highest scores, then join order.
async function getParticipants(roomId) {
  return query(
    `SELECT
      participant_id,
      room_id,
      user_id,
      display_name,
      score,
      joined_at,
      last_seen_at,
      is_host,
      is_playing,
      is_connected
     FROM multiplayer_participant
     WHERE room_id = ?
     ORDER BY is_host DESC, score DESC, joined_at ASC`,
    [roomId]
  );
}

// Returns only participants who are active players in the room.
// The host is usually excluded because the host acts as controller rather than player.
async function getPlayingParticipants(roomId) {
  return query(
    `SELECT
      participant_id,
      room_id,
      user_id,
      display_name,
      score,
      joined_at,
      last_seen_at,
      is_host,
      is_playing,
      is_connected
     FROM multiplayer_participant
     WHERE room_id = ? AND is_playing = 1
     ORDER BY score DESC, joined_at ASC`,
    [roomId]
  );
}

// Loads all flashcards used by a room by following the room's set_id.
async function getCardsForRoom(roomId) {
  return query(
    `SELECT flashcard_id, question, answer
     FROM flashcard
     WHERE set_id = (SELECT set_id FROM multiplayer_room WHERE room_id = ?)
     ORDER BY flashcard_id ASC`,
    [roomId]
  );
}

// Returns the participant IDs of players who have already submitted an answer
// for the current flashcard.
async function getAnsweredParticipantIds(roomId, flashcardId) {
  if (!flashcardId) return [];
  const rows = await query(
    `SELECT ma.participant_id
     FROM multiplayer_answer ma
     JOIN multiplayer_participant mp
       ON mp.participant_id = ma.participant_id
     WHERE ma.room_id = ? AND ma.flashcard_id = ? AND mp.is_playing = 1`,
    [roomId, flashcardId]
  );
  return rows.map((r) => Number(r.participant_id));
}

// Returns one participant's submitted answer and whether it was correct
// for a specific flashcard. Used mainly during RESULT phase for viewer feedback.
async function getParticipantAnswerResult(roomId, participantId, flashcardId) {
  const rows = await query(
    `SELECT user_answer, is_correct
     FROM multiplayer_answer
     WHERE room_id = ? AND participant_id = ? AND flashcard_id = ?
     LIMIT 1`,
    [roomId, participantId, flashcardId]
  );

  return rows[0]
    ? {
        user_answer: rows[0].user_answer,
        is_correct: !!rows[0].is_correct,
      }
    : null;
}

// Checks whether all active players in the room have answered the current card.
// If true, the server can end the TEST phase early and move to RESULT.
async function allPlayersAnswered(roomId, flashcardId) {
  const players = await getPlayingParticipants(roomId);
  if (players.length === 0) return false;
  const answeredIds = await getAnsweredParticipantIds(roomId, flashcardId);
  return answeredIds.length >= players.length;
}

// Updates a participant's connection state, and refreshes their last_seen_at time.
// Used when reconnecting/disconnecting.
async function markParticipantConnected(roomId, userId, isConnected) {
  await query(
    `UPDATE multiplayer_participant
     SET is_connected = ?, last_seen_at = NOW()
     WHERE room_id = ? AND user_id = ?`,
    [isConnected ? 1 : 0, roomId, userId]
  );
}

// Prepares a room's engine state before the game starts.
// It creates a shared card order (optionally shuffled) and resets all
// mode-specific indices/phases so the room starts cleanly.
async function initializeRoomEngine(room, cards) {
  if (!room || !cards.length) return;

  let ordered = cards.map((c) => Number(c.flashcard_id));
  const seed = Number(room.seed || room.room_id || 1);

  if (Number(room.randomize_order) === 1) {
    ordered = seededShuffle(ordered, seed);
  }

  await query(
    `UPDATE multiplayer_room
     SET card_order_json = ?,
         easy_phase = 'PREVIEW',
         easy_index = 0,
         moderate_phase = 'PREVIEW',
         moderate_group_index = 0,
         moderate_preview_index = 0,
         moderate_test_index = 0,
         hard_phase = 'PREVIEW',
         hard_preview_index = 0,
         hard_queue = NULL
     WHERE room_id = ?`,
    [JSON.stringify(ordered), room.room_id]
  );
}

// Core room engine: based on current room state and cards, this function decides
// what the NEXT multiplayer step should be.
//
// It does not update the database itself.
// Instead, it returns a step object describing the current phase/card to show,
// or returns special flags such as:
// - done: true
// - error: ...
// - call_next_again: true
//
// This keeps the game flow logic centralised in one place.
async function buildMultiplayerStep(room, cards) {
  const difficultyMode = String(room.difficulty_mode || "EASY").toUpperCase();
  const orderedIds = safeJsonParse(room.card_order_json, []).map(Number);
  const cardById = new Map(cards.map((c) => [Number(c.flashcard_id), c]));

  // EASY mode:
  // Each card has:
  // 1) PREVIEW phase showing question + answer
  // 2) TEST phase asking the same card from memory
  if (difficultyMode === "EASY") {
    const idx = Number(room.easy_index || 0);
    if (idx >= orderedIds.length) return { done: true };

    const card = cardById.get(orderedIds[idx]);
    if (!card) return { error: "Invalid card in card_order_json" };

    if (String(room.easy_phase || "PREVIEW") === "PREVIEW") {
      return {
        difficulty_mode: "EASY",
        phase: "PREVIEW",
        reveal_seconds: Number(room.display_time_per_card || 10),
        progress: { current: idx + 1, total: orderedIds.length },
        flashcard_id: card.flashcard_id,
        question: card.question,
        answer: card.answer,
      };
    }

    const prompt = await generatePromptForCard({
      room,
      card,
      stableIndex: idx,
      roomId: room.room_id,
    });

    return {
      difficulty_mode: "EASY",
      phase: "TEST",
      progress: { current: idx + 1, total: orderedIds.length },
      flashcard_id: card.flashcard_id,
      question: card.question,
      answer_time_limit: Number(room.answer_time_limit || 120),
      ...prompt,
    };
  }

  // MODERATE mode:
  // Cards are grouped.
  // For each group:
  // - all cards are previewed first
  // - then the same group is tested
  if (difficultyMode === "MODERATE") {
    const gs = Math.max(1, Number(room.group_size || 5));
    const groupIndex = Number(room.moderate_group_index || 0);
    const groupStart = groupIndex * gs;
    const groupEnd = Math.min(groupStart + gs, orderedIds.length);

    if (groupStart >= orderedIds.length) return { done: true };

    if (String(room.moderate_phase || "PREVIEW") === "PREVIEW") {
      const previewIndex = Number(room.moderate_preview_index || 0);
      const absoluteIndex = groupStart + previewIndex;

      // If preview of this group is finished, signal caller to advance and rebuild.
      if (absoluteIndex >= groupEnd) {
        return {
          difficulty_mode: "MODERATE",
          phase: "TEST",
          call_next_again: true,
        };
      }

      const card = cardById.get(orderedIds[absoluteIndex]);
      if (!card) return { error: "Invalid card in card_order_json" };

      return {
        difficulty_mode: "MODERATE",
        phase: "PREVIEW",
        reveal_seconds: Number(room.display_time_per_card || 10),
        group: { index: groupIndex + 1, size: gs },
        progress: { in_group: previewIndex + 1, group_total: groupEnd - groupStart },
        flashcard_id: card.flashcard_id,
        question: card.question,
        answer: card.answer,
      };
    }

    const testIndex = Number(room.moderate_test_index || 0);
    const absoluteIndex = groupStart + testIndex;

    // If test of this group is finished, signal caller to advance back into the
    // next group's preview phase.
    if (absoluteIndex >= groupEnd) {
      return {
        difficulty_mode: "MODERATE",
        phase: "PREVIEW",
        call_next_again: true,
      };
    }

    const card = cardById.get(orderedIds[absoluteIndex]);
    if (!card) return { error: "Invalid card in card_order_json" };

    const prompt = await generatePromptForCard({
      room,
      card,
      stableIndex: absoluteIndex,
      roomId: room.room_id,
    });

    return {
      difficulty_mode: "MODERATE",
      phase: "TEST",
      group: { index: groupIndex + 1, size: gs },
      progress: { answered_in_group: testIndex + 1, group_total: groupEnd - groupStart },
      flashcard_id: card.flashcard_id,
      question: card.question,
      answer_time_limit: Number(room.answer_time_limit || 120),
      ...prompt,
    };
  }

  // HARD mode:
  // First, preview all cards linearly.
  // Then enter a test queue where cards are answered from memory only.
  if (difficultyMode === "HARD") {
    if (String(room.hard_phase || "PREVIEW") === "PREVIEW") {
      const idx = Number(room.hard_preview_index || 0);

      // If preview is finished, signal caller to advance into test mode.
      if (idx >= cards.length) {
        return {
          difficulty_mode: "HARD",
          phase: "TEST",
          call_next_again: true,
        };
      }

      const card = cards[idx];
      return {
        difficulty_mode: "HARD",
        phase: "PREVIEW",
        display_time_per_card: Number(room.display_time_per_card || 10),
        answer_time_limit: Number(room.answer_time_limit || 120),
        progress: { index: idx + 1, total: cards.length },
        flashcard_id: card.flashcard_id,
        question: card.question,
        show_answer: true,
        answer: card.answer,
      };
    }

    const queue = safeJsonParse(room.hard_queue, []).map(Number);
    if (queue.length === 0) return { done: true };

    const card = cardById.get(queue[0]);
    if (!card) return { error: "Invalid card in hard_queue" };

    const prompt = await generatePromptForCard({
      room,
      card,
      stableIndex: cards.length - queue.length,
      roomId: room.room_id,
    });

    return {
      difficulty_mode: "HARD",
      phase: "TEST",
      progress: { remaining: queue.length, total: cards.length },
      flashcard_id: card.flashcard_id,
      question: card.question,
      display_time_per_card: Number(room.display_time_per_card || 10),
      answer_time_limit: Number(room.answer_time_limit || 120),
      ...prompt,
    };
  }

  return { error: "Unsupported difficulty mode" };
}

// Advances the room engine after a phase finishes.
// This function updates the database state so that the next call to
// buildMultiplayerStep() reflects the room's new position.
async function advanceRoomEngine(room, cards) {
  const difficultyMode = String(room.difficulty_mode || "EASY").toUpperCase();
  const orderedIds = safeJsonParse(room.card_order_json, []).map(Number);

  // EASY mode:
  // PREVIEW -> TEST for same card
  // TEST -> next card PREVIEW
  if (difficultyMode === "EASY") {
    if (String(room.easy_phase || "PREVIEW") === "PREVIEW") {
      await query(
        `UPDATE multiplayer_room
         SET easy_phase = 'TEST'
         WHERE room_id = ?`,
        [room.room_id]
      );
      return;
    }

    await query(
      `UPDATE multiplayer_room
       SET easy_index = easy_index + 1,
           easy_phase = 'PREVIEW'
       WHERE room_id = ?`,
      [room.room_id]
    );
    return;
  }

  // MODERATE mode:
  // Handles movement within preview/test indices and between groups.
  if (difficultyMode === "MODERATE") {
    const gs = Math.max(1, Number(room.group_size || 5));
    const groupIndex = Number(room.moderate_group_index || 0);
    const groupStart = groupIndex * gs;
    const groupEnd = Math.min(groupStart + gs, orderedIds.length);

    if (String(room.moderate_phase || "PREVIEW") === "PREVIEW") {
      const previewIndex = Number(room.moderate_preview_index || 0);
      const absoluteIndex = groupStart + previewIndex;

      if (absoluteIndex >= groupEnd) {
        await query(
          `UPDATE multiplayer_room
           SET moderate_phase = 'TEST',
               moderate_test_index = 0
           WHERE room_id = ?`,
          [room.room_id]
        );
      } else {
        await query(
          `UPDATE multiplayer_room
           SET moderate_preview_index = moderate_preview_index + 1
           WHERE room_id = ?`,
          [room.room_id]
        );
      }
      return;
    }

    const testIndex = Number(room.moderate_test_index || 0);
    const absoluteIndex = groupStart + testIndex;

    if (absoluteIndex >= groupEnd) {
      await query(
        `UPDATE multiplayer_room
         SET moderate_group_index = moderate_group_index + 1,
             moderate_phase = 'PREVIEW',
             moderate_preview_index = 0,
             moderate_test_index = 0
         WHERE room_id = ?`,
        [room.room_id]
      );
    } else {
      await query(
        `UPDATE multiplayer_room
         SET moderate_test_index = moderate_test_index + 1
         WHERE room_id = ?`,
        [room.room_id]
      );
    }
    return;
  }

  // HARD mode:
  // PREVIEW increments through cards.
  // Once preview is done, it creates the test queue.
  // During TEST, it removes the front card from the queue after completion.
  if (difficultyMode === "HARD") {
    if (String(room.hard_phase || "PREVIEW") === "PREVIEW") {
      const idx = Number(room.hard_preview_index || 0);

      if (idx >= cards.length) {
        const ids = cards.map((c) => Number(c.flashcard_id));
        const seed = Number(room.seed || room.room_id || 1);
        const queue =
          Number(room.randomize_order) === 1 ? seededShuffle(ids, seed) : ids;

        await query(
          `UPDATE multiplayer_room
           SET hard_phase = 'TEST',
               hard_queue = ?,
               hard_preview_index = ?
           WHERE room_id = ?`,
          [JSON.stringify(queue), cards.length, room.room_id]
        );
      } else {
        await query(
          `UPDATE multiplayer_room
           SET hard_preview_index = hard_preview_index + 1
           WHERE room_id = ?`,
          [room.room_id]
        );
      }
      return;
    }

    const queue = safeJsonParse(room.hard_queue, []).map(Number);
    queue.shift();

    await query(
      `UPDATE multiplayer_room
       SET hard_queue = ?
       WHERE room_id = ?`,
      [JSON.stringify(queue), room.room_id]
    );
  }
}

// Starts the shared RESULT phase for the current card.
// During this phase, all players can see the correct answer and their own result.
// After RESULT_SECONDS, the room automatically advances to the next step.
async function beginResultPhase(io, joinCode) {
  const room = await getRoomByCode(joinCode);
  if (!room) return;
  if (room.status === "FINISHED" || room.status === "CLOSED") return;
  if (room.phase === "RESULT") return;

  const phaseEndsAt = new Date(Date.now() + RESULT_SECONDS * 1000);

  await query(
    `UPDATE multiplayer_room
     SET phase = 'RESULT',
         phase_ends_at = ?
     WHERE room_id = ?`,
    [phaseEndsAt, room.room_id]
  );

  await emitRoomState(io, joinCode);

  setRoomTimer(
    joinCode,
    async () => {
      const latestRoom = await getRoomByCode(joinCode);
      if (!latestRoom) return;
      const latestCards = await getCardsForRoom(latestRoom.room_id);
      await advanceRoomEngine(latestRoom, latestCards);
      await stepRoom(io, joinCode);
    },
    RESULT_SECONDS * 1000
  );
}

// Main room progression controller.
// This function:
// 1) builds the current step
// 2) marks the room with the correct phase/timer
// 3) emits room state to clients
// 4) schedules the automatic transition when the timer ends
//
// It is the central loop that drives multiplayer gameplay.
async function stepRoom(io, joinCode) {
  const room = await getRoomByCode(joinCode);
  if (!room) return;
  if (room.status === "FINISHED" || room.status === "CLOSED") return;

  const cards = await getCardsForRoom(room.room_id);
  const step = await buildMultiplayerStep(room, cards);

  if (step?.error) {
    throw new Error(step.error);
  }

  // No more cards/steps means the room is finished.
  if (step?.done) {
    await finishRoom(io, joinCode, "FINISHED");
    return;
  }

  // Some transitions require the engine to advance internally first,
  // then rebuild the next visible step immediately.
  if (step.call_next_again) {
    await advanceRoomEngine(room, cards);
    await stepRoom(io, joinCode);
    return;
  }

  // Determine which timer to use for this phase:
  // preview time, display time, or answer time.
  const timerSeconds =
    step.reveal_seconds ??
    step.display_time_per_card ??
    step.answer_time_limit ??
    null;

  const phaseEndsAt =
    timerSeconds !== null ? new Date(Date.now() + Number(timerSeconds) * 1000) : null;

  // Persist the room phase and countdown target.
  await query(
    `UPDATE multiplayer_room
     SET status = 'LIVE',
         phase = ?,
         phase_ends_at = ?
     WHERE room_id = ?`,
    [step.phase, phaseEndsAt, room.room_id]
  );

  // Push updated room state to all connected clients.
  await emitRoomState(io, joinCode);

  // Schedule automatic transition when the phase timer ends.
  if (timerSeconds !== null) {
    setRoomTimer(
      joinCode,
      async () => {
        const latestRoom = await getRoomByCode(joinCode);
        if (!latestRoom) return;

        // TEST phase always moves into RESULT first.
        if (step.phase === "TEST") {
          await beginResultPhase(io, joinCode);
          return;
        }

        // PREVIEW phase moves straight to the next engine state.
        const latestCards = await getCardsForRoom(latestRoom.room_id);
        await advanceRoomEngine(latestRoom, latestCards);
        await stepRoom(io, joinCode);
      },
      Number(timerSeconds) * 1000
    );
  }
}

// Marks a room as finished or closed, clears timers, and emits final room state.
// FINISHED is used for completed/ended games.
// CLOSED is used when the host closes the lobby before the game starts.
async function finishRoom(io, joinCode, status = "FINISHED") {
  const room = await getRoomByCode(joinCode);
  if (!room) return;

  await query(
    `UPDATE multiplayer_room
     SET status = ?,
         phase = ?,
         finished_at = NOW(),
         phase_ends_at = NULL
     WHERE room_id = ?`,
    [status, status === "CLOSED" ? "CLOSED" : "FINISHED", room.room_id]
  );

  clearRoomTimer(joinCode);
  await emitRoomState(io, joinCode);
}

// Builds the full room state object returned to the frontend and also emitted
// through socket events.
//
// It includes:
// - room metadata
// - participant list
// - the current visible step
// - which players already answered
// - leaderboard data
// - viewer-specific info such as whether the viewer is host/playing/answered
//
// This is what keeps all clients in sync with the same room state.
async function buildRoomState(joinCode, viewerUserId = null) {
  const room = await getRoomByCode(joinCode);
  if (!room) return null;

  const participants = await getParticipants(room.room_id);
  const playingParticipants = participants.filter((p) => Number(p.is_playing) === 1);
  const cards = await getCardsForRoom(room.room_id);
  const viewer = participants.find(
    (p) => Number(p.user_id) === Number(viewerUserId)
  );

  // Only build the current visible step while the room is live or finished.
  const baseStep =
    room.status === "LIVE" || room.status === "FINISHED"
      ? await buildMultiplayerStep(room, cards)
      : null;

  let currentStep = baseStep && !baseStep.done ? { ...baseStep } : null;
  let answeredParticipants = [];
  let hasAnsweredCurrentCard = false;

  // During TEST or RESULT, collect which players have already submitted an answer.
  if (
    currentStep?.flashcard_id &&
    (room.phase === "TEST" || room.phase === "RESULT")
  ) {
    const answeredIds = await getAnsweredParticipantIds(
      room.room_id,
      currentStep.flashcard_id
    );

    answeredParticipants = playingParticipants
      .filter((p) => answeredIds.includes(Number(p.participant_id)))
      .map((p) => ({
        participant_id: p.participant_id,
        user_id: p.user_id,
        display_name: p.display_name,
        is_host: !!p.is_host,
        is_playing: !!p.is_playing,
      }));

    if (viewer && Number(viewer.is_playing) === 1) {
      hasAnsweredCurrentCard = answeredIds.includes(Number(viewer.participant_id));
    }
  }

  // In RESULT phase, enrich the step with:
  // - correct answer
  // - the current viewer's submitted answer + correctness
  if (currentStep && room.phase === "RESULT") {
    const currentCard = cards.find(
      (c) => Number(c.flashcard_id) === Number(currentStep.flashcard_id)
    );

    currentStep = {
      ...currentStep,
      phase: "RESULT",
      correct_answer: currentCard?.answer || null,
      viewer_result:
        viewer && Number(viewer.is_playing) === 1
          ? await getParticipantAnswerResult(
              room.room_id,
              viewer.participant_id,
              currentStep.flashcard_id
            )
          : null,
    };
  }

  // Leaderboard is based only on active playing participants.
  const leaderboard = playingParticipants.map((p) => ({
    participant_id: p.participant_id,
    user_id: p.user_id,
    display_name: p.display_name,
    score: p.score,
    is_host: !!p.is_host,
    is_playing: !!p.is_playing,
    is_connected: !!p.is_connected,
  }));

  return {
    room: {
      ...room,
      seconds_remaining: secondsUntil(room.phase_ends_at),
      answered_count: answeredParticipants.length,
      total_participants: playingParticipants.length,
      has_answered_current_card: hasAnsweredCurrentCard,
      viewer_user_id:
        viewerUserId !== null && viewerUserId !== undefined
          ? Number(viewerUserId)
          : null,
      is_viewer_host:
        viewerUserId !== null && viewerUserId !== undefined
          ? Number(room.host_user_id) === Number(viewerUserId)
          : false,
      is_viewer_playing: viewer ? Number(viewer.is_playing) === 1 : false,
      connection_status: "connected",
    },
    participants,
    current_step: currentStep,
    answered_participants: answeredParticipants,
    leaderboard,
    finished_leaderboard: room.status === "FINISHED" ? leaderboard : null,
  };
}

// Emits room state over Socket.IO.
// It sends:
// - one shared generic state to the whole room
// - one personalised state to each participant's private user channel
//
// The personal state is important because some room fields depend on the viewer,
// for example whether they have answered or what their RESULT feedback was.
async function emitRoomState(io, joinCode) {
  const code = String(joinCode).toUpperCase();
  const room = await getRoomByCode(code);
  if (!room) return;

  const participants = await getParticipants(room.room_id);

  // Shared state for the whole room channel
  const genericState = await buildRoomState(code, null);
  io.to(`room:${code}`).emit("room:state", genericState);

  // Personalised state for each participant
  for (const participant of participants) {
    if (!participant.user_id) continue;
    const personalState = await buildRoomState(code, participant.user_id);
    io.to(`user:${participant.user_id}`).emit("room:state:personal", {
      joinCode: code,
      state: personalState,
    });
  }
}

// Creates a new lobby that reuses the same settings as a previous room.
// This powers the "play again" flow after a completed multiplayer session.
async function createReplayRoom({ userId, sourceRoom }) {
  const joinCode = await generateUniqueJoinCode();

  const roomInsert = await query(
    `INSERT INTO multiplayer_room
     (
       host_user_id, set_id, join_code, title, difficulty_mode, prompt_type,
       display_time_per_card, answer_time_limit, group_size, randomize_order,
       blank_style, blank_ratio, seed, status, phase
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LOBBY', 'LOBBY')`,
    [
      userId,
      sourceRoom.set_id,
      joinCode,
      sourceRoom.title || sourceRoom.set_title,
      sourceRoom.difficulty_mode,
      sourceRoom.prompt_type,
      sourceRoom.display_time_per_card,
      sourceRoom.answer_time_limit,
      sourceRoom.group_size,
      sourceRoom.randomize_order,
      sourceRoom.blank_style,
      sourceRoom.blank_ratio,
      sourceRoom.seed,
    ]
  );

  // Insert the host as the room controller. Host is not marked as a playing user.
  await query(
    `INSERT INTO multiplayer_participant
     (room_id, user_id, display_name, is_host, is_playing, is_connected)
     VALUES (?, ?, ?, 1, 0, 1)`,
    [roomInsert.insertId, userId, "Host"]
  );

  return joinCode;
}


// ROUTE: Create a new multiplayer room
// POST /api/multiplayer/rooms
//
// Validates the chosen set belongs to the user, stores room configuration,
// inserts the host as a participant/controller, and returns the room info plus
// a shareable join URL.

router.post("/rooms", requireAuth, async (req, res) => {
  try {
    const {
      set_id,
      difficulty_mode = "EASY",
      prompt_type = "NORMAL_HIDDEN",
      display_time_per_card = 10,
      answer_time_limit = 120,
      group_size = 5,
      randomize_order = true,
      blank_style = "FIRST_LETTER",
      blank_ratio = null,
      seed = null,
      display_name,
    } = req.body || {};

    if (!set_id) {
      return res.status(400).json({ message: "set_id is required" });
    }

    const ownedSet = await ensureSetOwnership(Number(set_id), req.user.userId);
    if (!ownedSet) {
      return res.status(404).json({ message: "Set not found" });
    }

    const joinCode = await generateUniqueJoinCode();

    const roomInsert = await query(
      `INSERT INTO multiplayer_room
       (
         host_user_id, set_id, join_code, title, difficulty_mode, prompt_type,
         display_time_per_card, answer_time_limit, group_size, randomize_order,
         blank_style, blank_ratio, seed, status, phase
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LOBBY', 'LOBBY')`,
      [
        req.user.userId,
        Number(set_id),
        joinCode,
        ownedSet.title,
        String(difficulty_mode).toUpperCase(),
        normalizePromptType(prompt_type),
        Math.max(1, Number(display_time_per_card) || 10),
        Math.max(5, Number(answer_time_limit) || 120),
        Math.max(1, Number(group_size) || 5),
        randomize_order ? 1 : 0,
        normalizeBlankStyle(blank_style, prompt_type),
        blank_ratio !== null && blank_ratio !== undefined
          ? Number(blank_ratio)
          : null,
        seed !== null && seed !== undefined ? Number(seed) : null,
      ]
    );

    const roomId = roomInsert.insertId;

    // Insert the creator as the host participant.
    // is_playing = 0 means the host controls the room rather than submits answers.
    await query(
      `INSERT INTO multiplayer_participant
       (room_id, user_id, display_name, is_host, is_playing, is_connected)
       VALUES (?, ?, ?, 1, 0, 1)`,
      [
        roomId,
        req.user.userId,
        String(display_name || "Host").trim().slice(0, 80) || "Host",
      ]
    );

    const room = await getRoomByCode(joinCode);
    const participants = await getParticipants(roomId);
    const CLIENT_URL = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");

    res.status(201).json({
      room,
      participants,
      join_url: `${CLIENT_URL}/multiplayer/join/${joinCode}`,
    });
  } catch (err) {
    console.error("Create multiplayer room error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ROUTE: Join an existing multiplayer room
// POST /api/multiplayer/join
//
// Lets an authenticated user join a lobby as a player, or reconnect if they are
// already part of the room. Late joining is blocked once the game has started.

router.post("/join", requireAuth, async (req, res) => {
  try {
    const { join_code, display_name } = req.body || {};
    if (!join_code) {
      return res.status(400).json({ message: "join_code is required" });
    }

    const normalizedCode = String(join_code).trim().toUpperCase();
    const room = await getRoomByCode(normalizedCode);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (room.status === "CLOSED") {
      return res.status(403).json({ message: "This lobby has been closed." });
    }

    const existing = await query(
      `SELECT participant_id
       FROM multiplayer_participant
       WHERE room_id = ? AND user_id = ?
       LIMIT 1`,
      [room.room_id, req.user.userId]
    );

    // New players can only join while the room is still in the lobby.
    if (room.status !== "LOBBY" && existing.length === 0) {
      return res.status(403).json({
        message: "This game has already started. Late joining is disabled.",
      });
    }

    if (existing.length === 0) {
      // New participant joins as an active player.
      await query(
        `INSERT INTO multiplayer_participant
         (room_id, user_id, display_name, is_host, is_playing, is_connected)
         VALUES (?, ?, ?, 0, 1, 1)`,
        [
          room.room_id,
          req.user.userId,
          String(display_name || "Player").trim().slice(0, 80) || "Player",
        ]
      );
    } else {
      // Existing participant is simply marked connected again.
      await query(
        `UPDATE multiplayer_participant
         SET is_connected = 1, last_seen_at = NOW()
         WHERE participant_id = ?`,
        [existing[0].participant_id]
      );
    }

    const participants = await getParticipants(room.room_id);
    await emitRoomState(req.app.get("io"), normalizedCode);

    res.json({ room, participants });
  } catch (err) {
    console.error("Join multiplayer room error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ROUTE: Reconnect to a room you already belong to
// POST /api/multiplayer/rooms/:joinCode/reconnect
//
// Used by the frontend after socket reconnects or page refreshes so the server
// can mark the player as connected and send them their current personal room state.

router.post("/rooms/:joinCode/reconnect", requireAuth, async (req, res) => {
  try {
    const normalizedCode = String(req.params.joinCode).trim().toUpperCase();
    const room = await getRoomByCode(normalizedCode);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const existing = await query(
      `SELECT participant_id
       FROM multiplayer_participant
       WHERE room_id = ? AND user_id = ?
       LIMIT 1`,
      [room.room_id, req.user.userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "You are not part of this room" });
    }

    await markParticipantConnected(room.room_id, req.user.userId, true);
    await emitRoomState(req.app.get("io"), normalizedCode);

    const state = await buildRoomState(normalizedCode, req.user.userId);
    res.json(state);
  } catch (err) {
    console.error("Reconnect room error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ROUTE: Get the current room state
// GET /api/multiplayer/rooms/:joinCode
//
// Returns the current personalised room state for the logged-in viewer.
// This is used on initial page load before socket events take over.

router.get("/rooms/:joinCode", requireAuth, async (req, res) => {
  try {
    const state = await buildRoomState(
      String(req.params.joinCode).trim().toUpperCase(),
      req.user.userId
    );
    if (!state) {
      return res.status(404).json({ message: "Room not found" });
    }
    res.json(state);
  } catch (err) {
    console.error("Get multiplayer room error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ROUTE: Start a multiplayer room
// POST /api/multiplayer/rooms/:joinCode/start
//
// Host-only action.
// Validates room is in the lobby, ensures there are cards and at least one player,
// initialises the room engine, marks the room live, and starts the first step.

router.post("/rooms/:joinCode/start", requireAuth, async (req, res) => {
  try {
    const normalizedCode = String(req.params.joinCode).trim().toUpperCase();
    const room = await getRoomByCode(normalizedCode);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (Number(room.host_user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ message: "Only the host can start the room" });
    }

    if (room.status !== "LOBBY") {
      return res.status(400).json({ message: "Room cannot be started now" });
    }

    const cards = await getCardsForRoom(room.room_id);
    if (cards.length === 0) {
      return res.status(400).json({ message: "This set has no flashcards" });
    }

    const players = await getPlayingParticipants(room.room_id);
    if (players.length === 0) {
      return res.status(400).json({ message: "At least one player must join before starting" });
    }

    await initializeRoomEngine(room, cards);

    await query(
      `UPDATE multiplayer_room
       SET status = 'LIVE',
           started_at = NOW()
       WHERE room_id = ?`,
      [room.room_id]
    );

    await stepRoom(req.app.get("io"), normalizedCode);
    res.json({ message: "Room started" });
  } catch (err) {
    console.error("Start multiplayer room error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ROUTE: Close a lobby before the game starts
// POST /api/multiplayer/rooms/:joinCode/close
//
// Host-only action.
// This is only allowed while the room is still in LOBBY state.

router.post("/rooms/:joinCode/close", requireAuth, async (req, res) => {
  try {
    const normalizedCode = String(req.params.joinCode).trim().toUpperCase();
    const room = await getRoomByCode(normalizedCode);
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (Number(room.host_user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ message: "Only the host can close the lobby" });
    }

    if (room.status !== "LOBBY") {
      return res.status(400).json({ message: "Lobby can only be closed before the game starts" });
    }

    await finishRoom(req.app.get("io"), normalizedCode, "CLOSED");
    res.json({ message: "Lobby closed" });
  } catch (err) {
    console.error("Close lobby error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ROUTE: End a live room early
// POST /api/multiplayer/rooms/:joinCode/end
//
// Host-only action.
// This forces a live game to finish immediately.

router.post("/rooms/:joinCode/end", requireAuth, async (req, res) => {
  try {
    const normalizedCode = String(req.params.joinCode).trim().toUpperCase();
    const room = await getRoomByCode(normalizedCode);
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (Number(room.host_user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ message: "Only the host can end the room" });
    }

    if (room.status !== "LIVE") {
      return res.status(400).json({ message: "Only a live room can be ended" });
    }

    await finishRoom(req.app.get("io"), normalizedCode, "FINISHED");
    res.json({ message: "Room ended" });
  } catch (err) {
    console.error("End room error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ROUTE: Play again
// POST /api/multiplayer/rooms/:joinCode/play-again
//
// Host-only action.
// Creates a fresh lobby that reuses the same set and settings as the previous room.

router.post("/rooms/:joinCode/play-again", requireAuth, async (req, res) => {
  try {
    const normalizedCode = String(req.params.joinCode).trim().toUpperCase();
    const room = await getRoomByCode(normalizedCode);
    if (!room) return res.status(404).json({ message: "Room not found" });

    if (Number(room.host_user_id) !== Number(req.user.userId)) {
      return res.status(403).json({ message: "Only the host can start a new round" });
    }

    const ownedSet = await ensureSetOwnership(Number(room.set_id), req.user.userId);
    if (!ownedSet) {
      return res.status(403).json({ message: "You no longer have access to this set" });
    }

    const newJoinCode = await createReplayRoom({
      userId: req.user.userId,
      sourceRoom: room,
    });

    const newRoom = await getRoomByCode(newJoinCode);
    const CLIENT_URL = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");

    res.json({
      message: "New room created",
      room: newRoom,
      join_url: `${CLIENT_URL}/multiplayer/join/${newJoinCode}`,
    });
  } catch (err) {
    console.error("Play again error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ROUTE: Submit an answer for the current multiplayer test card
// POST /api/multiplayer/rooms/:joinCode/answer
//
// Player-only action.
// Validates:
// - room exists
// - room is live
// - current step is TEST
// - user is a participant
// - user is a playing participant, not the host/controller
// - user has not already answered this card
//
// Then it stores the answer, updates score if correct, emits new room state,
// and if everyone has answered, ends TEST phase early and moves to RESULT.

router.post("/rooms/:joinCode/answer", requireAuth, async (req, res) => {
  try {
    const { user_answer = "", time_taken = null } = req.body || {};
    const normalizedCode = String(req.params.joinCode).trim().toUpperCase();

    const room = await getRoomByCode(normalizedCode);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const currentState = await buildRoomState(normalizedCode, req.user.userId);
    const step = currentState?.current_step;

    if (!step || room.status !== "LIVE" || step.phase !== "TEST") {
      return res.status(400).json({ message: "Answers are not being accepted right now" });
    }

    const participants = await getParticipants(room.room_id);
    const me = participants.find((p) => Number(p.user_id) === Number(req.user.userId));

    if (!me) {
      return res.status(403).json({ message: "You are not a participant in this room" });
    }

    if (Number(me.is_playing) !== 1) {
      return res.status(403).json({ message: "Host cannot submit answers" });
    }

    const alreadyAnswered = await query(
      `SELECT answer_id
       FROM multiplayer_answer
       WHERE room_id = ? AND participant_id = ? AND flashcard_id = ?
       LIMIT 1`,
      [room.room_id, me.participant_id, step.flashcard_id]
    );

    if (alreadyAnswered.length > 0) {
      return res.status(400).json({ message: "You already answered this card" });
    }

    const cards = await getCardsForRoom(room.room_id);
    const card = cards.find(
      (c) => Number(c.flashcard_id) === Number(step.flashcard_id)
    );
    if (!card) {
      return res.status(400).json({ message: "Active card not found" });
    }

    // Use the same hybrid answer checking logic as solo mode.
    const correct = isAnswerCorrectHybrid(user_answer, card.answer) ? 1 : 0;

    await query(
      `INSERT INTO multiplayer_answer
       (room_id, participant_id, flashcard_id, user_answer, is_correct, time_taken)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        room.room_id,
        me.participant_id,
        step.flashcard_id,
        String(user_answer),
        correct,
        time_taken !== null ? Number(time_taken) : null,
      ]
    );

    // Correct answers increment score.
    // Incorrect answers still update last_seen_at so reconnect/activity stays fresh.
    if (correct) {
      await query(
        `UPDATE multiplayer_participant
         SET score = score + 1, last_seen_at = NOW()
         WHERE participant_id = ?`,
        [me.participant_id]
      );
    } else {
      await query(
        `UPDATE multiplayer_participant
         SET last_seen_at = NOW()
         WHERE participant_id = ?`,
        [me.participant_id]
      );
    }

    await emitRoomState(req.app.get("io"), normalizedCode);

    // If every active player has answered, do not wait for the timer to expire.
    // Move immediately into the RESULT phase.
    const everyoneAnswered = await allPlayersAnswered(
      room.room_id,
      step.flashcard_id
    );

    if (everyoneAnswered) {
      clearRoomTimer(normalizedCode);
      await beginResultPhase(req.app.get("io"), normalizedCode);
    }

    res.json({
      accepted: true,
    });
  } catch (err) {
    console.error("Submit multiplayer answer error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Export the configured router so app.js can mount it under the multiplayer API path.
module.exports = router;