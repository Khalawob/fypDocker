// Import React hooks:
// useEffect is used to run side effects such as loading set data when the page opens,
// useState is used to store local component state values.
import { useEffect, useState } from "react";

// Import React Router helpers:
// Link is used for clickable navigation,
// useNavigate is used for programmatic navigation,
// useParams is used to read the setId from the current route.
import { Link, useNavigate, useParams } from "react-router-dom";

// Import the background context so the user's selected background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Default theme values used if the set does not have custom style values saved
const DEFAULT_THEME = {
  top_color: "#121a2a",
  bottom_color: "#0b1220",
  text_color: "#ffffff",
  accent_color: "#3b82f6",
  border_radius: "12px",
};

// Main page component for viewing a flashcard set and its cards
export default function SetDetails() {
  // Read the setId from the current route
  const { setId } = useParams();

  // React Router navigation helper used for actions like leaving the page after deleting a set
  const navigate = useNavigate();

  // Read the auth token from localStorage so authenticated API requests can be made
  const token = localStorage.getItem("token");

  // Stores the set information returned by the backend
  const [setInfo, setSetInfo] = useState(null);

  // Stores all flashcards that belong to this set
  const [flashcards, setFlashcards] = useState([]);

  // Tracks whether the set details page is currently loading
  const [loading, setLoading] = useState(true);

  // Stores any error message that should be shown to the user
  const [error, setError] = useState("");

  // Stores any success message that should be shown to the user
  const [success, setSuccess] = useState("");

  // Stores whether reminders are enabled for this set
  const [reminderEnabled, setReminderEnabled] = useState(false);

  // Stores whether adaptive spaced repetition timing is enabled
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(false);

  // Stores the manual reminder interval in hours
  const [intervalHours, setIntervalHours] = useState(24);

  // Stores the next scheduled review datetime returned by the backend
  const [nextReviewAt, setNextReviewAt] = useState(null);

  // Stores the datetime of the last reminder email sent
  const [lastSentAt, setLastSentAt] = useState(null);

  // Stores the most recent recorded accuracy value for adaptive reminders
  const [lastAccuracy, setLastAccuracy] = useState(null);

  // Stores the last review interval chosen by the adaptive system
  const [lastIntervalHours, setLastIntervalHours] = useState(null);

  // Tracks whether reminder settings are currently being saved
  const [reminderLoading, setReminderLoading] = useState(false);

  // Get the selected custom background from the shared background context
  const { selectedBackground } = useBackground();

  // Build the final page style object.
  // It starts with the default page styles and conditionally adds a selected background image
  // with a dark overlay so the content remains readable.
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

  // Load the set details whenever the setId changes.
  // This ensures the correct data is shown if the route changes.
  useEffect(() => {
    loadSetDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);

  // Loads the set information, its flashcards, and its reminder settings from the backend
  async function loadSetDetails() {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Run all required requests in parallel to reduce waiting time
      const [setRes, flashcardsRes, reminderRes] = await Promise.all([
        fetch(`${API_URL}/api/sets/${setId}`, { headers }),
        fetch(`${API_URL}/api/sets/${setId}/cards`, { headers }),
        fetch(`${API_URL}/api/sets/${setId}/reminder`, { headers }),
      ]);

      const setData = await setRes.json().catch(() => ({}));
      const flashcardsData = await flashcardsRes.json().catch(() => []);
      const reminderData = await reminderRes.json().catch(() => ({}));

      // If the set itself could not be loaded, stop here and show an error
      if (!setRes.ok) {
        setError(setData?.message || "Failed to load set information");
        return;
      }

      // Save the set metadata
      setSetInfo(setData || null);

      // Save the flashcards, supporting either a direct array or an object with a flashcards array
      setFlashcards(
        Array.isArray(flashcardsData)
          ? flashcardsData
          : flashcardsData?.flashcards || []
      );

      // Only update reminder data if the reminder request was successful
      if (reminderRes.ok) {
        setReminderEnabled(!!reminderData.reminder_enabled);
        setAdaptiveEnabled(!!reminderData.adaptive_enabled);
        setIntervalHours(Number(reminderData.interval_hours || 24));
        setNextReviewAt(reminderData.next_review_at || null);
        setLastSentAt(reminderData.last_sent_at || null);
        setLastAccuracy(
          reminderData.last_accuracy !== null &&
            reminderData.last_accuracy !== undefined
            ? Number(reminderData.last_accuracy)
            : null
        );
        setLastIntervalHours(
          reminderData.last_interval_hours !== null &&
            reminderData.last_interval_hours !== undefined
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

  // Saves the reminder configuration for this set
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

      // Show an error if the save fails
      if (!res.ok) {
        setError(data?.message || "Failed to save reminder");
        return;
      }

      // Show success feedback and reload the set details so the reminder information stays current
      setSuccess(data?.message || "Reminder settings saved");
      await loadSetDetails();
    } catch (err) {
      setError("Server error while saving reminder");
    } finally {
      setReminderLoading(false);
    }
  }

  // Deletes an individual flashcard after asking the user for confirmation
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

      // Show an error if the delete request fails
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to delete flashcard");
        return;
      }

      // Remove the deleted card from local state so the page updates immediately
      setFlashcards((prev) =>
        prev.filter((card) => Number(card.flashcard_id) !== Number(flashcardId))
      );
      setSuccess("Flashcard deleted successfully");
    } catch (err) {
      setError("Server error while deleting flashcard");
    }
  }

  // Deletes the whole set after asking the user for confirmation
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

      // Show an error if deleting the set fails
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to delete set");
        return;
      }

      // If deletion succeeds, return the user to the sets page
      navigate("/sets");
    } catch (err) {
      setError("Server error while deleting set");
    }
  }

  // Starts a practice session for this specific set by navigating to the practice page with the set ID
  function startPractice() {
    navigate(`/practice?set_id=${setId}`);
  }

  // Converts a date/time value into a readable local date/time string
  function formatDateTime(value) {
    if (!value) return "Not scheduled";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  // Build the currently active theme for this set.
  // If no custom style exists, fall back to default theme values.
  const theme = {
    top_color: setInfo?.top_color || DEFAULT_THEME.top_color,
    bottom_color: setInfo?.bottom_color || DEFAULT_THEME.bottom_color,
    text_color: setInfo?.text_color || DEFAULT_THEME.text_color,
    accent_color: setInfo?.accent_color || DEFAULT_THEME.accent_color,
    border_radius: setInfo?.border_radius || DEFAULT_THEME.border_radius,
  };

  // Dynamic wrapper styling for each flashcard preview using the set's theme
  const cardWrapperStyle = {
    ...styles.cardWrapper,
    borderRadius: theme.border_radius,
    border: `2px solid ${theme.accent_color}`,
  };

  // Dynamic styling for the top half of a flashcard preview
  const topHalfStyle = {
    ...styles.topHalf,
    background: theme.top_color,
    color: theme.text_color,
  };

  // Dynamic styling for the bottom half of a flashcard preview
  const bottomHalfStyle = {
    ...styles.bottomHalf,
    background: theme.bottom_color,
    color: theme.text_color,
    borderTop: `1px solid ${theme.accent_color}`,
  };

  // Dynamic styling for question/answer labels using the set's accent colour
  const labelStyle = {
    ...styles.label,
    color: theme.accent_color,
    opacity: 1,
  };

  // Special green styling for the practice button
  const practiceButtonStyle = {
    ...styles.primaryButton,
    backgroundColor: "#22c55e",
    color: "#ffffff",
    border: "none",
  };

  // Special green styling for the add flashcard link button
  const addFlashcardButtonStyle = {
    ...styles.primaryButtonLink,
    backgroundColor: "#22c55e",
    color: "#ffffff",
    border: "none",
  };

  // Special blue styling for the import document link button
  const importButtonStyle = {
    ...styles.primaryButtonLink,
    backgroundColor: "#0ea5e9",
    color: "#ffffff",
    border: "none",
  };

  // Special purple styling for the host multiplayer link button
  const multiplayerButtonStyle = {
    ...styles.primaryButtonLink,
    backgroundColor: "#a855f7",
    color: "#ffffff",
    border: "none",
  };

  // Render the Set Details page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header row showing the set title, description, and main action buttons */}
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>{setInfo?.title || "Flashcard Set"}</h1>
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

            <Link
              to={`/sets/${setId}/add-flashcard`}
              style={addFlashcardButtonStyle}
            >
              Add Flashcard
            </Link>

            <Link
              to={`/sets/${setId}/import-document`}
              style={importButtonStyle}
            >
              Import Document
            </Link>

            <Link
              to={`/multiplayer/create?set_id=${setId}`}
              style={multiplayerButtonStyle}
            >
              Host Multiplayer
            </Link>

            <button style={practiceButtonStyle} onClick={startPractice}>
              Practice Set
            </button>

            <button style={styles.deleteButton} onClick={deleteSet}>
              Delete Set
            </button>
          </div>
        </div>

        {/* Page-level loading, error, and success states */}
        {loading && <div style={styles.cardShell}>Loading set...</div>}
        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        {/* Reminder settings panel */}
        {!loading && !error && (
          <div style={styles.reminderCard}>
            <h3 style={styles.reminderTitle}>Study Reminder</h3>
            <p style={styles.reminderText}>
              Choose whether this set uses a manual review interval or adaptive
              review timing.
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
                <strong>Reminder mode:</strong>{" "}
                {adaptiveEnabled ? "Adaptive" : "Manual"}
              </div>
              <div>
                <strong>Next review:</strong> {formatDateTime(nextReviewAt)}
              </div>
              <div>
                <strong>Last email sent:</strong> {formatDateTime(lastSentAt)}
              </div>
              <div>
                <strong>Last recorded accuracy:</strong>{" "}
                {lastAccuracy !== null
                  ? `${Math.round(lastAccuracy * 100)}%`
                  : "Not available yet"}
              </div>
              <div>
                <strong>Last interval used by system:</strong>{" "}
                {lastIntervalHours !== null
                  ? `${lastIntervalHours} hours`
                  : "Not available yet"}
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

        {/* Empty-state card shown when the set has no flashcards yet */}
        {!loading && !error && flashcards.length === 0 && (
          <div style={cardWrapperStyle}>
            <div style={topHalfStyle}>
              <h3>No flashcards yet</h3>
              <p style={styles.emptyText}>
                Add your first flashcard to start building this set.
              </p>
            </div>
            <div style={bottomHalfStyle}>
              <Link
                to={`/sets/${setId}/add-flashcard`}
                style={addFlashcardButtonStyle}
              >
                Add First Flashcard
              </Link>
            </div>
          </div>
        )}

        {/* Flashcard list shown when the set contains cards */}
        {!loading && !error && flashcards.length > 0 && (
          <div style={styles.list}>
            {flashcards.map((card) => (
              <div key={card.flashcard_id} style={cardWrapperStyle}>
                <div style={topHalfStyle}>
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

// Centralised styles object for the Set Details page.
// Keeps layout and appearance styling separate from the main component logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },

  // Main content container that centres the page and limits width
  container: {
    maxWidth: 1000,
    margin: "0 auto",
  },

  // Header section layout
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 24,
  },

  // Main page title styling
  title: {
    margin: 0,
  },

  // Subtitle text under the page title
  subtitle: {
    marginTop: 8,
    opacity: 0.9,
    lineHeight: 1.5,
  },

  // Layout for header action buttons
  headerButtons: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  // Layout for the flashcard list
  list: {
    display: "grid",
    gap: 16,
  },

  // Standard shell card used for loading state
  cardShell: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Shared wrapper styling for themed flashcard previews
  cardWrapper: {
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Top half of the flashcard preview
  topHalf: {
    padding: 20,
  },

  // Bottom half of the flashcard preview
  bottomHalf: {
    padding: 20,
  },

  // Generic spacing block used inside cards
  block: {
    marginBottom: 16,
  },

  // Shared label styling
  label: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.8,
    marginBottom: 8,
  },

  // Standard text styling
  text: {
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },

  // Text used in the empty state card
  emptyText: {
    opacity: 0.9,
    marginBottom: 16,
  },

  // Layout for flashcard action buttons
  flashcardActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 8,
  },

  // Styled navigation link button
  linkButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
  },

  // Styled green action link button
  primaryButtonLink: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#22c55e",
    color: "white",
    textDecoration: "none",
    fontWeight: 700,
    display: "inline-block",
  },

  // Styled green action button
  primaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#22c55e",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  // Red delete button styling
  deleteButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#ef4444",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  // Orange edit button styling
  editButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#f59e0b",
    color: "white",
    textDecoration: "none",
    fontWeight: 700,
    display: "inline-block",
  },

  // Reminder settings card styling
  reminderCard: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    marginBottom: 20,
  },

  // Reminder card title styling
  reminderTitle: {
    marginTop: 0,
    marginBottom: 10,
  },

  // Reminder card supporting text styling
  reminderText: {
    marginTop: 0,
    marginBottom: 16,
    opacity: 0.9,
    lineHeight: 1.5,
  },

  // Checkbox row layout
  checkboxRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 14,
  },

  // Label styling for reminder form fields
  reminderLabel: {
    display: "block",
    marginBottom: 6,
    fontWeight: 600,
  },

  // Select input styling for reminder interval
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

  // Metadata grid showing reminder status values
  reminderMeta: {
    display: "grid",
    gap: 6,
    marginBottom: 16,
    opacity: 0.9,
    fontSize: 14,
  },

  // Error message box styling
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    border: "1px solid rgba(239,68,68,0.25)",
  },

  // Success message box styling
  success: {
    background: "rgba(34,197,94,0.15)",
    color: "#bbf7d0",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    border: "1px solid rgba(34,197,94,0.25)",
  },
};

