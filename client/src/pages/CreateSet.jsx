// Import React's useState hook so the component can store and update local state
import { useState } from "react";

// Import React Router helpers:
// Link is used for clickable navigation,
// useNavigate is used to move to another route programmatically
import { Link, useNavigate } from "react-router-dom";

// Import the custom background context so the selected user background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise defaults to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Default colour/theme values used when a new flashcard set is first created
// and also when the user presses the reset theme button
const DEFAULT_THEME = {
  top_color: "#121a2a",
  bottom_color: "#0b1220",
  text_color: "#ffffff",
  accent_color: "#3b82f6",
  border_radius: "12px",
};

// Main page component for creating a new flashcard set
export default function CreateSet() {
  // React Router navigation helper used to send the user back to the sets page after creation
  const navigate = useNavigate();

  // Read the auth token from localStorage so protected API requests can be made
  const token = localStorage.getItem("token");

  // Get the selected custom background from the shared background context
  const { selectedBackground } = useBackground();

  // Form state for the new flashcard set.
  // This includes the set title, description, and custom appearance settings.
  const [form, setForm] = useState({
    title: "",
    description: "",
    top_color: DEFAULT_THEME.top_color,
    bottom_color: DEFAULT_THEME.bottom_color,
    text_color: DEFAULT_THEME.text_color,
    accent_color: DEFAULT_THEME.accent_color,
    border_radius: DEFAULT_THEME.border_radius,
  });

  // Tracks whether the form is currently submitting to the backend
  const [loading, setLoading] = useState(false);

  // Stores any validation or server error message to show on screen
  const [error, setError] = useState("");

  // Stores a success message when the set is created successfully
  const [success, setSuccess] = useState("");

  // Build the page style object.
  // It starts with the default page style and conditionally adds a selected background image
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

  // Generic form change handler.
  // Uses the input name to update the correct value inside the form state.
  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Validates the set title before submission.
  // Ensures a title exists and has at least 2 characters.
  function validate() {
    if (!form.title.trim()) return "Title is required";
    if (form.title.trim().length < 2) return "Title must be at least 2 characters";
    return "";
  }

  // Resets only the appearance-related form fields back to the default theme values
  function resetTheme() {
    setForm((prev) => ({
      ...prev,
      top_color: DEFAULT_THEME.top_color,
      bottom_color: DEFAULT_THEME.bottom_color,
      text_color: DEFAULT_THEME.text_color,
      accent_color: DEFAULT_THEME.accent_color,
      border_radius: DEFAULT_THEME.border_radius,
    }));
  }

  // Handles form submission.
  // Validates the input, sends a POST request to create the set,
  // shows errors/success, and redirects back to the sets page after success.
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

      // Send the create-set request to the backend API
      const res = await fetch(`${API_URL}/api/sets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          top_color: form.top_color,
          bottom_color: form.bottom_color,
          text_color: form.text_color,
          accent_color: form.accent_color,
          border_radius: form.border_radius,
        }),
      });

      // Safely attempt to parse the JSON response
      const data = await res.json().catch(() => ({}));

      // If the backend returns an error, show it to the user
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to create set");
        return;
      }

      // Show success feedback to the user
      setSuccess("Flashcard set created successfully");

      // Redirect to the sets page shortly after successful creation
      setTimeout(() => {
        navigate("/sets");
      }, 800);
    } catch (err) {
      // Handle unexpected server/network errors
      setError("Server error. Try again.");
    } finally {
      // Always stop the loading state when the request finishes
      setLoading(false);
    }
  }

  // Dynamic style for the live card preview wrapper.
  // Uses the user's current form values so the preview updates immediately.
  const previewWrapperStyle = {
    borderRadius: form.border_radius,
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    border: `2px solid ${form.accent_color}`,
    marginTop: 18,
  };

  // Dynamic style for the top half of the preview card
  const previewTopStyle = {
    background: form.top_color,
    color: form.text_color,
    padding: 20,
  };

  // Dynamic style for the bottom half of the preview card
  const previewBottomStyle = {
    background: form.bottom_color,
    color: form.text_color,
    padding: 20,
    borderTop: `1px solid ${form.accent_color}`,
  };

  // Render the Create Set page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header row with page title and navigation back to the sets page */}
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Create Flashcard Set</h1>
          <Link to="/sets" style={styles.linkButton}>
            Back to Sets
          </Link>
        </div>

        {/* Main create-set form */}
        <form onSubmit={onSubmit} style={styles.card}>
          <p style={styles.description}>
            Create a new flashcard set before adding cards and starting practice.
          </p>

          {/* Conditionally show validation or API error messages */}
          {error && <div style={styles.error}>{error}</div>}

          {/* Conditionally show success feedback after a set is created */}
          {success && <div style={styles.success}>{success}</div>}

          {/* Input for the flashcard set title */}
          <label style={styles.label}>Set Title</label>
          <input
            name="title"
            value={form.title}
            onChange={onChange}
            style={styles.input}
            placeholder="e.g. Biology Revision"
            maxLength={120}
          />
          <div style={styles.helpText}>
            Give your set a clear name so it is easy to find later.
          </div>

          {/* Input for the optional set description */}
          <label style={styles.label}>Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={onChange}
            style={styles.textarea}
            placeholder="e.g. Key biology definitions for exam revision"
            maxLength={500}
          />
          <div style={styles.helpText}>
            Optional. Add a short description of what this set covers.
          </div>

          {/* Section header for appearance customisation controls */}
          <div style={styles.sectionHeaderRow}>
            <h2 style={styles.sectionTitle}>Card Appearance</h2>
            <button
              type="button"
              onClick={resetTheme}
              style={styles.secondaryButton}
            >
              Reset Theme
            </button>
          </div>

          {/* Grid of appearance controls for colours and border radius */}
          <div style={styles.appearanceGrid}>
            <div>
              <label style={styles.label}>Top Half Colour</label>
              <input
                type="color"
                name="top_color"
                value={form.top_color}
                onChange={onChange}
                style={styles.colorInput}
              />
            </div>

            <div>
              <label style={styles.label}>Bottom Half Colour</label>
              <input
                type="color"
                name="bottom_color"
                value={form.bottom_color}
                onChange={onChange}
                style={styles.colorInput}
              />
            </div>

            <div>
              <label style={styles.label}>Text Colour</label>
              <input
                type="color"
                name="text_color"
                value={form.text_color}
                onChange={onChange}
                style={styles.colorInput}
              />
            </div>

            <div>
              <label style={styles.label}>Accent Colour</label>
              <input
                type="color"
                name="accent_color"
                value={form.accent_color}
                onChange={onChange}
                style={styles.colorInput}
              />
            </div>

            <div>
              <label style={styles.label}>Card Shape</label>
              <select
                name="border_radius"
                value={form.border_radius}
                onChange={onChange}
                style={styles.select}
              >
                <option value="0px">Square</option>
                <option value="12px">Rounded</option>
                <option value="24px">Soft</option>
              </select>
            </div>
          </div>

          {/* Small explanation about how the appearance settings are used */}
          <div style={styles.helpText}>
            This style will be used when the set is viewed and during practice mode.
          </div>

          {/* Live card preview showing how the selected appearance settings will look */}
          <div style={previewWrapperStyle}>
            <div style={previewTopStyle}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: form.accent_color,
                  marginBottom: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Preview
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={styles.previewLabel}>Question</div>
                <div>What is the powerhouse of the cell?</div>
              </div>
            </div>

            <div style={previewBottomStyle}>
              <div>
                <div style={styles.previewLabel}>Answer</div>
                <div>Mitochondria</div>
              </div>
            </div>
          </div>

          {/* Main submit button for creating the set */}
          <button style={styles.primaryButton} disabled={loading}>
            {loading ? "Creating..." : "Create Set"}
          </button>
        </form>
      </div>
    </div>
  );
}

// Centralised styles object for the Create Set page.
// Keeps all reusable visual styling in one place.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },

  // Main container that centres content and limits width
  container: {
    maxWidth: 760,
    margin: "0 auto",
  },

  // Header layout for title and back link
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap",
    gap: 12,
  },

  // Main page title styling
  title: {
    margin: 0,
  },

  // Main form card styling
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

  // Shared styling for normal text inputs
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    outline: "none",
    boxSizing: "border-box",
  },

  // Shared styling for textarea fields
  textarea: {
    width: "100%",
    minHeight: 140,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
  },

  // Shared styling for select dropdowns
  select: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    outline: "none",
    boxSizing: "border-box",
  },

  // Styling for colour picker inputs
  colorInput: {
    width: "100%",
    height: 48,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    cursor: "pointer",
    padding: 4,
    boxSizing: "border-box",
  },

  // Grid layout for appearance customisation controls
  appearanceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginTop: 8,
  },

  // Header row used for the appearance section title and reset button
  sectionHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    gap: 12,
    flexWrap: "wrap",
  },

  // Section title styling for the appearance section
  sectionTitle: {
    margin: 0,
    fontSize: 20,
  },

  // Small helper text styling shown below controls
  helpText: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 6,
    lineHeight: 1.45,
  },

  // Small label styling used inside the preview card
  previewLabel: {
    fontSize: 13,
    fontWeight: 700,
    opacity: 0.85,
    marginBottom: 6,
  },

  // Main green submit button for creating the set
  primaryButton: {
    marginTop: 24,
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

  // Secondary button used for resetting the theme
  secondaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0f172a",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  },

  // Styled link button used to navigate back to the sets page
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