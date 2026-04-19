// Import React hooks:
// useEffect runs side effects when the component loads or when values change,
// useMemo caches calculated values so they are not recomputed unnecessarily,
// useRef stores mutable values that persist between renders without causing rerenders,
// useState stores local component state.
import { useEffect, useMemo, useRef, useState } from "react";

// Import Link so the page can include navigation back to the home page
import { Link } from "react-router-dom";

// Import the background context so the selected user background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Main Calibration page component
export default function Calibration() {
  // Read the authentication token from localStorage so protected API requests can be made
  const token = localStorage.getItem("token");

  // Stores the list of calibration prompts returned by the backend
  const [prompts, setPrompts] = useState([]);

  // Tracks which prompt the user is currently viewing
  const [currentIndex, setCurrentIndex] = useState(0);

  // Stores the user's currently saved calibration data from the backend
  const [calibration, setCalibration] = useState(null);

  // Tracks whether prompt data is still loading
  const [loadingPrompts, setLoadingPrompts] = useState(true);

  // Tracks whether saved calibration data is still loading
  const [loadingCalibration, setLoadingCalibration] = useState(true);

  // Indicates whether the reading timer is actively running
  const [running, setRunning] = useState(false);

  // Indicates whether the calibration session has officially started
  const [started, setStarted] = useState(false);

  // Indicates whether the user has finished reading all prompts
  const [finishedReading, setFinishedReading] = useState(false);

  // Stores the live elapsed reading time in seconds
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Stores the result returned after submitting calibration to the backend
  const [result, setResult] = useState(null);

  // Stores any error message to display to the user
  const [error, setError] = useState("");

  // Stores any success message to display to the user
  const [successMessage, setSuccessMessage] = useState("");

  // Ref used to store the exact timestamp when reading starts
  // This avoids rerendering every time the value changes
  const startTimeRef = useRef(null);

  // Ref used to store the active timer interval ID so it can be cleared later
  const timerRef = useRef(null);

  // Stores the countdown value before reading begins
  // null = no countdown visible, 3/2/1 = countdown in progress
  const [countdown, setCountdown] = useState(null);

  // Get the currently selected background from the shared background context
  const { selectedBackground } = useBackground();

  // Build the final page style object.
  // It starts with the default page styles and conditionally adds a background image
  // with a dark overlay if the user has selected a custom background.
  const pageStyle = {
    ...styles.page,
    ...(selectedBackground?.image_url
      ? {
          backgroundImage: `linear-gradient(rgba(11,18,32,0.55), rgba(11,18,32,0.55)), url(${selectedBackground.image_url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }
      : {}),
  };

  // Runs once when the page first loads.
  // It loads the user's current calibration and the calibration prompts.
  // It also clears any timer interval when the component unmounts.
  useEffect(() => {
    loadCalibration();
    loadPrompts();

    return () => {
      stopTimerInterval();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handles the countdown before the timer starts.
  // When countdown reaches 0, the reading session officially begins.
  // Otherwise, it reduces the countdown value once per second.
  useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0) {
        setCountdown(null);
        setStarted(true);
        setRunning(true);
        startTimeRef.current = Date.now();
        startTimerInterval();
        return;
    }

    const timer = setTimeout(() => {
        setCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => clearTimeout(timer);
    }, [countdown]);

  // Loads the current saved calibration for the logged-in user from the backend
  async function loadCalibration() {
    try {
      setLoadingCalibration(true);

      const res = await fetch(`${API_URL}/api/calibration/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      // Only save calibration if the request succeeds
      if (res.ok) {
        setCalibration(data);
      }
    } catch (err) {
      // Log unexpected errors for debugging
      console.error("Calibration load error:", err);
    } finally {
      setLoadingCalibration(false);
    }
  }

  // Loads the set of reading prompts used during calibration
  async function loadPrompts() {
    try {
      setLoadingPrompts(true);
      setError("");

      const res = await fetch(`${API_URL}/api/calibration/prompts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      // If loading fails, show an error message
      if (!res.ok) {
        setError(data?.message || "Failed to load calibration prompts.");
        return;
      }

      // Save the prompt list and reset the current prompt index
      setPrompts(Array.isArray(data?.prompts) ? data.prompts : []);
      setCurrentIndex(0);
    } catch (err) {
      setError("Server error while loading calibration prompts.");
    } finally {
      setLoadingPrompts(false);
    }
  }

  // Starts a high-frequency interval that updates the elapsed reading time
  function startTimerInterval() {
    stopTimerInterval();

    timerRef.current = setInterval(() => {
      if (!startTimeRef.current) return;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setElapsedSeconds(elapsed);
    }, 100);
  }

  // Stops the timer interval if one is currently active
  function stopTimerInterval() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Resets session values and starts a 3-second countdown before calibration begins
  function startCalibration() {
    setError("");
    setSuccessMessage("");
    setResult(null);
    setStarted(false);
    setFinishedReading(false);
    setRunning(false);
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setCountdown(3);
    }

  // Moves to the next prompt, but never goes past the last prompt
  function nextPrompt() {
    setCurrentIndex((prev) => Math.min(prev + 1, prompts.length - 1));
  }

  // Moves to the previous prompt, but never goes before the first prompt
  function previousPrompt() {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }

  // Stops the reading timer and submits the total reading time to the backend
  function finishReading() {
    if (!running) return;

    const totalSeconds = (Date.now() - startTimeRef.current) / 1000;

    setElapsedSeconds(totalSeconds);
    setRunning(false);
    setFinishedReading(true);
    stopTimerInterval();

    submitCalibration(totalSeconds);
  }

  // Sends the total words and total reading time to the backend
  // so the system can calculate and save the user's reading speed
  async function submitCalibration(totalSeconds) {
    const totalWords = prompts.reduce(
      (sum, prompt) => sum + Number(prompt.word_count || 0),
      0
    );

    try {
      setError("");
      setSuccessMessage("");

      const res = await fetch(`${API_URL}/api/calibration/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          total_words: totalWords,
          total_seconds: totalSeconds,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Show an error if the calibration save fails
      if (!res.ok) {
        setError(data?.message || "Calibration failed.");
        return;
      }

      // Save the result locally and update the current calibration display
      setResult(data);
      setCalibration({
        ...data,
        is_default: false,
      });
      setSuccessMessage("Calibration saved successfully.");
    } catch (err) {
      setError("Server error while saving calibration.");
    }
  }

  // Resets the entire current calibration session without affecting saved calibration data
  function resetCalibrationSession() {
    stopTimerInterval();
    setRunning(false);
    setStarted(false);
    setFinishedReading(false);
    setElapsedSeconds(0);
    setCurrentIndex(0);
    setResult(null);
    setError("");
    setSuccessMessage("");
    setCountdown(null);
    startTimeRef.current = null;
  }

  // Get the currently displayed prompt safely
  const currentPrompt = prompts[currentIndex] || null;

  // Calculate the total number of words across all prompts
  // useMemo prevents recalculating unless prompts change
  const totalWords = useMemo(() => {
    return prompts.reduce((sum, prompt) => sum + Number(prompt.word_count || 0), 0);
  }, [prompts]);

  // Calculate progress through the prompts as a percentage
  const progressPercent = useMemo(() => {
    if (!prompts.length) return 0;
    return ((currentIndex + 1) / prompts.length) * 100;
  }, [currentIndex, prompts.length]);

  // Build display text showing whether the user is using default or custom calibration
  const calibrationStatusText = useMemo(() => {
    if (!calibration) return "Loading...";
    if (calibration.is_default) return "Using default reading speed";
    return "Custom calibration saved";
  }, [calibration]);

  // Render the calibration page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header row with page title and navigation link */}
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Reading Speed Calibration</h1>
          <Link to="/" style={styles.linkButton}>
            Home
          </Link>
        </div>

        {/* Introductory card explaining what calibration is and why it matters */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>What is calibration?</h2>
          <p style={styles.text}>
            Calibration measures how quickly you read a short set of prompts.
            Your result is saved as words per second and can be used by adaptive
            timing so preview and answer timers better match your reading speed.
          </p>

          <div style={styles.infoGrid}>
            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Typical default</div>
              <div style={styles.infoValue}>2.5 WPS</div>
            </div>

            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Lower value</div>
              <div style={styles.infoValue}>More time</div>
            </div>

            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Higher value</div>
              <div style={styles.infoValue}>Less time</div>
            </div>
          </div>
        </div>

        {/* Card showing the user's currently saved calibration values */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Current Calibration</h2>

          {loadingCalibration ? (
            <p style={styles.text}>Loading current calibration...</p>
          ) : calibration ? (
            <div style={styles.infoGrid}>
              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Words / second</div>
                <div style={styles.infoValue}>{calibration.words_per_second}</div>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Words / minute</div>
                <div style={styles.infoValue}>{calibration.words_per_minute}</div>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Status</div>
                <div style={styles.infoValueSmall}>{calibrationStatusText}</div>
              </div>
            </div>
          ) : (
            <p style={styles.text}>No calibration data available.</p>
          )}
        </div>

        {/* Main calibration interaction area for reading prompts and timing the session */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Calibration Prompts</h2>

          {loadingPrompts ? (
            <p style={styles.text}>Loading prompts...</p>
          ) : prompts.length === 0 ? (
            <p style={styles.text}>No prompts available.</p>
          ) : (
            <>
              <p style={styles.text}>
                Read each sentence naturally from start to finish. When you are
                ready, press <strong>Start Reading</strong>. Move through the
                prompts in order, then press <strong>Finish Calibration</strong>
                on the last prompt.
              </p>

              {/* Summary stats about the prompt session */}
              <div style={styles.statsRow}>
                <div style={styles.statPill}>Prompts: {prompts.length}</div>
                <div style={styles.statPill}>Total words: {totalWords}</div>
                <div style={styles.statPill}>
                  Current: {currentIndex + 1} / {prompts.length}
                </div>
              </div>

              {/* Visual progress bar showing the current position in the prompt list */}
              <div style={styles.progressOuter}>
                <div
                  style={{
                    ...styles.progressInner,
                    width: `${progressPercent}%`,
                  }}
                />
              </div>

              {/* Card showing the current prompt text and its word count */}
              <div style={styles.promptCard}>
                <div style={styles.promptHeader}>
                  Prompt {currentIndex + 1} of {prompts.length}
                </div>

                <div style={styles.promptText}>
                  {currentPrompt?.text}
                </div>

                <div style={styles.promptMeta}>
                  Word count: {currentPrompt?.word_count || 0}
                </div>
              </div>

              {/* Live timer showing how long the user has been reading */}
              <div style={styles.timerCard}>
                <div style={styles.timerLabel}>Elapsed time</div>
                <div style={styles.timerValue}>{elapsedSeconds.toFixed(2)}s</div>
              </div>

              {/* Countdown shown before the calibration timer officially starts */}
              {countdown !== null && (
                <div style={styles.countdownCard}>
                    <div style={styles.countdownLabel}>Get ready...</div>
                    <div style={styles.countdownValue}>
                    {countdown > 0 ? countdown : "Start!"}
                    </div>
                </div>
                )}

              {/* Start button only shown before a session has begun */}
              {!started && countdown === null && (
                <button style={styles.startButton} onClick={startCalibration}>
                  Start Reading
                </button>
              )}

              {/* Navigation and finish controls shown once reading has started */}
              {started && !finishedReading && (
                <div style={styles.controlsRow}>
                  <button
                    style={styles.secondaryButton}
                    onClick={previousPrompt}
                    disabled={currentIndex === 0}
                  >
                    Previous
                  </button>

                  {currentIndex < prompts.length - 1 ? (
                    <button style={styles.primaryButton} onClick={nextPrompt}>
                      Next Prompt
                    </button>
                  ) : (
                    <button style={styles.stopButton} onClick={finishReading}>
                      Finish Calibration
                    </button>
                  )}
                </div>
              )}

              {/* Reset button shown during or after a started session */}
              {started && (
                <button style={styles.resetButton} onClick={resetCalibrationSession}>
                  Reset Session
                </button>
              )}
            </>
          )}
        </div>

        {/* Error message shown if any request or action fails */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Success message shown after calibration is saved */}
        {successMessage && <div style={styles.success}>{successMessage}</div>}

        {/* Result card shown after the calibration has been successfully submitted */}
        {result && (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Calibration Result</h2>

            <div style={styles.infoGrid}>
              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Words / second</div>
                <div style={styles.infoValue}>{result.words_per_second}</div>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Words / minute</div>
                <div style={styles.infoValue}>{result.words_per_minute}</div>
              </div>

              <div style={styles.infoCard}>
                <div style={styles.infoLabel}>Saved</div>
                <div style={styles.infoValueSmall}>Yes</div>
              </div>
            </div>

            <p style={styles.text}>
              Your adaptive timing can now use this reading speed to better match
              preview and answer time limits.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Centralised styles object for the calibration page.
// This keeps layout and visual styling separated from the main component logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },

  // Main container that centres the content and limits width
  container: {
    maxWidth: 900,
    margin: "0 auto",
  },

  // Header layout for page title and home button
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

  // Generic card style used for each main section
  card: {
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    marginBottom: 18,
  },

  // Section heading styling
  sectionTitle: {
    marginTop: 0,
    marginBottom: 14,
  },

  // Standard paragraph text styling
  text: {
    lineHeight: 1.7,
    opacity: 0.95,
  },

  // Styled navigation button that links back to the home page
  linkButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
  },

  // Responsive grid used for groups of small information cards
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 12,
  },

  // Individual info card styling
  infoCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 12,
    padding: 16,
  },

  // Small uppercase label used inside info cards
  infoLabel: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.8,
    marginBottom: 8,
  },

  // Larger value styling for key metrics
  infoValue: {
    fontSize: 28,
    fontWeight: 800,
  },

  // Slightly smaller value styling for short status text
  infoValueSmall: {
    fontSize: 18,
    fontWeight: 700,
  },

  // Row of small summary pills for quick stats
  statsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 16,
  },

  // Individual pill styling used in the stats row
  statPill: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 14,
    fontWeight: 600,
  },

  // Outer progress bar container
  progressOuter: {
    height: 12,
    width: "100%",
    background: "#0b1220",
    borderRadius: 999,
    overflow: "hidden",
    border: "1px solid #23304c",
    marginBottom: 18,
  },

  // Filled progress bar that expands as the user moves through prompts
  progressInner: {
    height: "100%",
    background: "#3b82f6",
    borderRadius: 999,
    transition: "width 0.3s ease",
  },

  // Main prompt display card
  promptCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },

  // Small prompt heading text
  promptHeader: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.8,
    marginBottom: 12,
  },

  // Main prompt sentence styling
  promptText: {
    fontSize: 24,
    lineHeight: 1.8,
    marginBottom: 14,
  },

  // Metadata styling for extra prompt details such as word count
  promptMeta: {
    opacity: 0.85,
    fontSize: 14,
  },

  // Card used to display the live timer
  timerCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    textAlign: "center",
  },

  // Label above the timer value
  timerLabel: {
    fontSize: 14,
    opacity: 0.85,
    marginBottom: 8,
  },

  // Large elapsed time display
  timerValue: {
    fontSize: 32,
    fontWeight: 800,
  },

  // Row for navigation and session control buttons
  controlsRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 10,
  },

  // Main button used to begin calibration
  startButton: {
    padding: "14px 18px",
    borderRadius: 10,
    border: "none",
    background: "#22c55e",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 16,
    width: "100%",
  },

  // Primary action button used for moving forward through prompts
  primaryButton: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    background: "#3b82f6",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  // Secondary action button used for moving backward through prompts
  secondaryButton: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  // Red action button used to finish and submit the calibration session
  stopButton: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    background: "#ef4444",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  // Button used to reset the current session state
  resetButton: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    marginTop: 12,
  },

  // Error message box styling
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 12,
    borderRadius: 8,
    border: "1px solid rgba(239,68,68,0.25)",
    marginBottom: 16,
  },

  // Countdown display card shown before the timer starts
  countdownCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    textAlign: "center",
  },

  // Small label above the countdown value
  countdownLabel: {
    fontSize: 14,
    opacity: 0.85,
    marginBottom: 8,
  },

  // Large countdown number styling
  countdownValue: {
    fontSize: 32,
    fontWeight: 800,
  },

  // Success message box styling
  success: {
    background: "rgba(34,197,94,0.15)",
    color: "#bbf7d0",
    padding: 12,
    borderRadius: 8,
    border: "1px solid rgba(34,197,94,0.25)",
    marginBottom: 16,
  },
};