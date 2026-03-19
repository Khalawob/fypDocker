import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useBackground } from "../context/BackgroundContext";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function Calibration() {
  const token = localStorage.getItem("token");

  const [prompts, setPrompts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [calibration, setCalibration] = useState(null);

  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [loadingCalibration, setLoadingCalibration] = useState(true);

  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [finishedReading, setFinishedReading] = useState(false);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  const [countdown, setCountdown] = useState(null);

  const { selectedBackground } = useBackground();

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

  useEffect(() => {
    loadCalibration();
    loadPrompts();

    return () => {
      stopTimerInterval();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function loadCalibration() {
    try {
      setLoadingCalibration(true);

      const res = await fetch(`${API_URL}/api/calibration/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setCalibration(data);
      }
    } catch (err) {
      console.error("Calibration load error:", err);
    } finally {
      setLoadingCalibration(false);
    }
  }

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

      if (!res.ok) {
        setError(data?.message || "Failed to load calibration prompts.");
        return;
      }

      setPrompts(Array.isArray(data?.prompts) ? data.prompts : []);
      setCurrentIndex(0);
    } catch (err) {
      setError("Server error while loading calibration prompts.");
    } finally {
      setLoadingPrompts(false);
    }
  }

  function startTimerInterval() {
    stopTimerInterval();

    timerRef.current = setInterval(() => {
      if (!startTimeRef.current) return;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setElapsedSeconds(elapsed);
    }, 100);
  }

  function stopTimerInterval() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

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

  function nextPrompt() {
    setCurrentIndex((prev) => Math.min(prev + 1, prompts.length - 1));
  }

  function previousPrompt() {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }

  function finishReading() {
    if (!running) return;

    const totalSeconds = (Date.now() - startTimeRef.current) / 1000;

    setElapsedSeconds(totalSeconds);
    setRunning(false);
    setFinishedReading(true);
    stopTimerInterval();

    submitCalibration(totalSeconds);
  }

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

      if (!res.ok) {
        setError(data?.message || "Calibration failed.");
        return;
      }

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

  const currentPrompt = prompts[currentIndex] || null;

  const totalWords = useMemo(() => {
    return prompts.reduce((sum, prompt) => sum + Number(prompt.word_count || 0), 0);
  }, [prompts]);

  const progressPercent = useMemo(() => {
    if (!prompts.length) return 0;
    return ((currentIndex + 1) / prompts.length) * 100;
  }, [currentIndex, prompts.length]);

  const calibrationStatusText = useMemo(() => {
    if (!calibration) return "Loading...";
    if (calibration.is_default) return "Using default reading speed";
    return "Custom calibration saved";
  }, [calibration]);

  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Reading Speed Calibration</h1>
          <Link to="/" style={styles.linkButton}>
            Home
          </Link>
        </div>

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

              <div style={styles.statsRow}>
                <div style={styles.statPill}>Prompts: {prompts.length}</div>
                <div style={styles.statPill}>Total words: {totalWords}</div>
                <div style={styles.statPill}>
                  Current: {currentIndex + 1} / {prompts.length}
                </div>
              </div>

              <div style={styles.progressOuter}>
                <div
                  style={{
                    ...styles.progressInner,
                    width: `${progressPercent}%`,
                  }}
                />
              </div>

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

              <div style={styles.timerCard}>
                <div style={styles.timerLabel}>Elapsed time</div>
                <div style={styles.timerValue}>{elapsedSeconds.toFixed(2)}s</div>
              </div>

              {countdown !== null && (
                <div style={styles.countdownCard}>
                    <div style={styles.countdownLabel}>Get ready...</div>
                    <div style={styles.countdownValue}>
                    {countdown > 0 ? countdown : "Start!"}
                    </div>
                </div>
                )}

              {!started && countdown === null && (
                <button style={styles.startButton} onClick={startCalibration}>
                  Start Reading
                </button>
              )}

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

              {started && (
                <button style={styles.resetButton} onClick={resetCalibrationSession}>
                  Reset Session
                </button>
              )}
            </>
          )}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {successMessage && <div style={styles.success}>{successMessage}</div>}

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

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },
  container: {
    maxWidth: 900,
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 24,
  },
  title: {
    margin: 0,
  },
  card: {
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    marginBottom: 18,
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 14,
  },
  text: {
    lineHeight: 1.7,
    opacity: 0.95,
  },
  linkButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 12,
  },
  infoCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 12,
    padding: 16,
  },
  infoLabel: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.8,
    marginBottom: 8,
  },
  infoValue: {
    fontSize: 28,
    fontWeight: 800,
  },
  infoValueSmall: {
    fontSize: 18,
    fontWeight: 700,
  },
  statsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  statPill: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 14,
    fontWeight: 600,
  },
  progressOuter: {
    height: 12,
    width: "100%",
    background: "#0b1220",
    borderRadius: 999,
    overflow: "hidden",
    border: "1px solid #23304c",
    marginBottom: 18,
  },
  progressInner: {
    height: "100%",
    background: "#3b82f6",
    borderRadius: 999,
    transition: "width 0.3s ease",
  },
  promptCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  promptHeader: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.8,
    marginBottom: 12,
  },
  promptText: {
    fontSize: 24,
    lineHeight: 1.8,
    marginBottom: 14,
  },
  promptMeta: {
    opacity: 0.85,
    fontSize: 14,
  },
  timerCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    textAlign: "center",
  },
  timerLabel: {
    fontSize: 14,
    opacity: 0.85,
    marginBottom: 8,
  },
  timerValue: {
    fontSize: 32,
    fontWeight: 800,
  },
  controlsRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 10,
  },
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
  primaryButton: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    background: "#3b82f6",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  secondaryButton: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  stopButton: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    background: "#ef4444",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
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
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 12,
    borderRadius: 8,
    border: "1px solid rgba(239,68,68,0.25)",
    marginBottom: 16,
  },
  countdownCard: {
    background: "#09101d",
    border: "1px solid #23304c",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    textAlign: "center",
  },
  countdownLabel: {
    fontSize: 14,
    opacity: 0.85,
    marginBottom: 8,
  },
  countdownValue: {
    fontSize: 32,
    fontWeight: 800,
  },
  success: {
    background: "rgba(34,197,94,0.15)",
    color: "#bbf7d0",
    padding: 12,
    borderRadius: 8,
    border: "1px solid rgba(34,197,94,0.25)",
    marginBottom: 16,
  },
};