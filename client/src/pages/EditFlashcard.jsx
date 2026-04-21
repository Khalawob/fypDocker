// Import React hooks:
// useEffect is used to run side effects such as loading the flashcard when the page opens,
// useState is used to store local component state values.
import { useEffect, useState } from "react";

// Import React Router helpers:
// Link is used for clickable navigation,
// useNavigate is used for programmatic navigation,
// useParams is used to read route values such as setId and flashcardId from the URL.
import { Link, useNavigate, useParams } from "react-router-dom";

// Import the background context so the user's selected background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Main page component for editing an existing flashcard
export default function EditFlashcard() {
  // Read the setId and flashcardId from the current route
  const { setId, flashcardId } = useParams();

  // React Router navigation helper used to return the user to the set page after editing
  const navigate = useNavigate();

  // Read the auth token from localStorage so authenticated API requests can be made
  const token = localStorage.getItem("token");

  // Local form state storing the editable flashcard values
  const [form, setForm] = useState({
    question: "",
    answer: "",
  });

  // Get the selected custom background from the shared background context
  const { selectedBackground } = useBackground();

  // Build the page style object.
  // It starts with the default page styles and conditionally adds the user's selected background
  // with a dark overlay so text remains readable.
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

  // Tracks whether the initial flashcard data is still loading
  const [loading, setLoading] = useState(true);

  // Tracks whether the update request is currently being submitted
  const [saving, setSaving] = useState(false);

  // Stores any validation or API error message to show on screen
  const [error, setError] = useState("");

  // Stores a success message after the flashcard is updated successfully
  const [success, setSuccess] = useState("");

  // Load the flashcard whenever the flashcardId changes.
  // This ensures the correct card data appears if the route changes.
  useEffect(() => {
    loadFlashcard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashcardId]);

  // Generic form change handler.
  // Uses the field name to update the matching value in the form state.
  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Validates the form before submission.
  // Ensures both question and answer contain non-empty text.
  function validate() {
    if (!form.question.trim()) return "Question is required";
    if (!form.answer.trim()) return "Answer is required";
    return "";
  }

  // Loads the flashcard data from the backend.
  // It fetches all cards in the set, finds the one matching flashcardId,
  // and fills the form with that card's current question and answer.
  async function loadFlashcard() {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const res = await fetch(`${API_URL}/api/sets/${setId}/cards`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json().catch(() => []);

      // Show an error if the flashcard list could not be loaded
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to load flashcard");
        return;
      }

      // Support either a direct array response or an object containing a flashcards array
      const flashcards = Array.isArray(data) ? data : data?.flashcards || [];

      // Find the specific card the user wants to edit
      const card = flashcards.find(
        (item) => String(item.flashcard_id) === String(flashcardId)
      );

      // If no matching card is found, show an error
      if (!card) {
        setError("Flashcard not found");
        return;
      }

      // Populate the form with the current flashcard values
      setForm({
        question: card.question || "",
        answer: card.answer || "",
      });
    } catch (err) {
      setError("Server error while loading flashcard");
    } finally {
      setLoading(false);
    }
  }

  // Handles form submission.
  // Validates the inputs, sends the update request to the backend,
  // shows feedback, and redirects back to the set page after success.
  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);

      // Send the updated question and answer to the backend
      const res = await fetch(`${API_URL}/api/cards/${flashcardId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question: form.question.trim(),
          answer: form.answer.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Show an error if the update fails
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to update flashcard");
        return;
      }

      // Show success feedback to the user
      setSuccess("Flashcard updated successfully");

      // After a short delay, return to the flashcard set page
      setTimeout(() => {
        navigate(`/sets/${setId}`);
      }, 700);
    } catch (err) {
      setError("Server error while updating flashcard");
    } finally {
      setSaving(false);
    }
  }

  // Render the Edit Flashcard page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header row with page title and navigation back to the set */}
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Edit Flashcard</h1>
          <Link to={`/sets/${setId}`} style={styles.linkButton}>
            Back to Set
          </Link>
        </div>

        {/* Loading state shown while the flashcard data is being fetched */}
        {loading && <div style={styles.card}>Loading flashcard...</div>}

        {/* Main form is shown once loading has finished */}
        {!loading && (
          <form onSubmit={onSubmit} style={styles.card}>
            <p style={styles.description}>
              Update the question and answer for this flashcard.
            </p>

            {/* Conditionally show error message */}
            {error && <div style={styles.error}>{error}</div>}

            {/* Conditionally show success message */}
            {success && <div style={styles.success}>{success}</div>}

            {/* Editable question field */}
            <label style={styles.label}>Question</label>
            <textarea
              name="question"
              value={form.question}
              onChange={onChange}
              style={styles.textarea}
              placeholder="Enter the flashcard question"
            />
            <div style={styles.helpText}>
              Edit the prompt the learner should see.
            </div>

            {/* Editable answer field */}
            <label style={styles.label}>Answer</label>
            <textarea
              name="answer"
              value={form.answer}
              onChange={onChange}
              style={styles.textarea}
              placeholder="Enter the correct answer"
            />
            <div style={styles.helpText}>
              Edit the full correct answer for this flashcard.
            </div>

            {/* Button row containing save and cancel actions */}
            <div style={styles.buttonRow}>
              <button style={styles.primaryButton} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => navigate(`/sets/${setId}`)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Centralised styles object for the Edit Flashcard page.
// Keeps layout and appearance styling separate from the main logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },

  // Main container that centres the page content and limits width
  container: {
    maxWidth: 760,
    margin: "0 auto",
  },

  // Header layout for title and back link
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

  // Card styling used for both loading state and main form container
  card: {
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Description text shown at the top of the form
  description: {
    marginTop: 0,
    marginBottom: 20,
    opacity: 0.9,
    lineHeight: 1.5,
  },

  // Shared label styling for form fields
  label: {
    display: "block",
    fontWeight: 600,
    marginBottom: 6,
    marginTop: 14,
  },

  // Shared textarea styling used for both question and answer fields
  textarea: {
    width: "100%",
    minHeight: 120,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    outline: "none",
    resize: "vertical",
  },

  // Small helper text shown below form fields
  helpText: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 6,
    lineHeight: 1.45,
  },

  // Layout row for the action buttons
  buttonRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 24,
  },

  // Primary green button used to save the changes
  primaryButton: {
    padding: "14px 18px",
    borderRadius: 10,
    border: "none",
    background: "#22c55e",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 16,
  },

  // Secondary button used to cancel editing and return to the set
  secondaryButton: {
    padding: "14px 18px",
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 16,
  },

  // Styled link button used to navigate back to the set page
  linkButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
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
