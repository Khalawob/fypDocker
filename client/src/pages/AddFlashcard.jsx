// Import React's useState hook so the component can store and update local state
// Import React Router helpers:
// Link is used for navigation links,
// useNavigate is used for programmatic navigation,
// useParams is used to read the setId from the URL
// Import the custom background context so the selected user background can be applied to this page
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise defaults to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Main AddFlashcard page component
export default function AddFlashcard() {
  // Read the setId from the current route so the flashcard can be added to the correct set
  const { setId } = useParams();

  // React Router navigation function used to redirect the user after they finish
  const navigate = useNavigate();

  // Read the stored JWT token from localStorage so authenticated API requests can be made
  const token = localStorage.getItem("token");

  // Form state for the flashcard inputs
  // Stores the question and answer entered by the user
  const [form, setForm] = useState({
    question: "",
    answer: "",
  });

  // Tracks whether the form is currently submitting to the backend
  const [loading, setLoading] = useState(false);

  // Stores any validation or server error message to show on screen
  const [error, setError] = useState("");

  // Stores a success message when a flashcard is added successfully
  const [success, setSuccess] = useState("");

  // Get the currently selected background from the shared background context
  const { selectedBackground } = useBackground();

  // Create the final page style object.
  // It starts with the base page style, then conditionally adds a background image
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
  
  // Handles changes in both textarea fields.
  // Uses the input name attribute to update the matching value in the form state.
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

  // Handles form submission.
  // Prevents the default browser form submit, validates input,
  // sends the POST request to the backend, and updates success/error state.
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
      setLoading(true);

      // Send a POST request to create a new flashcard in the selected set
      const res = await fetch(`${API_URL}/api/sets/${setId}/cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question: form.question.trim(),
          answer: form.answer.trim(),
        }),
      });

      // Attempt to parse the JSON response safely
      const data = await res.json().catch(() => ({}));

      // If the request fails, show the returned backend error or a fallback message
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to add flashcard");
        return;
      }

      // On success, show confirmation and reset the form fields
      setSuccess("Flashcard added successfully");
      setForm({ question: "", answer: "" });
    } catch (err) {
      // Handle unexpected network/server errors
      setError("Server error. Try again.");
    } finally {
      // Always stop the loading state after the request finishes
      setLoading(false);
    }
  }

  // Navigates the user back to the flashcard set page
  function finishAdding() {
    navigate(`/sets/${setId}`);
  }

  // Render the Add Flashcard page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header section with page title and link back to the set */}
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Add Flashcard</h1>
          <Link to={`/sets/${setId}`} style={styles.linkButton}>
            Back to Set
          </Link>
        </div>

        {/* Main form card used to create a new flashcard */}
        <form onSubmit={onSubmit} style={styles.card}>
          <p style={styles.description}>
            Add a new flashcard to this set by entering a question and an answer.
          </p>

          {/* Conditionally show validation/server error message */}
          {error && <div style={styles.error}>{error}</div>}

          {/* Conditionally show success message after a successful add */}
          {success && <div style={styles.success}>{success}</div>}

          {/* Question input area */}
          <label style={styles.label}>Question</label>
          <textarea
            name="question"
            value={form.question}
            onChange={onChange}
            style={styles.textarea}
            placeholder="Enter the flashcard question"
          />
          <div style={styles.helpText}>
            Write the prompt the learner should see.
          </div>

          {/* Answer input area */}
          <label style={styles.label}>Answer</label>
          <textarea
            name="answer"
            value={form.answer}
            onChange={onChange}
            style={styles.textarea}
            placeholder="Enter the correct answer"
          />
          <div style={styles.helpText}>
            Write the full correct answer for this flashcard.
          </div>

          {/* Button row containing submit and finish actions */}
          <div style={styles.buttonRow}>
            <button style={styles.primaryButton} disabled={loading}>
              {loading ? "Adding..." : "Add Flashcard"}
            </button>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={finishAdding}
            >
              Done
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Centralised styles object for this page.
// Keeps the component layout and visual appearance organised in one place.
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

  // Page title styling
  title: {
    margin: 0,
  },

  // Card container for the form
  card: {
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Introductory text at the top of the form
  description: {
    marginTop: 0,
    marginBottom: 20,
    opacity: 0.9,
    lineHeight: 1.5,
  },

  // Label styling for form fields
  label: {
    display: "block",
    fontWeight: 600,
    marginBottom: 6,
    marginTop: 14,
  },

  // Shared textarea styling for question and answer fields
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

  // Primary button used to submit the form
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

  // Secondary button used to finish and return to the set page
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

  // Styled link button used to navigate back to the set
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

