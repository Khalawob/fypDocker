import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useBackground } from "../context/BackgroundContext";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const DEFAULT_THEME = {
  top_color: "#121a2a",
  bottom_color: "#0b1220",
  text_color: "#ffffff",
  accent_color: "#3b82f6",
  border_radius: "12px",
};

export default function SetDetails() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [setInfo, setSetInfo] = useState(null);
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(24);
  const [nextReviewAt, setNextReviewAt] = useState(null);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [lastAccuracy, setLastAccuracy] = useState(null);
  const [lastIntervalHours, setLastIntervalHours] = useState(null);
  const [reminderLoading, setReminderLoading] = useState(false);

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
    loadSetDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);

  async function loadSetDetails() {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const [setRes, flashcardsRes, reminderRes] = await Promise.all([
        fetch(`${API_URL}/api/sets/${setId}`, { headers }),
        fetch(`${API_URL}/api/sets/${setId}/cards`, { headers }),
        fetch(`${API_URL}/api/sets/${setId}/reminder`, { headers }),
      ]);

      const setData = await setRes.json().catch(() => ({}));
      const flashcardsData = await flashcardsRes.json().catch(() => []);
      const reminderData = await reminderRes.json().catch(() => ({}));

      if (!setRes.ok) {
        setError(setData?.message || "Failed to load set information");
        return;
      }

      setSetInfo(setData || null);
      setFlashcards(
        Array.isArray(flashcardsData)
          ? flashcardsData
          : flashcardsData?.flashcards || []
      );

      if (reminderRes.ok) {
        setReminderEnabled(!!reminderData.reminder_enabled);
        setAdaptiveEnabled(!!reminderData.adaptive_enabled);
        setIntervalHours(Number(reminderData.interval_hours || 24));
        setNextReviewAt(reminderData.next_review_at || null);
        setLastSentAt(reminderData.last_sent_at || null);
        setLastAccuracy(
          reminderData.last_accuracy !== null && reminderData.last_accuracy !== undefined
            ? Number(reminderData.last_accuracy)
            : null
        );
        setLastIntervalHours(
          reminderData.last_interval_hours !== null && reminderData.last_interval_hours !== undefined
            ? Number(reminderData.last_interval_hours)
            : null
        );
      }
    } catch (err) {
      setError("Server error while loading set details");
    } finally {
      setLoading(false);
    }
  }

  async function saveReminder() {
    try {
      setReminderLoading(true);
      setError("");
      setSuccess("");

      const res = await fetch(`${API_URL}/api/sets/${setId}/reminder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          reminder_enabled: reminderEnabled,
          interval_hours: intervalHours,
          adaptive_enabled: adaptiveEnabled,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || "Failed to save reminder");
        return;
      }

      setSuccess(data?.message || "Reminder settings saved");
      await loadSetDetails();
    } catch (err) {
      setError("Server error while saving reminder");
    } finally {
      setReminderLoading(false);
    }
  }

  async function deleteFlashcard(flashcardId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this flashcard?"
    );
    if (!confirmed) return;

    try {
      setError("");
      setSuccess("");

      const res = await fetch(`${API_URL}/api/cards/${flashcardId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to delete flashcard");
        return;
      }

      setFlashcards((prev) =>
        prev.filter((card) => Number(card.flashcard_id) !== Number(flashcardId))
      );
      setSuccess("Flashcard deleted successfully");
    } catch (err) {
      setError("Server error while deleting flashcard");
    }
  }

  async function deleteSet() {
    const confirmed = window.confirm(
      "Are you sure you want to delete this set? This will remove all flashcards in it."
    );
    if (!confirmed) return;

    try {
      setError("");
      setSuccess("");

      const res = await fetch(`${API_URL}/api/sets/${setId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to delete set");
        return;
      }

      navigate("/sets");
    } catch (err) {
      setError("Server error while deleting set");
    }
  }

  function startPractice() {
    navigate(`/practice?set_id=${setId}`);
  }

  function formatDateTime(value) {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  const theme = {
    top_color: setInfo?.top_color || DEFAULT_THEME.top_color,
    bottom_color: setInfo?.bottom_color || DEFAULT_THEME.bottom_color,
    text_color: setInfo?.text_color || DEFAULT_THEME.text_color,
    accent_color: setInfo?.accent_color || DEFAULT_THEME.accent_color,
    border_radius: setInfo?.border_radius || DEFAULT_THEME.border_radius,
  };

  const cardWrapperStyle = {
    ...styles.cardWrapper,
    borderRadius: theme.border_radius,
    border: `2px solid ${theme.accent_color}`,
  };

  const topHalfStyle = {
    ...styles.topHalf,
    background: theme.top_color,
    color: theme.text_color,
  };

  const bottomHalfStyle = {
    ...styles.bottomHalf,
    background: theme.bottom_color,
    color: theme.text_color,
    borderTop: `1px solid ${theme.accent_color}`,
  };

  const labelStyle = {
    ...styles.label,
    color: theme.accent_color,
    opacity: 1,
  };

  const metaStyle = {
    ...styles.cardMeta,
    color: theme.text_color,
    opacity: 0.75,
  };

  const practiceButtonStyle = {
    ...styles.primaryButton,
    backgroundColor: "#22c55e",
    color: "#ffffff",
    border: "none",
  };

  const addFlashcardButtonStyle = {
    ...styles.primaryButtonLink,
    backgroundColor: "#22c55e",
    color: "#ffffff",
    border: "none",
  };

  const importButtonStyle = {
    ...styles.primaryButtonLink,
    backgroundColor: "#0ea5e9",
    color: "#ffffff",
    border: "none",
  };

  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>
              {setInfo?.title || `Set ${setId}`}
            </h1>
            <p style={styles.subtitle}>
              {setInfo?.description || "View and manage flashcards in this set."}
            </p>
          </div>

          <div style={styles.headerButtons}>
            <Link to="/sets" style={styles.linkButton}>
              Back to Sets
            </Link>

            <Link to={`/sets/${setId}/edit`} style={styles.editButton}>
              Edit Set
            </Link>

            <Link to={`/sets/${setId}/add-flashcard`} style={addFlashcardButtonStyle}>
              Add Flashcard
            </Link>

            <Link to={`/sets/${setId}/import-document`} style={importButtonStyle}>
              Import Document
            </Link>

            <button style={practiceButtonStyle} onClick={startPractice}>
              Practice Set
            </button>

            <button style={styles.deleteButton} onClick={deleteSet}>
              Delete Set
            </button>
          </div>
        </div>

        {loading && <div style={styles.cardShell}>Loading set...</div>}
        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        {!loading && !error && (
          <div style={styles.reminderCard}>
            <h3 style={styles.reminderTitle}>Study Reminder</h3>
            <p style={styles.reminderText}>
              Choose whether this set uses a manual review interval or adaptive review timing.
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
                checked={adaptiveEnabled}
                onChange={(e) => setAdaptiveEnabled(e.target.checked)}
                disabled={!reminderEnabled}
              />
              Use adaptive spaced repetition timing
            </label>

            <label style={styles.reminderLabel}>Reminder Interval</label>
            <select
              value={intervalHours}
              onChange={(e) => setIntervalHours(Number(e.target.value))}
              style={styles.reminderInput}
              disabled={!reminderEnabled || adaptiveEnabled}
            >
              <option value={6}>Every 6 hours</option>
              <option value={12}>Every 12 hours</option>
              <option value={24}>Every 1 day</option>
              <option value={48}>Every 2 days</option>
              <option value={72}>Every 3 days</option>
              <option value={168}>Every 7 days</option>
            </select>

            <div style={styles.reminderMeta}>
              <div>
                <strong>Reminder mode:</strong> {adaptiveEnabled ? "Adaptive" : "Manual"}
              </div>
              <div>
                <strong>Next review:</strong> {formatDateTime(nextReviewAt)}
              </div>
              <div>
                <strong>Last email sent:</strong> {formatDateTime(lastSentAt)}
              </div>
              <div>
                <strong>Last recorded accuracy:</strong>{" "}
                {lastAccuracy !== null ? `${Math.round(lastAccuracy * 100)}%` : "Not available yet"}
              </div>
              <div>
                <strong>Last interval used by system:</strong>{" "}
                {lastIntervalHours !== null ? `${lastIntervalHours} hours` : "Not available yet"}
              </div>
            </div>

            <button
              type="button"
              style={practiceButtonStyle}
              onClick={saveReminder}
              disabled={reminderLoading}
            >
              {reminderLoading ? "Saving..." : "Save Reminder"}
            </button>
          </div>
        )}

        {!loading && !error && flashcards.length === 0 && (
          <div style={cardWrapperStyle}>
            <div style={topHalfStyle}>
              <h3>No flashcards yet</h3>
              <p style={styles.emptyText}>
                Add your first flashcard to start building this set.
              </p>
            </div>
            <div style={bottomHalfStyle}>
              <Link to={`/sets/${setId}/add-flashcard`} style={addFlashcardButtonStyle}>
                Add First Flashcard
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && flashcards.length > 0 && (
          <div style={styles.list}>
            {flashcards.map((card) => (
              <div key={card.flashcard_id} style={cardWrapperStyle}>
                <div style={topHalfStyle}>
                  <div style={metaStyle}>
                    Flashcard ID: {card.flashcard_id}
                  </div>

                  <div style={styles.block}>
                    <div style={labelStyle}>Question</div>
                    <div style={styles.text}>{card.question}</div>
                  </div>
                </div>

                <div style={bottomHalfStyle}>
                  <div style={styles.block}>
                    <div style={labelStyle}>Answer</div>
                    <div style={styles.text}>{card.answer}</div>
                  </div>

                  <div style={styles.flashcardActions}>
                    <Link
                      to={`/sets/${setId}/flashcards/${card.flashcard_id}/edit`}
                      style={styles.editButton}
                    >
                      Edit Flashcard
                    </Link>

                    <button
                      style={styles.deleteButton}
                      onClick={() => deleteFlashcard(card.flashcard_id)}
                    >
                      Delete Flashcard
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
    maxWidth: 1000,
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 24,
  },
  title: {
    margin: 0,
  },
  subtitle: {
    marginTop: 8,
    opacity: 0.9,
    lineHeight: 1.5,
  },
  headerButtons: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  list: {
    display: "grid",
    gap: 16,
  },
  cardShell: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  cardWrapper: {
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  topHalf: {
    padding: 20,
  },
  bottomHalf: {
    padding: 20,
  },
  cardMeta: {
    fontSize: 13,
    opacity: 0.8,
    marginBottom: 16,
  },
  block: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.8,
    marginBottom: 8,
  },
  text: {
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
  emptyText: {
    opacity: 0.9,
    marginBottom: 16,
  },
  flashcardActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 8,
  },
  linkButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
  },
  primaryButtonLink: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#22c55e",
    color: "white",
    textDecoration: "none",
    fontWeight: 700,
    display: "inline-block",
  },
  primaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#22c55e",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  deleteButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#ef4444",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  editButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#f59e0b",
    color: "white",
    textDecoration: "none",
    fontWeight: 700,
    display: "inline-block",
  },
  reminderCard: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    marginBottom: 20,
  },
  reminderTitle: {
    marginTop: 0,
    marginBottom: 10,
  },
  reminderText: {
    marginTop: 0,
    marginBottom: 16,
    opacity: 0.9,
    lineHeight: 1.5,
  },
  checkboxRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 14,
  },
  reminderLabel: {
    display: "block",
    marginBottom: 6,
    fontWeight: 600,
  },
  reminderInput: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    marginBottom: 16,
    boxSizing: "border-box",
  },
  reminderMeta: {
    display: "grid",
    gap: 6,
    marginBottom: 16,
    opacity: 0.9,
    fontSize: 14,
  },
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    border: "1px solid rgba(239,68,68,0.25)",
  },
  success: {
    background: "rgba(34,197,94,0.15)",
    color: "#bbf7d0",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    border: "1px solid rgba(34,197,94,0.25)",
  },
};

