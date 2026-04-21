// Import React hooks:
// useEffect runs side effects such as loading data or setting up timers,
// useMemo caches derived values so they are not recalculated unnecessarily,
// useRef stores mutable values that persist between renders without triggering rerenders,
// useState stores local component state.
import { useEffect, useMemo, useRef, useState } from "react";

// Import React Router helpers:
// useSearchParams is used to read values from the URL query string,
// Link is used for clickable navigation links.
import { useSearchParams, Link } from "react-router-dom";

// Import the background context so the user's selected background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Describes the available prompt types that can be used during practice.
// Each type has a label and explanation shown in the UI.
const PROMPT_TYPES = {
  NORMAL_HIDDEN: {
    label: "Hidden Answer",
    description: "The full answer is hidden. You must recall it completely from memory.",
  },
  ALL_BLANKS: {
    label: "All Important Words Blanked",
    description: "All eligible words are hidden. Use blank style to choose hints or full blanks.",
  },
  RANDOM_BLANKS: {
    label: "Partial Blanks",
    description: "Some eligible words are hidden. Use blank style to choose hints or full blanks.",
  },
  KEY_TERMS_ONLY: {
    label: "Key Terms Only",
    description: "Important nouns and key concepts are blanked out.",
  },
  EVERY_OTHER_WORD: {
    label: "Every Other Word",
    description: "Every second important word is hidden.",
  },
  INCREASING_DIFFICULTY: {
    label: "Increasing Difficulty",
    description: "Each attempt hides more words, making the card harder.",
  },
  DIFFICULTY_LEVEL_BLANKS: {
    label: "Difficulty Levels",
    description: "The number of blanks depends on the difficulty level.",
  },
};

// describes the available difficulty modes that can be used during practice.
const DIFFICULTY_MODES = {
  EASY: {
    label: "Easy",
    description:
      "A supportive mode for learning or reviewing new material. Each card is previewed before you answer, helping you build confidence.",
  },
  MODERATE: {
    label: "Moderate",
    description:
      "A balanced revision mode. Cards are previewed in groups, then tested together to strengthen recall without removing all support.",
  },
  HARD: {
    label: "Hard",
    description:
      "A challenge mode for stronger memory testing. Cards focus more on recall, making it useful when you already know the content.",
  },
};

// Default flashcard theme values used when a selected set does not have its own saved style
const DEFAULT_THEME = {
  top_color: "#121a2a",
  bottom_color: "#0b1220",
  text_color: "#ffffff",
  accent_color: "#3b82f6",
  border_radius: "12px",
};

// Main Practice page component
export default function Practice() {
  // Read the search parameters from the URL so a set can be preselected
  const [searchParams] = useSearchParams();

  // Form state storing all practice session setup options
  const [form, setForm] = useState({
    set_id: searchParams.get("set_id") || "",
    difficulty_mode: "EASY",
    prompt_type: "NORMAL_HIDDEN",
    blank_style: "FIRST_LETTER",
    randomize_order: true,
    group_size: 5,
    answer_time_limit: 120,
    display_time_per_card: 10,
    use_adaptive_timing: false,
    blank_ratio: "",
  });

  // Stores the list of available flashcard sets the user can practise
  const [availableSets, setAvailableSets] = useState([]);

  // Tracks whether the available sets are still loading
  const [setsLoading, setSetsLoading] = useState(true);

  // Controls whether advanced practice settings are visible
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Tracks whether a practice-related backend request is in progress
  const [loading, setLoading] = useState(false);

  // Stores page-level error messages
  const [error, setError] = useState("");

  // Stores inline validation messages, such as when the answer box is empty
  const [inlineMessage, setInlineMessage] = useState("");

  // Stores timeout messages shown when a timer reaches zero
  const [timeoutMessage, setTimeoutMessage] = useState("");

  // Stores the current practice session ID returned by the backend
  const [sessionId, setSessionId] = useState(null);

  // Stores the current flashcard/phase data returned by the backend
  const [currentCard, setCurrentCard] = useState(null);

  // Stores the user's typed answer during test mode
  const [userAnswer, setUserAnswer] = useState("");

  // Stores feedback after an answer is submitted
  const [feedback, setFeedback] = useState(null);

  // Tracks whether the practice session has finished
  const [finished, setFinished] = useState(false);

  // Stores the session summary returned at the end of practice
  const [summary, setSummary] = useState(null);

  // Stores the current countdown timer value in seconds
  const [timerSeconds, setTimerSeconds] = useState(null);

  // Stores the original/max timer value so progress can be displayed
  const [timerMaxSeconds, setTimerMaxSeconds] = useState(null);

  // Controls whether the flashcard is currently animating between phases
  const [isFlipping, setIsFlipping] = useState(false);

  // Stores the direction of the flip animation
  const [flipDirection, setFlipDirection] = useState("forward");

  // Reminder prompt state shown after a finished session if reminders are not yet enabled
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [adaptiveReminderEnabled, setAdaptiveReminderEnabled] = useState(false);
  const [reminderIntervalHours, setReminderIntervalHours] = useState(24);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [showReminderPrompt, setShowReminderPrompt] = useState(false);

  // Read the auth token from localStorage so authenticated API requests can be made
  const token = localStorage.getItem("token");

  // Ref used to stop repeated automatic actions when the timer hits zero
  const autoActionLockRef = useRef(false);

  // Ref used to store when the answer phase started so answer duration can be measured
  const answerStartTimeRef = useRef(null);

  // Ref used to remember the previous flashcard phase so flip animation can react to changes
  const previousPhaseRef = useRef(null);

  // Ref used to store the timeout ID for clearing flip animation timing
  const flipTimeoutRef = useRef(null);

  // Get the selected custom background from the shared background context
  const { selectedBackground } = useBackground();

  // Build the final page style object.
  // It starts with the default page styles and conditionally adds a selected background image
  // with a dark overlay so the content remains readable.
  const pageStyle = {
    ...styles.page,
    ...(selectedBackground?.image_url
      ? {
          backgroundImage: `linear-gradient(rgba(11,18,32,0.78), rgba(11,18,32,0.78)), url(${selectedBackground.image_url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }
      : {}),
  };

  // Generic form change handler for practice setup inputs
  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  // Shared helper for backend requests that automatically applies JSON headers and auth token
  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  // Loads the user's available sets for the practice setup dropdown
  async function loadSets() {
    try {
      setSetsLoading(true);

      const { res, data } = await apiFetch("/api/sets", {
        method: "GET",
      });

      // If loading sets fails, leave the page usable but without forcing an error screen
      if (!res.ok) {
        return;
      }

      const sets = Array.isArray(data) ? data : data?.sets || [];
      setAvailableSets(sets);

      // If there is no set in the URL and no current form selection,
      // automatically choose the first available set
      const urlSetId = searchParams.get("set_id");
      if (!urlSetId && sets.length > 0 && !form.set_id) {
        setForm((prev) => ({
          ...prev,
          set_id: String(sets[0].set_id),
        }));
      }
    } catch {
      // Keep silent here so practice page still works if sets fetch fails
    } finally {
      setSetsLoading(false);
    }
  }

  // Load available sets once when the page first opens
  useEffect(() => {
    loadSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loads reminder settings for the completed set if a session has finished
  async function loadReminderForFinishedSet() {
    if (!form.set_id || !token) return;

    try {
      const { res, data } = await apiFetch(`/api/sets/${form.set_id}/reminder`, {
        method: "GET",
      });

      if (!res.ok) return;

      // If reminders are already enabled, do not show the reminder prompt again
      if (data.reminder_enabled) {
        setShowReminderPrompt(false);
        return;
      }

      // Otherwise initialise default reminder options and show the prompt
      setReminderEnabled(true);
      setAdaptiveReminderEnabled(false);
      setReminderIntervalHours(24);
      setReminderMessage("");
      setShowReminderPrompt(true);
    } catch {
      // Keep silent
    }
  }

  // When a session finishes, check whether to show the reminder prompt
  useEffect(() => {
    if (finished) {
      loadReminderForFinishedSet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  // Saves reminder settings directly from the end-of-session reminder prompt
  async function saveSetReminderFromPractice() {
    if (!form.set_id) return;

    try {
      setReminderSaving(true);
      setReminderMessage("");

      const { res, data } = await apiFetch(`/api/sets/${form.set_id}/reminder`, {
        method: "POST",
        body: JSON.stringify({
          reminder_enabled: reminderEnabled,
          interval_hours: reminderIntervalHours,
          adaptive_enabled: adaptiveReminderEnabled,
        }),
      });

      if (!res.ok) {
        setReminderMessage(data?.message || "Failed to save reminder");
        return;
      }

      setReminderMessage(data?.message || "Reminder saved successfully");
      setShowReminderPrompt(false);
    } catch {
      setReminderMessage("Server error while saving reminder");
    } finally {
      setReminderSaving(false);
    }
  }

  // Starts a new practice session using the current setup form values
  async function startSession(e) {
    e.preventDefault();
    setError("");
    setInlineMessage("");
    setTimeoutMessage("");
    setFeedback(null);
    setFinished(false);
    setSummary(null);
    setCurrentCard(null);
    setUserAnswer("");
    setTimerSeconds(null);
    setTimerMaxSeconds(null);
    setReminderMessage("");
    setShowReminderPrompt(false);
    answerStartTimeRef.current = null;
    autoActionLockRef.current = false;
    previousPhaseRef.current = null;
    setIsFlipping(false);

    // A set must be selected before starting
    if (!form.set_id) {
      setError("Please select a flashcard set.");
      return;
    }

    try {
      setLoading(true);

      // Build the practice session payload
      const payload = {
        set_id: Number(form.set_id),
        difficulty_mode: form.difficulty_mode,
        prompt_type: form.prompt_type,
        blank_style: form.blank_style,
        randomize_order: !!form.randomize_order,
        group_size: Number(form.group_size),
        answer_time_limit: Number(form.answer_time_limit),
        display_time_per_card: Number(form.display_time_per_card),
        use_adaptive_timing: !!form.use_adaptive_timing,
      };

      // Only send blank_ratio when the user entered one
      if (form.blank_ratio !== "") {
        payload.blank_ratio = Number(form.blank_ratio);
      }

      const { res, data } = await apiFetch("/api/practice/start", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setError(data?.message || "Failed to start session");
        return;
      }

      // Save the new session ID and immediately load the first card
      setSessionId(data.session_id);
      await loadNextCard(data.session_id);
    } catch (err) {
      setError(err.message || "Server error");
    } finally {
      setLoading(false);
    }
  }

  // Loads the next card/phase in the current practice session
  async function loadNextCard(id = sessionId) {
    if (!id) return;

    try {
      setLoading(true);
      setError("");
      setInlineMessage("");
      setTimeoutMessage("");
      setFeedback(null);
      setUserAnswer("");
      setTimerSeconds(null);
      setTimerMaxSeconds(null);
      answerStartTimeRef.current = null;
      autoActionLockRef.current = false;

      const { res, data } = await apiFetch(`/api/practice/${id}/next`, {
        method: "GET",
      });

      if (!res.ok) {
        setError(data?.message || "Failed to load next card");
        return;
      }

      // If the backend reports the session is complete, save the summary and stop card flow
      if (data.done) {
        setFinished(true);
        setSummary(data.summary || null);
        setCurrentCard(null);
        setTimerSeconds(null);
        setTimerMaxSeconds(null);
        answerStartTimeRef.current = null;
        autoActionLockRef.current = true;
        return;
      }

      // Save the current card payload
      setCurrentCard(data);

      // Start answer timing only when entering test mode
      if (data.phase === "TEST") {
        answerStartTimeRef.current = Date.now();
      } else {
        answerStartTimeRef.current = null;
      }

      // Some session modes may instruct the frontend to immediately request another card
      if (data.call_next_again) {
        await loadNextCard(id);
        return;
      }

      // Decide which timer value should be shown based on the phase
      const nextTimer =
        data.phase === "PREVIEW"
          ? (data.reveal_seconds ?? data.display_time_per_card ?? null)
          : (data.answer_time_limit ?? null);

      if (nextTimer !== null && nextTimer !== undefined) {
        const rounded = Math.ceil(Number(nextTimer));
        setTimerSeconds(rounded);
        setTimerMaxSeconds(rounded);
      }
    } catch (err) {
      setError(err.message || "Server error");
    } finally {
      setLoading(false);
    }
  }

  // Handles answer submission from the form submit event
  async function submitAnswer(e) {
    if (e) e.preventDefault();
    if (!sessionId || !currentCard?.flashcard_id) return;

    const trimmedAnswer = userAnswer.trim();

    // Require some answer text before manual submission
    if (!trimmedAnswer) {
      setInlineMessage("You must type an answer.");
      return;
    }

    await submitAnswerValue(trimmedAnswer);
  }

  // Sends a specific answer value to the backend for marking
  async function submitAnswerValue(answerValue) {
    if (!sessionId || !currentCard?.flashcard_id) return;

    // Measure how long the user spent answering in test mode
    const startedAt = answerStartTimeRef.current;
    const elapsedSeconds = startedAt
      ? Math.max(1, Math.ceil((Date.now() - startedAt) / 1000))
      : null;

    try {
      setLoading(true);
      setError("");
      setInlineMessage("");

      const { res, data } = await apiFetch(`/api/practice/${sessionId}/answer`, {
        method: "POST",
        body: JSON.stringify({
          flashcard_id: currentCard.flashcard_id,
          user_answer: answerValue,
          time_taken: elapsedSeconds,
        }),
      });

      if (!res.ok) {
        setError(data?.message || "Failed to submit answer");
        return;
      }

      // Clear current card state and show feedback instead
      answerStartTimeRef.current = null;
      setFeedback(data);
      setCurrentCard(null);
      setTimerSeconds(null);
      setTimerMaxSeconds(null);
      autoActionLockRef.current = false;
    } catch (err) {
      setError(err.message || "Server error");
    } finally {
      setLoading(false);
    }
  }

  // Resets the page back to the pre-session state so the user can start another session
  function resetPractice() {
    setSessionId(null);
    setCurrentCard(null);
    setUserAnswer("");
    setFeedback(null);
    setFinished(false);
    setSummary(null);
    setError("");
    setInlineMessage("");
    setTimeoutMessage("");
    setTimerSeconds(null);
    setTimerMaxSeconds(null);
    setReminderMessage("");
    setShowReminderPrompt(false);
    answerStartTimeRef.current = null;
    autoActionLockRef.current = false;
    previousPhaseRef.current = null;
    setIsFlipping(false);
  }

  // After feedback is shown, continue to the next card
  function continueAfterFeedback() {
    answerStartTimeRef.current = null;
    loadNextCard(sessionId);
  }

  // Determines whether the answer box should be shown for the current state
  const showAnswerBox =
    currentCard &&
    currentCard.phase === "TEST" &&
    ["EASY", "MODERATE", "HARD"].includes(currentCard.difficulty_mode);

  // Convenience booleans for current phase
  const isPreview = currentCard && currentCard.phase === "PREVIEW";
  const isTest = currentCard && currentCard.phase === "TEST";

  // Builds a readable timer label depending on whether the card is in preview or test phase
  const timerLabel = useMemo(() => {
    if (!currentCard) return "";
    if (currentCard.phase === "PREVIEW") return "Preview time remaining";
    if (currentCard.phase === "TEST") return "Answer time remaining";
    return "Time remaining";
  }, [currentCard]);

  // Finds the theme for the currently selected set so the practice card can match the set's appearance
  const selectedSetTheme = useMemo(() => {
    const selectedSet = availableSets.find(
      (set) => String(set.set_id) === String(form.set_id)
    );

    return {
      top_color: selectedSet?.top_color || DEFAULT_THEME.top_color,
      bottom_color: selectedSet?.bottom_color || DEFAULT_THEME.bottom_color,
      text_color: selectedSet?.text_color || DEFAULT_THEME.text_color,
      accent_color: selectedSet?.accent_color || DEFAULT_THEME.accent_color,
      border_radius: selectedSet?.border_radius || DEFAULT_THEME.border_radius,
    };
  }, [availableSets, form.set_id]);

  // Determines whether blank style options should be shown
  const shouldShowBlankStyle = form.prompt_type !== "NORMAL_HIDDEN";

  // Determines whether blank ratio options should be shown
  const shouldShowBlankRatio =
    form.prompt_type === "RANDOM_BLANKS" ||
    form.prompt_type === "INCREASING_DIFFICULTY";

  // Returns the current timer colour based on how much time remains
  function getTimerColor() {
    if (timerSeconds === null || !timerMaxSeconds) return "#22c55e";

    const ratio = timerSeconds / timerMaxSeconds;

    if (ratio > 0.6) return "#22c55e";
    if (ratio > 0.3) return "#f59e0b";
    return "#ef4444";
  }

  // Returns the progress percentage for the timer progress bar
  function getTimerProgressPercent() {
    if (timerSeconds === null || !timerMaxSeconds || timerMaxSeconds <= 0) {
      return 100;
    }
    return Math.max(0, Math.min(100, (timerSeconds / timerMaxSeconds) * 100));
  }

  // Counts down the timer once per second while it is active
  useEffect(() => {
    if (timerSeconds === null || timerSeconds <= 0) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerSeconds]);

  // Automatically advances or submits when the timer reaches zero
  useEffect(() => {
    if (!currentCard) return;
    if (finished) return;
    if (loading) return;
    if (feedback) return;
    if (timerSeconds !== 0) return;
    if (autoActionLockRef.current) return;

    autoActionLockRef.current = true;

    const runAutoAction = async () => {
      // Preview phase automatically continues to the next card
      if (currentCard.phase === "PREVIEW") {
        await loadNextCard(sessionId);
        return;
      }

      // Test phase automatically submits the current answer when time runs out
      if (currentCard.phase === "TEST") {
        setTimeoutMessage("Time is up — Answer submitted");
        await submitAnswerValue(userAnswer.trim());
      }
    };

    runAutoAction();
  }, [timerSeconds, currentCard, finished, loading, feedback, sessionId, userAnswer]);

  // Warn the user before leaving the page during an active practice session
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!sessionId || finished) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [sessionId, finished]);

  // Triggers a flip animation whenever the card phase changes
  useEffect(() => {
    if (!currentCard?.phase) return;

    const previousPhase = previousPhaseRef.current;

    if (previousPhase && previousPhase !== currentCard.phase) {
      setFlipDirection(currentCard.phase === "TEST" ? "forward" : "backward");
      setIsFlipping(true);

      if (flipTimeoutRef.current) {
        clearTimeout(flipTimeoutRef.current);
      }

      flipTimeoutRef.current = setTimeout(() => {
        setIsFlipping(false);
      }, 550);
    }

    previousPhaseRef.current = currentCard.phase;

    return () => {
      if (flipTimeoutRef.current) {
        clearTimeout(flipTimeoutRef.current);
      }
    };
  }, [currentCard?.phase]);

  // Renders the progress bar section depending on the progress format returned by the backend
  function renderProgress() {
    if (!currentCard) return null;

    if (currentCard.progress?.current && currentCard.progress?.total) {
      const value = Math.round(
        (currentCard.progress.current / currentCard.progress.total) * 100
      );

      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>
            Card {currentCard.progress.current} of {currentCard.progress.total}
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${value}%`,
                background: selectedSetTheme.accent_color,
              }}
            />
          </div>
        </div>
      );
    }

    if (currentCard.progress?.in_group && currentCard.progress?.group_total) {
      const value = Math.round(
        (currentCard.progress.in_group / currentCard.progress.group_total) * 100
      );

      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>
            Group card {currentCard.progress.in_group} of {currentCard.progress.group_total}
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${value}%`,
                background: selectedSetTheme.accent_color,
              }}
            />
          </div>
        </div>
      );
    }

    if (
      currentCard.progress?.answered_in_group &&
      currentCard.progress?.group_total
    ) {
      const value = Math.round(
        (currentCard.progress.answered_in_group / currentCard.progress.group_total) * 100
      );

      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>
            Test card {currentCard.progress.answered_in_group} of {currentCard.progress.group_total}
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${value}%`,
                background: selectedSetTheme.accent_color,
              }}
            />
          </div>
        </div>
      );
    }

    if (currentCard.progress?.index && currentCard.progress?.total) {
      const value = Math.round(
        (currentCard.progress.index / currentCard.progress.total) * 100
      );

      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>
            Preview {currentCard.progress.index} of {currentCard.progress.total}
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${value}%`,
                background: selectedSetTheme.accent_color,
              }}
            />
          </div>
        </div>
      );
    }

    if (
      currentCard.progress?.remaining !== undefined &&
      currentCard.progress?.total
    ) {
      const completed = currentCard.progress.total - currentCard.progress.remaining;
      const value = Math.round((completed / currentCard.progress.total) * 100);

      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>
            Completed {completed} of {currentCard.progress.total}
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${value}%`,
                background: selectedSetTheme.accent_color,
              }}
            />
          </div>
        </div>
      );
    }

    return null;
  }

  // Dynamic styling for the 3D flashcard wrapper
  const flashcardPerspectiveStyle = {
    ...styles.flashcardPerspective,
    perspective: "1800px",
  };

  // Dynamic styling for the animated flashcard shell based on theme and animation state
  const flashcardShellStyle = {
    ...styles.flashcardShell,
    borderRadius: selectedSetTheme.border_radius,
    border: `2px solid ${selectedSetTheme.accent_color}`,
    transform: isFlipping
      ? `rotateY(${flipDirection === "forward" ? "180deg" : "-180deg"}) scale(0.985)`
      : "rotateY(0deg) scale(1)",
    boxShadow: isFlipping
      ? `0 22px 50px rgba(0,0,0,0.38), 0 0 0 2px ${selectedSetTheme.accent_color}33`
      : "0 16px 40px rgba(0,0,0,0.32)",
    filter: isFlipping ? "brightness(1.06)" : "brightness(1)",
  };

  // Dynamic styling for the top half of the flashcard
  const flashcardTopStyle = {
    ...styles.flashcardTop,
    background: selectedSetTheme.top_color,
    color: selectedSetTheme.text_color,
  };

  // Dynamic styling for the bottom half of the flashcard
  const flashcardBottomStyle = {
    ...styles.flashcardBottom,
    background: selectedSetTheme.bottom_color,
    color: selectedSetTheme.text_color,
    borderTop: `1px solid ${selectedSetTheme.accent_color}`,
  };

  // Active action button styling
  const themedButtonStyle = {
    ...styles.button,
    backgroundColor: "#3b82f6",
    color: "#ffffff",
    border: "none",
    opacity: 1,
    filter: "none",
    WebkitTextFillColor: "#ffffff",
  };

  // Disabled action button styling
  const themedDisabledButtonStyle = {
    ...styles.button,
    backgroundColor: "#3b82f6",
    color: "#ffffff",
    border: "none",
    opacity: 0.65,
    cursor: "not-allowed",
    filter: "grayscale(0.15)",
    WebkitTextFillColor: "#ffffff",
  };

  // Active start button styling
  const themedStartButtonStyle = {
    ...styles.startButton,
    backgroundColor: "#22c55e",
    color: "#ffffff",
    border: "none",
    boxShadow: "none",
    opacity: 1,
    filter: "none",
    WebkitTextFillColor: "#ffffff",
  };

  // Disabled start button styling
  const themedDisabledStartButtonStyle = {
    ...styles.startButton,
    backgroundColor: "#22c55e",
    color: "#ffffff",
    border: "none",
    boxShadow: "none",
    opacity: 0.65,
    cursor: "not-allowed",
    filter: "grayscale(0.15)",
    WebkitTextFillColor: "#ffffff",
  };

  // Dynamic label styling matching the selected set theme
  const themedLabelStyle = {
    ...styles.label,
    color: selectedSetTheme.text_color,
  };

  // Dynamic answer label styling matching the selected set accent colour
  const themedAnswerLabelStyle = {
    ...styles.answerLabel,
    color: selectedSetTheme.accent_color,
    opacity: 1,
  };

  // Dynamic question label styling matching the selected set accent colour
  const themedQuestionLabelStyle = {
    ...styles.questionLabel,
    color: selectedSetTheme.accent_color,
    opacity: 1,
  };

  // Render the Practice page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header row with page title and link back to the set list */}
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Practice Mode</h1>

          <Link
            to="/sets"
            style={styles.backLink}
            onClick={(e) => {
              // Warn the user before leaving an active session
              if (sessionId && !finished) {
                const confirmLeave = window.confirm(
                  "You are currently in a practice session. Leaving will end the session. Continue?"
                );
                if (!confirmLeave) e.preventDefault();
              }
            }}
          >
            Choose Another Set
          </Link>
        </div>

        {/* Setup form shown before a session starts */}
        {!sessionId && (
          <form onSubmit={startSession} style={styles.card}>
            <h2 style={styles.sectionTitle}>Start Session</h2>
            <p style={styles.sectionDescription}>
              Choose the set and core practice options below. Advanced timing and difficulty
              controls can be opened if needed.
            </p>

            <div style={styles.grid}>
              <div>
                <label style={styles.label}>Flashcard Set</label>
                <select
                  name="set_id"
                  value={form.set_id}
                  onChange={onChange}
                  style={styles.input}
                  disabled={setsLoading}
                >
                  <option value="">
                    {setsLoading ? "Loading sets..." : "Select a set"}
                  </option>
                  {availableSets.map((set) => (
                    <option key={set.set_id} value={set.set_id}>
                      {set.title}
                    </option>
                  ))}
                </select>
                <div style={styles.helpText}>
                  Choose the flashcard set you want to practise.
                </div>
              </div>

              <div>
                <label style={styles.label}>Difficulty Mode</label>
                <select
                  name="difficulty_mode"
                  value={form.difficulty_mode}
                  onChange={onChange}
                  style={styles.input}
                >
                  <option value="EASY">EASY</option>
                  <option value="MODERATE">MODERATE</option>
                  <option value="HARD">HARD</option>
                </select>
                <div style={styles.helpText}>
                  {DIFFICULTY_MODES[form.difficulty_mode]?.description}
                </div>
              </div>

              <div>
                <label style={styles.label}>Prompt Type</label>
                <select
                  name="prompt_type"
                  value={form.prompt_type}
                  onChange={onChange}
                  style={styles.input}
                >
                  {Object.entries(PROMPT_TYPES).map(([value, config]) => (
                    <option key={value} value={value}>
                      {config.label}
                    </option>
                  ))}
                </select>
                <div style={styles.helpText}>
                  {PROMPT_TYPES[form.prompt_type]?.description}
                </div>
              </div>

              {/* Blank style options only appear for non-normal hidden prompt types */}
              {shouldShowBlankStyle && (
                <div>
                  <label style={styles.label}>Blank Style</label>
                  <select
                    name="blank_style"
                    value={form.blank_style}
                    onChange={onChange}
                    style={styles.input}
                  >
                    <option value="FIRST_LETTER">First Letter Hints</option>
                    <option value="FULL">Fully Blanked</option>
                  </select>
                  <div style={styles.helpText}>
                    Choose whether hidden words show their first letter or are completely blanked.
                  </div>
                </div>
              )}
            </div>

            {/* Button for showing or hiding the advanced settings section */}
            <button
              type="button"
              style={styles.advancedToggle}
              onClick={() => setShowAdvanced((prev) => !prev)}
            >
              {showAdvanced ? "Hide Advanced Settings ▲" : "Show Advanced Settings ▼"}
            </button>

            {/* Advanced setup options */}
            {showAdvanced && (
              <div style={styles.advancedSection}>
                <div style={styles.subsectionTitle}>Advanced Settings</div>

                <div style={styles.grid}>
                  {/* Blank ratio only appears for prompt types that support partial blanking */}
                  {shouldShowBlankRatio && (
                    <div>
                      <label style={styles.label}>Blank Ratio</label>
                      <input
                        name="blank_ratio"
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={form.blank_ratio}
                        onChange={onChange}
                        style={styles.input}
                        placeholder="e.g. 0.4"
                      />
                      <div style={styles.helpText}>
                        Controls how many words are hidden. Example: 0.4 means about 40% of
                        eligible words are blanked.
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={styles.label}>Group Size</label>
                    <input
                      name="group_size"
                      type="number"
                      min="1"
                      value={form.group_size}
                      onChange={onChange}
                      style={styles.input}
                    />
                    <div style={styles.helpText}>
                      Used in MODERATE mode. Sets how many cards are previewed and tested
                      together.
                    </div>
                  </div>

                  <div>
                    <label style={styles.label}>Display Time Per Card</label>
                    <input
                      name="display_time_per_card"
                      type="number"
                      min="1"
                      value={form.display_time_per_card}
                      onChange={onChange}
                      style={styles.input}
                    />
                    <div style={styles.helpText}>
                      Preview time in seconds before the next card continues automatically.
                    </div>
                  </div>

                  <div>
                    <label style={styles.label}>Answer Time Limit</label>
                    <input
                      name="answer_time_limit"
                      type="number"
                      min="1"
                      value={form.answer_time_limit}
                      onChange={onChange}
                      style={styles.input}
                    />
                    <div style={styles.helpText}>
                      Maximum time in seconds allowed to type an answer before it is submitted
                      automatically.
                    </div>
                  </div>
                </div>

                <div style={styles.checkboxGroup}>
                  <label style={styles.checkboxRow}>
                    <input
                      name="randomize_order"
                      type="checkbox"
                      checked={form.randomize_order}
                      onChange={onChange}
                    />
                    Randomize Order
                  </label>

                  <label style={styles.checkboxRow}>
                    <input
                      name="use_adaptive_timing"
                      type="checkbox"
                      checked={form.use_adaptive_timing}
                      onChange={onChange}
                    />
                    Use Adaptive Timing
                  </label>
                </div>

                <div style={styles.helpText}>
                  Adaptive timing adjusts preview or answer timing based on card difficulty
                  and text complexity.
                </div>
              </div>
            )}

            {/* Explanatory card describing how practice sessions work */}
            <div style={styles.explainerCard}>
              <h3 style={styles.explainerTitle}>How Practice Works</h3>

              <div style={styles.explainerGrid}>
                <div style={styles.explainerBlock}>
                  <div style={styles.explainerStep}>1. Preview Phase</div>
                  <p style={styles.explainerText}>
                    You first see the flashcard question and answer so you can study it.
                    This helps you prepare before being tested.
                  </p>
                </div>

                <div style={styles.explainerBlock}>
                  <div style={styles.explainerStep}>2. Test Phase</div>
                  <p style={styles.explainerText}>
                    After previewing, you move into the test phase where you must recall
                    the answer from memory. Depending on your prompt settings, the answer
                    may be hidden or shown with blanks.
                  </p>
                </div>

                <div style={styles.explainerBlock}>
                  <div style={styles.explainerStep}>3. Timed Practice</div>
                  <p style={styles.explainerText}>
                    Some cards continue automatically when the timer ends. In test mode,
                    your answer may be submitted automatically if time runs out.
                  </p>
                </div>

                <div style={styles.explainerBlock}>
                  <div style={styles.explainerStep}>4. Feedback</div>
                  <p style={styles.explainerText}>
                    After each answer, you receive feedback and can continue to the next
                    card. At the end, you will see a session summary.
                  </p>
                </div>
              </div>
            </div>

            {/* Start session button */}
            <button
              type="submit"
              style={loading || setsLoading ? themedDisabledStartButtonStyle : themedStartButtonStyle}
              disabled={loading || setsLoading}
            >
              {loading ? "Starting..." : "Start Practice Session"}
            </button>
          </form>
        )}

        {/* Global messages shown during an active session or setup */}
        {error && <div style={styles.error}>{error}</div>}
        {timeoutMessage && <div style={styles.timeoutMessage}>{timeoutMessage}</div>}

        {/* Live session area shown while a practice session is active */}
        {sessionId && !finished && currentCard && (
          <div style={styles.practiceSessionArea}>
            <div style={styles.infoPanel}>
              {/* Badge row showing difficulty, phase, and optional group index */}
              <div style={styles.badgeRow}>
                <span style={styles.badge}>{currentCard.difficulty_mode}</span>
                <span
                  style={{
                    ...styles.badge,
                    background: isPreview ? "#14532d" : "#1e3a8a",
                  }}
                >
                  {currentCard.phase}
                </span>
                {currentCard.group?.index && (
                  <span style={styles.badge}>Group {currentCard.group.index}</span>
                )}
              </div>

              {/* Progress UI for the current card/group/session */}
              {renderProgress()}

              {/* Timer card shown whenever a timer is active */}
              {timerSeconds !== null && (
                <div
                  style={{
                    ...styles.timerCard,
                    borderRadius: selectedSetTheme.border_radius,
                    border: `1px solid ${selectedSetTheme.accent_color}`,
                  }}
                >
                  <div style={styles.timerLabel}>{timerLabel}</div>

                  <div
                    style={{
                      ...styles.timerValue,
                      color: getTimerColor(),
                    }}
                  >
                    {timerSeconds}s
                  </div>

                  <div style={styles.timerProgressOuter}>
                    <div
                      style={{
                        ...styles.timerProgressInner,
                        width: `${getTimerProgressPercent()}%`,
                        background: getTimerColor(),
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Main flashcard display area */}
            <div style={flashcardPerspectiveStyle}>
              <div style={flashcardShellStyle}>
                <div style={flashcardTopStyle}>
                  <div style={themedQuestionLabelStyle}>Question</div>
                  <div style={styles.flashcardContentTop}>
                    <h2 style={styles.question}>{currentCard.question}</h2>
                  </div>
                </div>

                <div style={flashcardBottomStyle}>
                  <div style={styles.flashcardContentBottom}>
                    {/* Preview mode shows the full answer */}
                    {isPreview && currentCard.answer && (
                      <div style={styles.bottomSectionBlock}>
                        <div style={themedAnswerLabelStyle}>Full Answer</div>
                        <div
                          style={styles.noCopyAnswer}
                          onCopy={(e) => e.preventDefault()}
                          onCut={(e) => e.preventDefault()}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                        >
                          {currentCard.answer}
                        </div>
                        <div style={styles.autoHint}>
                          This card will continue automatically when the timer ends.
                        </div>
                      </div>
                    )}

                    {/* Test mode with blanked text */}
                    {isTest && currentCard.blanked_text && (
                      <div style={styles.bottomSectionBlock}>
                        <div style={themedAnswerLabelStyle}>Fill in the blanks</div>
                        <div
                          style={styles.noCopyText}
                          onCopy={(e) => e.preventDefault()}
                          onCut={(e) => e.preventDefault()}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                        >
                          {currentCard.blanked_text}
                        </div>
                      </div>
                    )}

                    {/* Main answer box shown when the user is expected to type an answer */}
                    {showAnswerBox && (
                      <form onSubmit={submitAnswer}>
                        <label style={themedLabelStyle}>Your Answer</label>
                        <textarea
                          value={userAnswer}
                          onChange={(e) => {
                            setUserAnswer(e.target.value);
                            if (inlineMessage) setInlineMessage("");
                          }}
                          style={styles.textarea}
                          placeholder="Type your answer here..."
                        />

                        {inlineMessage && (
                          <div style={styles.inlineWarning}>{inlineMessage}</div>
                        )}

                        <div style={styles.autoHint}>
                          If time reaches 0, your current answer will be submitted automatically.
                        </div>

                        <div style={styles.actionRow}>
                          <button
                            type="submit"
                            style={loading ? themedDisabledButtonStyle : themedButtonStyle}
                            disabled={loading}
                          >
                            {loading ? "Submitting..." : "Submit Answer"}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Fallback answer form for test states without blanked text */}
                    {!showAnswerBox && isTest && !currentCard.blanked_text && (
                      <form onSubmit={submitAnswer}>
                        <label style={themedLabelStyle}>Your Answer</label>
                        <textarea
                          value={userAnswer}
                          onChange={(e) => {
                            setUserAnswer(e.target.value);
                            if (inlineMessage) setInlineMessage("");
                          }}
                          style={styles.textarea}
                          placeholder="Type your answer here..."
                        />

                        {inlineMessage && (
                          <div style={styles.inlineWarning}>{inlineMessage}</div>
                        )}

                        <div style={styles.autoHint}>
                          If time reaches 0, your current answer will be submitted automatically.
                        </div>

                        <div style={styles.actionRow}>
                          <button
                            type="submit"
                            style={loading ? themedDisabledButtonStyle : themedButtonStyle}
                            disabled={loading}
                          >
                            {loading ? "Submitting..." : "Submit Answer"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Manual continue button shown during preview mode */}
            <div style={styles.actionRow}>
              {isPreview && currentCard.answer && (
                <button
                  type="button"
                  style={loading ? themedDisabledButtonStyle : themedButtonStyle}
                  onClick={() => loadNextCard()}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Continue Now"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Feedback panel shown after submitting an answer but before the session ends */}
        {feedback && !finished && (
          <div
            style={{
              ...styles.resultPanel,
              borderRadius: selectedSetTheme.border_radius,
              border: feedback.is_correct
                ? "1px solid rgba(34,197,94,0.45)"
                : "1px solid rgba(239,68,68,0.45)",
            }}
          >
            <div
              style={{
                ...styles.feedbackTitle,
                color: feedback.is_correct ? "#86efac" : "#fca5a5",
              }}
            >
              {feedback.is_correct ? "Correct" : "Incorrect"}
            </div>

            <div
              style={{
                ...styles.feedbackBlock,
                borderRadius: selectedSetTheme.border_radius,
                border: `1px solid ${selectedSetTheme.accent_color}`,
              }}
            >
              <div style={{ ...styles.answerLabel, color: selectedSetTheme.accent_color, opacity: 1 }}>
                Correct Answer
              </div>
              <div
                style={styles.noCopyAnswer}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
              >
                {feedback.correct_answer}
              </div>
            </div>

            <div style={styles.feedbackMeta}>
              Attempt Number: {feedback.attempt_number}
            </div>

            <div style={styles.actionRow}>
              <button
                type="button"
                style={themedButtonStyle}
                onClick={continueAfterFeedback}
              >
                Next Card
              </button>
            </div>
          </div>
        )}

        {/* Final session summary shown after the whole practice session finishes */}
        {finished && (
          <div
            style={{
              ...styles.resultPanel,
              borderRadius: selectedSetTheme.border_radius,
              border: `2px solid ${selectedSetTheme.accent_color}`,
            }}
          >
            <h2 style={styles.sectionTitle}>Session Finished</h2>

            {summary ? (
              <>
                {/* Summary metric cards */}
                <div style={styles.summaryGrid}>
                  <div
                    style={{
                      ...styles.summaryCard,
                      borderRadius: selectedSetTheme.border_radius,
                      border: `1px solid ${selectedSetTheme.accent_color}`,
                    }}
                  >
                    <div style={styles.summaryLabel}>Mode</div>
                    <div style={styles.summaryValue}>{summary.mode}</div>
                  </div>

                  <div
                    style={{
                      ...styles.summaryCard,
                      borderRadius: selectedSetTheme.border_radius,
                      border: `1px solid ${selectedSetTheme.accent_color}`,
                    }}
                  >
                    <div style={styles.summaryLabel}>Final Score</div>
                    <div style={styles.summaryValue}>{summary.final_score}</div>
                  </div>

                  <div
                    style={{
                      ...styles.summaryCard,
                      borderRadius: selectedSetTheme.border_radius,
                      border: `1px solid ${selectedSetTheme.accent_color}`,
                    }}
                  >
                    <div style={styles.summaryLabel}>Correct</div>
                    <div style={styles.summaryValue}>{summary.total_correct}</div>
                  </div>

                  <div
                    style={{
                      ...styles.summaryCard,
                      borderRadius: selectedSetTheme.border_radius,
                      border: `1px solid ${selectedSetTheme.accent_color}`,
                    }}
                  >
                    <div style={styles.summaryLabel}>Incorrect</div>
                    <div style={styles.summaryValue}>{summary.total_incorrect}</div>
                  </div>

                  <div
                    style={{
                      ...styles.summaryCard,
                      borderRadius: selectedSetTheme.border_radius,
                      border: `1px solid ${selectedSetTheme.accent_color}`,
                    }}
                  >
                    <div style={styles.summaryLabel}>Attempts</div>
                    <div style={styles.summaryValue}>{summary.total_attempts}</div>
                  </div>

                  <div
                    style={{
                      ...styles.summaryCard,
                      borderRadius: selectedSetTheme.border_radius,
                      border: `1px solid ${selectedSetTheme.accent_color}`,
                    }}
                  >
                    <div style={styles.summaryLabel}>Accuracy</div>
                    <div style={styles.summaryValue}>
                      {Math.round((summary.accuracy || 0) * 100)}%
                    </div>
                  </div>
                </div>

                {/* List of hardest cards returned by the summary */}
                {summary.top_hardest_cards?.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <h3 style={{ marginBottom: 12 }}>Hardest Cards</h3>
                    <div style={styles.hardestList}>
                      {summary.top_hardest_cards.map((card) => (
                        <div
                          key={card.flashcard_id}
                          style={{
                            ...styles.hardestCard,
                            borderRadius: selectedSetTheme.border_radius,
                            border: `1px solid ${selectedSetTheme.accent_color}`,
                          }}
                        >
                          <div style={styles.hardestQuestion}>
                            {card.question || `Flashcard ${card.flashcard_id}`}
                          </div>
                          <div style={styles.hardestRating}>
                            Difficulty: {Number(card.difficulty_rating).toFixed(1)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reminder prompt shown after finishing if the set does not already have reminders enabled */}
                {showReminderPrompt && (
                  <div style={styles.reminderPromptCard}>
                    <h3 style={styles.reminderPromptTitle}>
                      Would you like reminders for this set?
                    </h3>

                    <p style={styles.reminderPromptText}>
                      You can choose a manual reminder interval or let the app schedule reviews automatically.
                    </p>

                    <label style={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={reminderEnabled}
                        onChange={(e) => setReminderEnabled(e.target.checked)}
                      />
                      Enable reminders for this set
                    </label>

                    <label style={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={adaptiveReminderEnabled}
                        onChange={(e) => setAdaptiveReminderEnabled(e.target.checked)}
                        disabled={!reminderEnabled}
                      />
                      Use adaptive spaced repetition timing
                    </label>

                    <label style={styles.label}>Reminder Interval</label>
                    <select
                      value={reminderIntervalHours}
                      onChange={(e) => setReminderIntervalHours(Number(e.target.value))}
                      style={styles.input}
                      disabled={!reminderEnabled || adaptiveReminderEnabled}
                    >
                      <option value={6}>Every 6 hours</option>
                      <option value={12}>Every 12 hours</option>
                      <option value={24}>Every 1 day</option>
                      <option value={48}>Every 2 days</option>
                      <option value={72}>Every 3 days</option>
                      <option value={168}>Every 7 days</option>
                    </select>

                    {reminderMessage && (
                      <div style={styles.inlineReminderMessage}>{reminderMessage}</div>
                    )}

                    <div style={styles.actionRow}>
                      <button
                        type="button"
                        style={reminderSaving ? themedDisabledButtonStyle : themedButtonStyle}
                        onClick={saveSetReminderFromPractice}
                        disabled={reminderSaving}
                      >
                        {reminderSaving ? "Saving..." : "Save Reminder"}
                      </button>

                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={() => setShowReminderPrompt(false)}
                      >
                        Not Now
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p>No summary returned.</p>
            )}

            {/* Button for returning to the setup screen and starting another session */}
            <div style={styles.actionRow}>
              <button
                type="button"
                style={themedButtonStyle}
                onClick={resetPractice}
              >
                Start Another Session
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Centralised styles object for the Practice page.
// Keeps layout and appearance styling separate from the component logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },

  // Main content container
  container: {
    maxWidth: 980,
    margin: "0 auto",
  },

  // Header row layout
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 24,
  },

  // Main page title styling
  title: {
    margin: 0,
  },

  // Back link styling
  backLink: {
    color: "#93c5fd",
    textDecoration: "none",
    fontWeight: 600,
  },

  // Main section title styling
  sectionTitle: {
    marginTop: 0,
    marginBottom: 10,
  },

  // Supporting description text styling
  sectionDescription: {
    marginTop: 0,
    marginBottom: 18,
    opacity: 0.9,
    lineHeight: 1.5,
  },

  // Subsection title styling
  subsectionTitle: {
    fontWeight: 700,
    marginBottom: 14,
    fontSize: 16,
  },

  // Main setup card styling
  card: {
    background: "#121a2a",
    padding: 28,
    borderRadius: 14,
    marginBottom: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Explainer card styling
  explainerCard: {
    marginTop: 20,
    marginBottom: 8,
    padding: 20,
    borderRadius: 12,
    background: "#0f172a",
    border: "1px solid #23304c",
  },

  // Explainer section title styling
  explainerTitle: {
    marginTop: 0,
    marginBottom: 16,
    fontSize: 20,
  },

  // Explainer grid layout
  explainerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },

  // Individual explainer block styling
  explainerBlock: {
    background: "#111827",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: 14,
  },

  // Explainer step heading styling
  explainerStep: {
    fontWeight: 700,
    marginBottom: 8,
    color: "#93c5fd",
  },

  // Explainer paragraph styling
  explainerText: {
    margin: 0,
    lineHeight: 1.6,
    opacity: 0.92,
    fontSize: 14,
  },

  // Wrapper for the live session area
  practiceSessionArea: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    marginBottom: 20,
  },

  // Info panel styling above the flashcard
  infoPanel: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
  },

  // Perspective wrapper used for flashcard 3D animation
  flashcardPerspective: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
  },

  // Main animated flashcard shell
  flashcardShell: {
    overflow: "hidden",
    maxWidth: 760,
    width: "100%",
    margin: "0 auto",
    minHeight: 420,
    display: "flex",
    flexDirection: "column",
    transformStyle: "preserve-3d",
    transition:
      "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.55s ease, filter 0.55s ease",
    willChange: "transform",
    backfaceVisibility: "hidden",
  },

  // Top half of the flashcard
  flashcardTop: {
    padding: 28,
    minHeight: 180,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  // Bottom half of the flashcard
  flashcardBottom: {
    padding: 28,
    minHeight: 240,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  // Content alignment for the top half
  flashcardContentTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    textAlign: "center",
  },

  // Content alignment for the bottom half
  flashcardContentBottom: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    flex: 1,
  },

  // Shared result/summary panel styling
  resultPanel: {
    background: "#121a2a",
    padding: 28,
    marginBottom: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Bottom section spacing inside flashcards
  bottomSectionBlock: {
    marginBottom: 18,
  },

  // Advanced settings section styling
  advancedSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTop: "1px solid #23304c",
  },

  // Generic grid layout for form controls
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  },

  // Shared label styling
  label: {
    display: "block",
    marginBottom: 6,
    marginTop: 10,
    fontWeight: 600,
  },

  // Helper text styling
  helpText: {
    fontSize: 13,
    lineHeight: 1.45,
    opacity: 0.82,
    marginTop: 6,
  },

  // Shared input/select styling
  input: {
    width: "100%",
    padding: 11,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    marginBottom: 4,
    boxSizing: "border-box",
  },

  // Shared textarea styling
  textarea: {
    width: "100%",
    minHeight: 140,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    marginBottom: 12,
    resize: "vertical",
    boxSizing: "border-box",
  },

  // Shared action button styling
  button: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    background: "#3b82f6",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 8,
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    opacity: 1,
    outline: "none",
  },

  // Main start button styling
  startButton: {
    display: "block",
    width: "100%",
    maxWidth: 320,
    marginTop: 22,
    padding: "15px 22px",
    borderRadius: 10,
    border: "none",
    background: "#22c55e",
    color: "white",
    fontWeight: 800,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(34,197,94,0.25)",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    opacity: 1,
    outline: "none",
  },

  // Advanced toggle button styling
  advancedToggle: {
    marginTop: 18,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },

  // Error message styling
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    border: "1px solid rgba(239,68,68,0.25)",
  },

  // Timeout warning styling
  timeoutMessage: {
    background: "rgba(251,191,36,0.15)",
    color: "#fde68a",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    border: "1px solid rgba(251,191,36,0.4)",
    textAlign: "center",
    fontWeight: 600,
  },

  // Inline warning message styling
  inlineWarning: {
    background: "rgba(245,158,11,0.15)",
    color: "#fde68a",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    border: "1px solid rgba(245,158,11,0.25)",
  },

  // Checkbox group layout
  checkboxGroup: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 14,
    marginBottom: 10,
  },

  // Checkbox row layout
  checkboxRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },

  // Badge row layout
  badgeRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 16,
  },

  // Badge styling
  badge: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "#1e293b",
    fontSize: 13,
    fontWeight: 700,
  },

  // Progress wrapper styling
  progressWrap: {
    marginBottom: 18,
  },

  // Progress text styling
  progressText: {
    fontSize: 14,
    marginBottom: 8,
    opacity: 0.95,
  },

  // Outer progress bar styling
  progressBarOuter: {
    height: 10,
    width: "100%",
    background: "#0b1220",
    borderRadius: 999,
    overflow: "hidden",
    border: "1px solid #23304c",
  },

  // Inner progress bar styling
  progressBarInner: {
    height: "100%",
    background: "#3b82f6",
    borderRadius: 999,
  },

  // Timer card styling
  timerCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 12,
    padding: 16,
    marginBottom: 0,
    textAlign: "center",
  },

  // Timer label styling
  timerLabel: {
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 6,
  },

  // Timer value styling
  timerValue: {
    fontSize: 28,
    fontWeight: 800,
    transition: "color 0.4s ease",
  },

  // Timer progress outer bar
  timerProgressOuter: {
    marginTop: 14,
    height: 12,
    width: "100%",
    background: "#0b1220",
    borderRadius: 999,
    overflow: "hidden",
    border: "1px solid #23304c",
  },

  // Timer progress inner bar
  timerProgressInner: {
    height: "100%",
    borderRadius: 999,
    transition: "width 1s linear, background 0.4s ease",
  },

  // Question label styling
  questionLabel: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.8,
    marginBottom: 12,
    textAlign: "center",
  },

  // Main flashcard question styling
  question: {
    margin: 0,
    lineHeight: 1.5,
    fontSize: 28,
  },

  // Answer label styling
  answerLabel: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.8,
    marginBottom: 8,
    marginTop: 8,
  },

  // Styling for full answers where copying is disabled
  noCopyAnswer: {
    lineHeight: 1.7,
    fontSize: 18,
    userSelect: "none",
    WebkitUserSelect: "none",
    MozUserSelect: "none",
    msUserSelect: "none",
  },

  // Styling for clue/blank text where copying is disabled
  noCopyText: {
    lineHeight: 1.9,
    fontSize: 20,
    fontWeight: 600,
    whiteSpace: "pre-wrap",
    userSelect: "none",
    WebkitUserSelect: "none",
    MozUserSelect: "none",
    msUserSelect: "none",
  },

  // Hint text styling
  autoHint: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.85,
  },

  // Feedback title styling
  feedbackTitle: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 16,
  },

  // Feedback block styling
  feedbackBlock: {
    background: "#0b1220",
    border: "1px solid #23304c",
    padding: 16,
    marginBottom: 16,
  },

  // Feedback metadata styling
  feedbackMeta: {
    opacity: 0.9,
    marginBottom: 12,
  },

  // Summary grid layout
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
  },

  // Summary card styling
  summaryCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    padding: 16,
  },

  // Summary label styling
  summaryLabel: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.8,
    marginBottom: 8,
  },

  // Summary value styling
  summaryValue: {
    fontSize: 24,
    fontWeight: 800,
  },

  // Hardest cards list layout
  hardestList: {
    display: "grid",
    gap: 12,
  },

  // Hardest card styling
  hardestCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    padding: 16,
  },

  // Hardest card question styling
  hardestQuestion: {
    fontWeight: 700,
    marginBottom: 8,
  },

  // Hardest card difficulty label styling
  hardestRating: {
    opacity: 0.9,
  },

  // Shared centered action row styling
  actionRow: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  // Reminder prompt card styling
  reminderPromptCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 12,
    padding: 20,
    marginTop: 24,
  },

  // Reminder prompt title styling
  reminderPromptTitle: {
    marginTop: 0,
    marginBottom: 10,
  },

  // Reminder prompt description styling
  reminderPromptText: {
    marginTop: 0,
    marginBottom: 16,
    opacity: 0.9,
    lineHeight: 1.5,
  },

  // Inline reminder message styling
  inlineReminderMessage: {
    background: "rgba(59,130,246,0.15)",
    color: "#bfdbfe",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    border: "1px solid rgba(59,130,246,0.25)",
  },

  // Secondary button styling
  secondaryButton: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 8,
  },
};