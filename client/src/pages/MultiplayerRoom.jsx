// Import React hooks:
// useEffect is used for side effects such as loading room data, connecting sockets, and running timers,
// useMemo is used for memoised derived values,
// useRef is used to store mutable values that persist across renders without causing rerenders,
// useState is used to store local component state.
import { useEffect, useMemo, useRef, useState } from "react";

// Import React Router helpers:
// useParams reads the join code from the URL,
// Link is used for clickable navigation,
// useNavigate is used for programmatic navigation such as moving to a new room or back to sets.
import { useParams, Link, useNavigate } from "react-router-dom";

// Import the Socket.IO client so this multiplayer room can receive live room updates
import { io } from "socket.io-client";

// Import QRCodeCanvas so a QR code can be generated for easy room joining
import { QRCodeCanvas } from "qrcode.react";

// Import the background context so the user's selected background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Default theme values used when the set theme cannot be loaded
const DEFAULT_THEME = {
  top_color: "#121a2a",
  bottom_color: "#0b1220",
  text_color: "#ffffff",
  accent_color: "#3b82f6",
  border_radius: "12px",
};

// Configuration object describing the available multiplayer prompt types.
// These labels and descriptions are helpful for matching room behaviour to prompt settings.
const PROMPT_TYPES = {
  NORMAL_HIDDEN: {
    label: "Hidden Answer",
    description: "The full answer is hidden. You must recall it completely from memory.",
  },
  ALL_BLANK_FIRST_LETTERS: {
    label: "First Letter Clues",
    description: "All important words are hidden but the first letter is shown as a clue.",
  },
  RANDOM_BLANKS: {
    label: "Partial Blanks",
    description: "Some key words are hidden with their first letters visible.",
  },
  RANDOM_FULL_BLANKS: {
    label: "Random Blanks (No Clues)",
    description: "Some words are removed completely with no letter hints.",
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
  ALL_FULL_BLANKS: {
    label: "All Words Hidden",
    description: "All eligible words are removed. No hints are shown.",
  },
};

// Main page component for a live multiplayer room
export default function MultiplayerRoom() {
  // Read the join code from the URL
  const { joinCode } = useParams();

  // React Router navigation helper used to move between routes programmatically
  const navigate = useNavigate();

  // Read the auth token from localStorage so authenticated API/socket connections can be made
  const token = localStorage.getItem("token");

  // Reference to the active Socket.IO connection
  const socketRef = useRef(null);

  // Prevents multiple reconnect attempts from running at the same time
  const reconnectingRef = useRef(false);

  // Get the selected custom background from the shared background context
  const { selectedBackground } = useBackground();

  // Tracks whether the room is still loading
  const [loading, setLoading] = useState(true);

  // Stores the main room data returned by the backend
  const [room, setRoom] = useState(null);

  // Stores the list of room participants
  const [participants, setParticipants] = useState([]);

  // Stores the current room step/card/phase data
  const [currentStep, setCurrentStep] = useState(null);

  // Stores which participants have answered the current card
  const [answeredParticipants, setAnsweredParticipants] = useState([]);

  // Stores the local user's typed answer
  const [answer, setAnswer] = useState("");

  // Stores page-level error or status messages
  const [message, setMessage] = useState("");

  // Stores inline validation messages such as empty answer warnings
  const [inlineMessage, setInlineMessage] = useState("");

  // Stores the user's answer feedback after submission
  const [feedback, setFeedback] = useState(null);

  // Stores the final leaderboard after the room finishes
  const [finishedLeaderboard, setFinishedLeaderboard] = useState(null);

  // Stores the current local timer countdown in seconds
  const [localSeconds, setLocalSeconds] = useState(null);

  // Stores the timer's initial/max seconds so the progress bar can be calculated
  const [timerMaxSeconds, setTimerMaxSeconds] = useState(null);

  // Stores the active set theme so the room matches the selected set appearance
  const [setTheme, setSetTheme] = useState(DEFAULT_THEME);

  // Tracks the current socket/room connection state
  const [connectionState, setConnectionState] = useState("connected");

  // Tracks which host/player action button is currently running
  const [actionLoading, setActionLoading] = useState("");

  // Controls whether the flashcard is currently animating between phases
  const [isFlipping, setIsFlipping] = useState(false);

  // Stores the direction of the flip animation
  const [flipDirection, setFlipDirection] = useState("forward");

  // Stores the previous phase so phase changes can trigger a flip animation
  const previousPhaseRef = useRef(null);

  // Stores the timeout ID for clearing flip animation state
  const flipTimeoutRef = useRef(null);

  // Normalise the room code from the URL into uppercase for consistent matching and requests
  const code = useMemo(() => String(joinCode || "").toUpperCase(), [joinCode]);

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

  // Loads the selected set's visual theme from the backend so room cards match the set styling
  async function loadSetTheme(setId) {
    if (!setId || !token) {
      setSetTheme(DEFAULT_THEME);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/sets/${setId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSetTheme(DEFAULT_THEME);
        return;
      }

      setSetTheme({
        top_color: data?.top_color || DEFAULT_THEME.top_color,
        bottom_color: data?.bottom_color || DEFAULT_THEME.bottom_color,
        text_color: data?.text_color || DEFAULT_THEME.text_color,
        accent_color: data?.accent_color || DEFAULT_THEME.accent_color,
        border_radius: data?.border_radius || DEFAULT_THEME.border_radius,
      });
    } catch {
      setSetTheme(DEFAULT_THEME);
    }
  }

  // Applies a full room state payload from the backend or socket into component state
  function applyState(state) {
    setRoom(state.room || null);
    setParticipants(Array.isArray(state.participants) ? state.participants : []);
    setCurrentStep(state.current_step || null);
    setAnsweredParticipants(
      Array.isArray(state.answered_participants) ? state.answered_participants : []
    );
    setFinishedLeaderboard(state.finished_leaderboard || null);
    setConnectionState(state.room?.connection_status || "connected");
    setLoading(false);

    // Load the set theme whenever the room state contains a set ID
    if (state.room?.set_id) {
      loadSetTheme(state.room.set_id);
    }

    // Work out which timer value should be displayed based on phase and room state
    const nextTimer =
      state.current_step?.reveal_seconds ??
      state.current_step?.display_time_per_card ??
      state.current_step?.answer_time_limit ??
      state.room?.seconds_remaining ??
      null;

    const timerValue =
      state.room?.seconds_remaining !== null &&
      state.room?.seconds_remaining !== undefined
        ? Number(state.room.seconds_remaining)
        : nextTimer !== null && nextTimer !== undefined
        ? Math.ceil(Number(nextTimer))
        : null;

    setLocalSeconds(timerValue);
    setTimerMaxSeconds(timerValue);

    // Clear local answer/feedback when leaving test mode
    if (state.current_step?.phase !== "TEST") {
      setAnswer("");
      setFeedback(null);
      setInlineMessage("");
    }

    // Also clear feedback when entering test mode and the local viewer has not answered yet
    if (state.current_step?.phase === "TEST" && !state.room?.has_answered_current_card) {
      setFeedback(null);
    }
  }

  // Initial one-time room load from the backend
  async function loadRoomOnce() {
    try {
      setLoading(true);

      const res = await fetch(`${API_URL}/api/multiplayer/rooms/${code}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data?.message || "Failed to load room");
        return;
      }

      applyState(data);
    } catch {
      setMessage("Server error while loading room");
    } finally {
      setLoading(false);
    }
  }

  // Reconnects the user to the room after a reconnect event or socket reconnect
  async function reconnectRoom() {
    if (reconnectingRef.current) return;
    reconnectingRef.current = true;

    try {
      setConnectionState("reconnecting");

      const res = await fetch(`${API_URL}/api/multiplayer/rooms/${code}/reconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setConnectionState("disconnected");
        setMessage(data?.message || "Failed to reconnect to the room");
        return;
      }

      applyState(data);
      setConnectionState("connected");
    } catch {
      setConnectionState("disconnected");
      setMessage("Failed to reconnect to the room");
    } finally {
      reconnectingRef.current = false;
    }
  }

  // Load the room whenever the join code changes
  useEffect(() => {
    loadRoomOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Create and manage the Socket.IO connection for live room updates
  useEffect(() => {
    const socket = io(API_URL, {
      transports: ["websocket"],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // When connected, join the room and request a reconnect state refresh
    socket.on("connect", async () => {
      setConnectionState("connected");
      socket.emit("room:join", { joinCode: code });
      await reconnectRoom();
    });

    // Update connection state when disconnected
    socket.on("disconnect", () => {
      setConnectionState("disconnected");
    });

    // Update connection state during reconnect attempts
    socket.on("reconnect_attempt", () => {
      setConnectionState("reconnecting");
    });

    // Handle general room state broadcasts
    socket.on("room:state", (state) => {
      if (!state?.room?.join_code || String(state.room.join_code).toUpperCase() !== code) {
        return;
      }
      applyState(state);
    });

    // Handle personal room state events targeted specifically to this viewer
    socket.on("room:state:personal", (payload) => {
      if (!payload?.joinCode || String(payload.joinCode).toUpperCase() !== code) {
        return;
      }
      if (!payload?.state) return;
      applyState(payload.state);
    });

    // Handle socket connection errors
    socket.on("connect_error", (err) => {
      setConnectionState("disconnected");
      setMessage(err?.message || "Socket connection failed");
    });

    // Cleanup when leaving the page
    return () => {
      socket.emit("room:leave", { joinCode: code });
      socket.disconnect();
    };
  }, [code, token]);

  // Local countdown timer for room phases
  useEffect(() => {
    if (localSeconds === null || localSeconds <= 0) return;

    const interval = setInterval(() => {
      setLocalSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [localSeconds]);

  // Trigger a flip animation whenever the room phase changes
  useEffect(() => {
    if (!currentStep?.phase) return;

    const previousPhase = previousPhaseRef.current;

    if (previousPhase && previousPhase !== currentStep.phase) {
      setFlipDirection(currentStep.phase === "TEST" ? "forward" : "backward");
      setIsFlipping(true);

      if (flipTimeoutRef.current) {
        clearTimeout(flipTimeoutRef.current);
      }

      flipTimeoutRef.current = setTimeout(() => {
        setIsFlipping(false);
      }, 550);
    }

    previousPhaseRef.current = currentStep.phase;

    return () => {
      if (flipTimeoutRef.current) {
        clearTimeout(flipTimeoutRef.current);
      }
    };
  }, [currentStep?.phase]);

  // Host action: start the multiplayer room
  async function startRoom() {
    setMessage("");
    setActionLoading("start");

    try {
      const res = await fetch(`${API_URL}/api/multiplayer/rooms/${code}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data?.message || "Failed to start room");
        return;
      }

      setFeedback(null);
      setAnswer("");
      setInlineMessage("");
    } finally {
      setActionLoading("");
    }
  }

  // Host action: close the lobby before the game starts
  async function closeLobby() {
    setMessage("");
    setActionLoading("close");

    try {
      const res = await fetch(`${API_URL}/api/multiplayer/rooms/${code}/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data?.message || "Failed to close lobby");
        return;
      }
    } finally {
      setActionLoading("");
    }
  }

  // Host action: end a live room early
  async function endRoom() {
    setMessage("");
    setActionLoading("end");

    try {
      const res = await fetch(`${API_URL}/api/multiplayer/rooms/${code}/end`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data?.message || "Failed to end room");
        return;
      }
    } finally {
      setActionLoading("");
    }
  }

  // Host action: create a new room using the same settings after finishing
  async function playAgain() {
    setMessage("");
    setActionLoading("play_again");

    try {
      const res = await fetch(`${API_URL}/api/multiplayer/rooms/${code}/play-again`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data?.message || "Failed to create new room");
        return;
      }

      const nextCode = data?.room?.join_code;
      if (nextCode) {
        navigate(`/multiplayer/room/${nextCode}`);
      }
    } finally {
      setActionLoading("");
    }
  }

  // Player action: submit an answer during test phase
  async function submitAnswer(e) {
    if (e) e.preventDefault();
    setMessage("");
    setFeedback(null);
    setInlineMessage("");

    // Prevent duplicate submissions or answer input from non-playing viewers
    if (room?.has_answered_current_card || !room?.is_viewer_playing) return;

    const trimmed = answer.trim();
    if (!trimmed) {
      setInlineMessage("You must type an answer.");
      return;
    }

    const res = await fetch(`${API_URL}/api/multiplayer/rooms/${code}/answer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_answer: trimmed,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage(data?.message || "Failed to submit answer");
      return;
    }

    setFeedback(data);
  }

  // Copies the room join link to the user's clipboard
  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setMessage("Join link copied.");
    } catch {
      setMessage("Could not copy the join link.");
    }
  }

  // Derived booleans used throughout the UI for clearer conditional rendering
  const isHost = !!room?.is_viewer_host;
  const isPlaying = !!room?.is_viewer_playing;
  const isPreview = currentStep?.phase === "PREVIEW";
  const isTest = currentStep?.phase === "TEST";
  const isResult = currentStep?.phase === "RESULT";
  const leaderboardRows = finishedLeaderboard || [];

  // Sort participants so the host appears first, then by score descending
  const sortedParticipants = [...participants].sort((a, b) => {
    if (Number(a.is_host) === 1 && Number(b.is_host) !== 1) return -1;
    if (Number(a.is_host) !== 1 && Number(b.is_host) === 1) return 1;
    return Number(b.score || 0) - Number(a.score || 0);
  });

  // Count how many participants are active players
  const playingCount = sortedParticipants.filter(
    (p) => Number(p.is_playing) === 1
  ).length;

  // Build a lookup set for quickly checking who has answered this round
  const answeredSet = new Set(answeredParticipants.map((p) => Number(p.participant_id)));

  // Whether the local viewer has already answered this card
  const hasAnswered = !!room?.has_answered_current_card;

  // Build a readable timer label depending on the room phase
  const timerLabel = useMemo(() => {
    if (!currentStep) return "";
    if (currentStep.phase === "RESULT") return "Result time remaining";
    if (currentStep.reveal_seconds) return "Preview time remaining";
    if (currentStep.display_time_per_card) return "Display time remaining";
    if (currentStep.answer_time_limit) return "Answer time remaining";
    return "Time remaining";
  }, [currentStep]);

  // Returns the timer colour based on how much time remains
  function getTimerColor() {
    if (localSeconds === null || !timerMaxSeconds) return "#22c55e";

    const ratio = localSeconds / timerMaxSeconds;

    if (ratio > 0.6) return "#22c55e";
    if (ratio > 0.3) return "#f59e0b";
    return "#ef4444";
  }

  // Returns the progress percentage for the timer bar
  function getTimerProgressPercent() {
    if (localSeconds === null || !timerMaxSeconds || timerMaxSeconds <= 0) {
      return 100;
    }
    return Math.max(0, Math.min(100, (localSeconds / timerMaxSeconds) * 100));
  }

  // Renders progress UI for the room using whatever progress format the backend returned
  function renderProgress() {
    if (!currentStep) return null;

    if (currentStep.progress?.current && currentStep.progress?.total) {
      const value = Math.round(
        (currentStep.progress.current / currentStep.progress.total) * 100
      );

      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>
            Card {currentStep.progress.current} of {currentStep.progress.total}
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${value}%`,
                background: setTheme.accent_color,
              }}
            />
          </div>
        </div>
      );
    }

    if (currentStep.progress?.in_group && currentStep.progress?.group_total) {
      const value = Math.round(
        (currentStep.progress.in_group / currentStep.progress.group_total) * 100
      );

      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>
            Group card {currentStep.progress.in_group} of {currentStep.progress.group_total}
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${value}%`,
                background: setTheme.accent_color,
              }}
            />
          </div>
        </div>
      );
    }

    if (
      currentStep.progress?.answered_in_group &&
      currentStep.progress?.group_total
    ) {
      const value = Math.round(
        (currentStep.progress.answered_in_group / currentStep.progress.group_total) * 100
      );

      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>
            Test card {currentStep.progress.answered_in_group} of {currentStep.progress.group_total}
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${value}%`,
                background: setTheme.accent_color,
              }}
            />
          </div>
        </div>
      );
    }

    if (currentStep.progress?.index && currentStep.progress?.total) {
      const value = Math.round(
        (currentStep.progress.index / currentStep.progress.total) * 100
      );

      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>
            Preview {currentStep.progress.index} of {currentStep.progress.total}
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${value}%`,
                background: setTheme.accent_color,
              }}
            />
          </div>
        </div>
      );
    }

    if (
      currentStep.progress?.remaining !== undefined &&
      currentStep.progress?.total
    ) {
      const completed = currentStep.progress.total - currentStep.progress.remaining;
      const value = Math.round((completed / currentStep.progress.total) * 100);

      return (
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>
            Completed {completed} of {currentStep.progress.total}
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${value}%`,
                background: setTheme.accent_color,
              }}
            />
          </div>
        </div>
      );
    }

    return null;
  }

  // Dynamic styling for the flashcard perspective wrapper
  const flashcardPerspectiveStyle = {
    ...styles.flashcardPerspective,
    perspective: "1800px",
  };

  // Dynamic styling for the animated flashcard shell
  const flashcardShellStyle = {
    ...styles.flashcardShell,
    borderRadius: setTheme.border_radius,
    border: `2px solid ${setTheme.accent_color}`,
    transform: isFlipping
      ? `rotateY(${flipDirection === "forward" ? "180deg" : "-180deg"}) scale(0.985)`
      : "rotateY(0deg) scale(1)",
    boxShadow: isFlipping
      ? `0 22px 50px rgba(0,0,0,0.38), 0 0 0 2px ${setTheme.accent_color}33`
      : "0 16px 40px rgba(0,0,0,0.32)",
    filter: isFlipping ? "brightness(1.06)" : "brightness(1)",
  };

  // Dynamic styling for the flashcard top half
  const flashcardTopStyle = {
    ...styles.flashcardTop,
    background: setTheme.top_color,
    color: setTheme.text_color,
  };

  // Dynamic styling for the flashcard bottom half
  const flashcardBottomStyle = {
    ...styles.flashcardBottom,
    background: setTheme.bottom_color,
    color: setTheme.text_color,
    borderTop: `1px solid ${setTheme.accent_color}`,
  };

  // Standard active button styling used throughout the room UI
  const themedButtonStyle = {
    ...styles.button,
    backgroundColor: "#3b82f6",
    color: "#ffffff",
    border: "none",
    opacity: 1,
    filter: "none",
    WebkitTextFillColor: "#ffffff",
  };

  // Disabled button styling used throughout the room UI
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

  // Active green start button styling for host actions
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

  // Disabled green start button styling
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

  // Dynamic label styling that matches the current set theme
  const themedLabelStyle = {
    ...styles.label,
    color: setTheme.text_color,
  };

  // Dynamic answer label styling that uses the set accent colour
  const themedAnswerLabelStyle = {
    ...styles.answerLabel,
    color: setTheme.accent_color,
    opacity: 1,
  };

  // Dynamic question label styling that uses the set accent colour
  const themedQuestionLabelStyle = {
    ...styles.questionLabel,
    color: setTheme.accent_color,
    opacity: 1,
  };

  // Build the shareable join URL for this room
  const joinUrl = `${window.location.origin}/multiplayer/join/${code}`;

  // Render the Multiplayer Room page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header row with page title and navigation back to sets */}
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Multiplayer Practice</h1>

          <Link to="/sets" style={styles.backLink}>
            Back to Sets
          </Link>
        </div>

        {/* Show connection status whenever the room is reconnecting or disconnected */}
        {connectionState !== "connected" && (
          <div style={styles.timeoutMessage}>
            {connectionState === "reconnecting"
              ? "Reconnecting to room..."
              : "Disconnected from room. Attempting to reconnect."}
          </div>
        )}

        {/* General room message area */}
        {message && <div style={styles.error}>{message}</div>}

        {/* Closed lobby state */}
        {room?.status === "CLOSED" && (
          <div style={styles.resultPanel}>
            <h2 style={styles.sectionTitle}>Lobby Closed</h2>
            <p>The host closed this lobby before the game started.</p>
          </div>
        )}

        {/* Lobby screen before the game starts */}
        {room?.status === "LOBBY" && (
          <div style={styles.practiceSessionArea}>
            <div style={styles.infoPanel}>
              <div style={styles.badgeRow}>
                <span style={styles.badge}>LOBBY</span>
                <span
                  style={{
                    ...styles.badge,
                    background: isHost ? "#7c3aed" : "#334155",
                  }}
                >
                  {isHost ? "HOST" : "PLAYER"}
                </span>
                <span style={styles.badge}>{room?.difficulty_mode}</span>
              </div>

              <div style={styles.progressWrap}>
                <div style={styles.progressText}>Players joined: {playingCount}</div>
                <div style={styles.progressBarOuter}>
                  <div
                    style={{
                      ...styles.progressBarInner,
                      width: "100%",
                      background: setTheme.accent_color,
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  ...styles.timerCard,
                  borderRadius: setTheme.border_radius,
                  border: `1px solid ${setTheme.accent_color}`,
                }}
              >
                <div style={styles.timerLabel}>Room Code</div>
                <div style={{ ...styles.timerValue, color: setTheme.accent_color }}>
                  {code}
                </div>
              </div>
            </div>

            {/* Main lobby card with join link and QR code */}
            <div style={flashcardPerspectiveStyle}>
              <div style={flashcardShellStyle}>
                <div style={flashcardTopStyle}>
                  <div style={themedQuestionLabelStyle}>Lobby</div>
                  <div style={styles.flashcardContentTop}>
                    <h2 style={styles.question}>Players can join now</h2>
                  </div>
                </div>

                <div style={flashcardBottomStyle}>
                  <div style={styles.flashcardContentBottom}>
                    <div style={styles.bottomSectionBlock}>
                      <div style={themedAnswerLabelStyle}>Join Link</div>
                      <div style={styles.linkBox}>{joinUrl}</div>
                      <div style={styles.actionRow}>
                        <button
                          type="button"
                          style={themedButtonStyle}
                          onClick={copyJoinLink}
                        >
                          Copy Link
                        </button>
                      </div>
                    </div>

                    <div style={styles.bottomSectionBlock}>
                      <div style={themedAnswerLabelStyle}>Join QR</div>
                      <div style={styles.qrWrap}>
                        <QRCodeCanvas value={joinUrl} size={220} />
                      </div>
                    </div>

                    <div style={styles.autoHint}>
                      Players can join from the QR code or enter the room code manually.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Lobby participant list and host controls */}
            <div style={styles.card}>
              <h3 style={styles.sectionTitle}>Room Members</h3>
              <div style={styles.hardestList}>
                {sortedParticipants.map((p) => (
                  <div
                    key={p.participant_id}
                    style={{
                      ...styles.hardestCard,
                      borderRadius: setTheme.border_radius,
                      border: `1px solid ${setTheme.accent_color}`,
                    }}
                  >
                    <div style={styles.hardestQuestion}>
                      {p.display_name}
                      {Number(p.is_host) === 1 ? " (Host)" : ""}
                      {Number(p.is_playing) === 0 ? " (Controller)" : ""}
                    </div>
                    <div style={styles.hardestRating}>
                      {Number(p.is_playing) === 1 ? `Score: ${p.score}` : "Not playing"}
                    </div>
                  </div>
                ))}
              </div>

              {isHost ? (
                <div style={styles.actionRow}>
                  <button
                    type="button"
                    style={actionLoading === "start" ? themedDisabledStartButtonStyle : themedStartButtonStyle}
                    onClick={startRoom}
                    disabled={actionLoading === "start"}
                  >
                    {actionLoading === "start" ? "Starting..." : "Start Game"}
                  </button>

                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={closeLobby}
                    disabled={actionLoading === "close"}
                  >
                    {actionLoading === "close" ? "Closing..." : "Close Lobby"}
                  </button>
                </div>
              ) : (
                <div style={styles.autoHint}>
                  Waiting for the host to start the game...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live gameplay screen */}
        {room?.status === "LIVE" && currentStep && (
          <div style={styles.practiceSessionArea}>
            <div style={styles.infoPanel}>
              <div style={styles.badgeRow}>
                <span style={styles.badge}>
                  {currentStep.difficulty_mode || room?.difficulty_mode}
                </span>
                <span
                  style={{
                    ...styles.badge,
                    background: isPreview ? "#14532d" : isResult ? "#7c2d12" : "#1e3a8a",
                  }}
                >
                  {currentStep.phase}
                </span>
                {currentStep.group?.index && (
                  <span style={styles.badge}>Group {currentStep.group.index}</span>
                )}
                <span
                  style={{
                    ...styles.badge,
                    background: isHost ? "#7c3aed" : "#334155",
                  }}
                >
                  {isHost ? "HOST" : "PLAYER"}
                </span>
              </div>

              {renderProgress()}

              {localSeconds !== null && (
                <div
                  style={{
                    ...styles.timerCard,
                    borderRadius: setTheme.border_radius,
                    border: `1px solid ${setTheme.accent_color}`,
                  }}
                >
                  <div style={styles.timerLabel}>{timerLabel}</div>

                  <div
                    style={{
                      ...styles.timerValue,
                      color: getTimerColor(),
                    }}
                  >
                    {localSeconds}s
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

            {/* Main live gameplay flashcard */}
            <div style={flashcardPerspectiveStyle}>
              <div style={flashcardShellStyle}>
                <div style={flashcardTopStyle}>
                  <div style={themedQuestionLabelStyle}>
                    {isResult ? "Result" : "Question"}
                  </div>
                  <div style={styles.flashcardContentTop}>
                    <h2 style={styles.question}>{currentStep.question}</h2>
                  </div>
                </div>

                <div style={flashcardBottomStyle}>
                  <div style={styles.flashcardContentBottom}>
                    {/* Preview phase content */}
                    {isPreview && currentStep.answer && (
                      <div style={styles.bottomSectionBlock}>
                        <div style={themedAnswerLabelStyle}>Full Answer</div>
                        <div
                          style={styles.noCopyAnswer}
                          onCopy={(e) => e.preventDefault()}
                          onCut={(e) => e.preventDefault()}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                        >
                          {currentStep.answer}
                        </div>
                        <div style={styles.autoHint}>
                          This card will continue automatically when the timer ends.
                        </div>
                      </div>
                    )}

                    {/* Test phase blanked text content */}
                    {isTest && currentStep.blanked_text && (
                      <div style={styles.bottomSectionBlock}>
                        <div style={themedAnswerLabelStyle}>Fill in the blanks</div>
                        <div
                          style={styles.noCopyText}
                          onCopy={(e) => e.preventDefault()}
                          onCut={(e) => e.preventDefault()}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                        >
                          {currentStep.blanked_text}
                        </div>
                      </div>
                    )}

                    {/* Test phase answer input for active players */}
                    {isTest && isPlaying && (
                      <form onSubmit={submitAnswer}>
                        <label style={themedLabelStyle}>Your Answer</label>
                        <textarea
                          value={answer}
                          onChange={(e) => {
                            setAnswer(e.target.value);
                            if (inlineMessage) setInlineMessage("");
                          }}
                          style={styles.textarea}
                          placeholder="Type your answer here..."
                          disabled={hasAnswered}
                        />

                        {inlineMessage && (
                          <div style={styles.inlineWarning}>{inlineMessage}</div>
                        )}

                        <div style={styles.autoHint}>
                          Submit your answer before the timer ends.
                        </div>

                        <div style={styles.actionRow}>
                          <button
                            type="submit"
                            style={
                              loading || hasAnswered
                                ? themedDisabledButtonStyle
                                : themedButtonStyle
                            }
                            disabled={loading || hasAnswered}
                          >
                            {hasAnswered
                              ? "Answer Submitted"
                              : loading
                              ? "Submitting..."
                              : "Submit Answer"}
                          </button>
                        </div>

                        {feedback && (
                          <div style={styles.inlineSubmitted}>
                            Answer submitted. Waiting for other players...
                          </div>
                        )}
                      </form>
                    )}

                    {/* Host/controller view during test phase */}
                    {isTest && !isPlaying && (
                      <div style={styles.bottomSectionBlock}>
                        <div style={themedAnswerLabelStyle}>Host View</div>
                        <div style={styles.noCopyAnswer}>
                          Players are currently answering this question.
                        </div>
                        <div style={styles.autoHint}>
                          The room will continue automatically when all players have answered or time runs out.
                        </div>
                      </div>
                    )}

                    {/* Result phase content */}
                    {isResult && (
                      <div style={styles.bottomSectionBlock}>
                        <div style={themedAnswerLabelStyle}>Correct Answer</div>
                        <div
                          style={styles.noCopyAnswer}
                          onCopy={(e) => e.preventDefault()}
                          onCut={(e) => e.preventDefault()}
                          onContextMenu={(e) => e.preventDefault()}
                          onDragStart={(e) => e.preventDefault()}
                        >
                          {currentStep.correct_answer}
                        </div>

                        {isPlaying && currentStep.viewer_result && (
                          <>
                            <div style={themedAnswerLabelStyle}>Your Result</div>
                            <div
                              style={{
                                ...styles.resultStatus,
                                color: currentStep.viewer_result.is_correct ? "#86efac" : "#fca5a5",
                              }}
                            >
                              {currentStep.viewer_result.is_correct ? "Correct" : "Incorrect"}
                            </div>

                            <div style={styles.autoHint}>
                              Your answer: {currentStep.viewer_result.user_answer || "No answer"}
                            </div>
                          </>
                        )}

                        {!isPlaying && (
                          <div style={styles.autoHint}>
                            Results are being shown to all players before the next card starts.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Live participant scoreboard */}
            <div style={styles.card}>
              <h3 style={styles.sectionTitle}>Players</h3>
              <div style={styles.hardestList}>
                {sortedParticipants.map((p) => {
                  const answeredNow =
                    Number(p.is_playing) === 1 &&
                    isTest &&
                    answeredSet.has(Number(p.participant_id));

                  return (
                    <div
                      key={p.participant_id}
                      style={{
                        ...styles.hardestCard,
                        borderRadius: setTheme.border_radius,
                        border: `1px solid ${setTheme.accent_color}`,
                      }}
                    >
                      <div style={styles.hardestQuestion}>
                        {p.display_name}
                        {Number(p.is_host) === 1 ? " (Host)" : ""}
                        {Number(p.is_playing) === 0 ? " (Controller)" : ""}
                        {answeredNow ? " • Answered" : ""}
                      </div>
                      <div style={styles.hardestRating}>
                        {Number(p.is_playing) === 1 ? `Score: ${p.score}` : "Not playing"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {isHost && (
                <div style={styles.actionRow}>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={endRoom}
                    disabled={actionLoading === "end"}
                  >
                    {actionLoading === "end" ? "Ending..." : "End Room"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Finished room screen with leaderboard */}
        {room?.status === "FINISHED" && (
          <div
            style={{
              ...styles.resultPanel,
              borderRadius: setTheme.border_radius,
              border: `2px solid ${setTheme.accent_color}`,
            }}
          >
            <h2 style={styles.sectionTitle}>Session Finished</h2>

            <div style={styles.summaryGrid}>
              <div
                style={{
                  ...styles.summaryCard,
                  borderRadius: setTheme.border_radius,
                  border: `1px solid ${setTheme.accent_color}`,
                }}
              >
                <div style={styles.summaryLabel}>Mode</div>
                <div style={styles.summaryValue}>{room?.difficulty_mode}</div>
              </div>

              <div
                style={{
                  ...styles.summaryCard,
                  borderRadius: setTheme.border_radius,
                  border: `1px solid ${setTheme.accent_color}`,
                }}
              >
                <div style={styles.summaryLabel}>Players</div>
                <div style={styles.summaryValue}>{playingCount}</div>
              </div>
            </div>

            {leaderboardRows.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ marginBottom: 12 }}>Leaderboard</h3>
                <div style={styles.hardestList}>
                  {leaderboardRows.map((player, index) => (
                    <div
                      key={player.participant_id}
                      style={{
                        ...styles.hardestCard,
                        borderRadius: setTheme.border_radius,
                        border: `1px solid ${setTheme.accent_color}`,
                      }}
                    >
                      <div style={styles.hardestQuestion}>
                        #{index + 1} {player.display_name}
                      </div>
                      <div style={styles.hardestRating}>
                        Score: {player.score}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={styles.actionRow}>
              {isHost && (
                <button
                  type="button"
                  style={themedButtonStyle}
                  onClick={playAgain}
                  disabled={actionLoading === "play_again"}
                >
                  {actionLoading === "play_again" ? "Creating..." : "Play Again"}
                </button>
              )}

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => navigate("/sets")}
              >
                Back to Sets
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Centralised styles object for the Multiplayer Room page.
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

  // Shared section title styling
  sectionTitle: {
    marginTop: 0,
    marginBottom: 10,
  },

  // Standard card styling
  card: {
    background: "#121a2a",
    padding: 28,
    borderRadius: 14,
    marginBottom: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Wrapper for the live room content area
  practiceSessionArea: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    marginBottom: 20,
  },

  // Info panel styling
  infoPanel: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
  },

  // Perspective wrapper for card animation
  flashcardPerspective: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
  },

  // Animated flashcard shell
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

  // Content alignment for the top section
  flashcardContentTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    textAlign: "center",
  },

  // Content alignment for the bottom section
  flashcardContentBottom: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    flex: 1,
  },

  // Shared result panel styling
  resultPanel: {
    background: "#121a2a",
    padding: 28,
    marginBottom: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Standard spacing block inside flashcards
  bottomSectionBlock: {
    marginBottom: 18,
  },

  // Error/status message styling
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    border: "1px solid rgba(239,68,68,0.25)",
  },

  // Reconnect/warning message styling
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

  // Inline validation warning styling
  inlineWarning: {
    background: "rgba(245,158,11,0.15)",
    color: "#fde68a",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    border: "1px solid rgba(245,158,11,0.25)",
  },

  // Inline submitted status styling
  inlineSubmitted: {
    background: "rgba(59,130,246,0.15)",
    color: "#bfdbfe",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    border: "1px solid rgba(59,130,246,0.25)",
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

  // Main question styling
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

  // Styling for full answers where copying is blocked
  noCopyAnswer: {
    lineHeight: 1.7,
    fontSize: 18,
    userSelect: "none",
    WebkitUserSelect: "none",
    MozUserSelect: "none",
    msUserSelect: "none",
  },

  // Styling for blanked/clue text where copying is blocked
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

  // Styling for the join URL box where copying is allowed
  linkBox: {
    lineHeight: 1.7,
    fontSize: 16,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    background: "#0b1220",
    border: "1px solid #23304c",
    borderRadius: 10,
    padding: 12,
    userSelect: "text",
    WebkitUserSelect: "text",
    MozUserSelect: "text",
    msUserSelect: "text",
    cursor: "text",
  },

  // Small supporting hint text styling
  autoHint: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.85,
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

  // Shared list layout used for participants/leaderboard
  hardestList: {
    display: "grid",
    gap: 12,
  },

  // Shared participant/leaderboard card styling
  hardestCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    padding: 16,
  },

  // Primary text styling inside participant/leaderboard cards
  hardestQuestion: {
    fontWeight: 700,
    marginBottom: 8,
  },

  // Secondary text styling inside participant/leaderboard cards
  hardestRating: {
    opacity: 0.9,
  },

  // Shared centered action row
  actionRow: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  // Shared label styling for inputs
  label: {
    display: "block",
    marginBottom: 6,
    marginTop: 10,
    fontWeight: 600,
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

  // Shared main button styling
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

  // Shared green start button styling
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

  // QR code wrapper styling
  qrWrap: {
    background: "white",
    display: "inline-block",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },

  // Result text styling used in result phase
  resultStatus: {
    fontSize: 24,
    fontWeight: 800,
    marginTop: 10,
  },
};