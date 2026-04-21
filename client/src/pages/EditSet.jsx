// Import React hooks:
// useEffect is used to run side effects such as loading the set when the page opens,
// useState is used to store local component state values.
import { useEffect, useState } from "react";

// Import React Router helpers:
// Link is used for clickable navigation,
// useNavigate is used for programmatic navigation,
// useParams is used to read route values such as setId from the URL.
import { Link, useNavigate, useParams } from "react-router-dom";

// Import the background context so the user's selected background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Default appearance values used when loading fallback styles
// and when the user presses the reset theme button
const DEFAULT_THEME = {
  top_color: "#121a2a",
  bottom_color: "#0b1220",
  text_color: "#ffffff",
  accent_color: "#3b82f6",
  border_radius: "12px",
};

// Main page component for editing an existing flashcard set
export default function EditSet() {
  // Read the setId from the current route
  const { setId } = useParams();

  // React Router navigation helper used to return the user to the set page after editing
  const navigate = useNavigate();

  // Read the auth token from localStorage so authenticated API requests can be made
  const token = localStorage.getItem("token");

  // Form state storing the editable set values.
  // This includes the title, description, and appearance customisation settings.
  const [form, setForm] = useState({
    title: "",
    description: "",
    top_color: DEFAULT_THEME.top_color,
    bottom_color: DEFAULT_THEME.bottom_color,
    text_color: DEFAULT_THEME.text_color,
    accent_color: DEFAULT_THEME.accent_color,
    border_radius: DEFAULT_THEME.border_radius,
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

  // Tracks whether the initial set data is still loading
  const [loading, setLoading] = useState(true);

  // Tracks whether the update request is currently being submitted
  const [saving, setSaving] = useState(false);

  // Stores any validation or API error message to show on screen
  const [error, setError] = useState("");

  // Stores a success message after the set is updated successfully
  const [success, setSuccess] = useState("");

  // Load the set whenever the setId changes.
  // This ensures the correct set data appears if the route changes.
  useEffect(() => {
    loadSet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);

  // Generic form change handler.
  // Uses the field name to update the matching value in the form state.
  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Validates the set title before submission.
  // Ensures a title exists and has at least 2 characters.
  function validate() {
    if (!form.title.trim()) return "Title is required";
    if (form.title.trim().length < 2) {
      return "Title must be at least 2 characters";
    }
    return "";
  }

  // Resets only the appearance-related fields back to the default theme values
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

  // Loads the current set data from the backend
  // and fills the form with the existing title, description, and theme settings.
  async function loadSet() {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const res = await fetch(`${API_URL}/api/sets/${setId}`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json().catch(() => ({}));

      // Show an error if the set could not be loaded
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to load set");
        return;
      }

      // Fill the form with the current set values, using defaults if any theme values are missing
      setForm({
        title: data.title || "",
        description: data.description || "",
        top_color: data.top_color || DEFAULT_THEME.top_color,
        bottom_color: data.bottom_color || DEFAULT_THEME.bottom_color,
        text_color: data.text_color || DEFAULT_THEME.text_color,
        accent_color: data.accent_color || DEFAULT_THEME.accent_color,
        border_radius: data.border_radius || DEFAULT_THEME.border_radius,
      });
    } catch (err) {
      setError("Server error while loading set");
    } finally {
      setLoading(false);
    }
  }

  // Handles form submission.
  // Validates the input, sends the update request to the backend,
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

      // Send the updated set values to the backend
      const res = await fetch(`${API_URL}/api/sets/${setId}`, {
        method: "PUT",
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

      const data = await res.json().catch(() => ({}));

      // Show an error if the update fails
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to update set");
        return;
      }

      // Show success feedback to the user
      setSuccess("Set updated successfully");

      // After a short delay, return to the set page
      setTimeout(() => {
        navigate(`/sets/${setId}`);
      }, 700);
    } catch (err) {
      setError("Server error while updating set");
    } finally {
      setSaving(false);
    }
  }

  // Dynamic style for the live preview wrapper.
  // Uses the form's current values so the preview updates immediately as the user edits the theme.
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

  // Render the Edit Set page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header row with page title and navigation back to the set */}
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Edit Set</h1>
          <Link to={`/sets/${setId}`} style={styles.linkButton}>
            Back to Set
          </Link>
        </div>

        {/* Loading state shown while the set data is being fetched */}
        {loading && <div style={styles.card}>Loading set...</div>}

        {/* Main edit form shown once the set data has finished loading */}
        {!loading && (
          <form onSubmit={onSubmit} style={styles.card}>
            <p style={styles.description}>
              Update the title, description, and appearance for this flashcard set.
            </p>

            {/* Conditionally show error message */}
            {error && <div style={styles.error}>{error}</div>}

            {/* Conditionally show success message */}
            {success && <div style={styles.success}>{success}</div>}

            {/* Editable input for the set title */}
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
              Use a clear title so the set is easy to recognise later.
            </div>

            {/* Editable textarea for the optional set description */}
            <label style={styles.label}>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={onChange}
              style={styles.textarea}
              placeholder="Describe what this set covers"
              maxLength={500}
            />
            <div style={styles.helpText}>
              Optional. Add or update a short explanation of this set.
            </div>

            {/* Section header for appearance customisation controls */}
            <div style={styles.sectionHeaderRow}>
              <h2 style={styles.sectionTitle}>Card Appearance</h2>
              <button
                type="button"
                onClick={resetTheme}
                style={styles.secondarySmallButton}
              >
                Reset Theme
              </button>
            </div>

            {/* Grid of appearance controls for colours and card shape */}
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

            {/* Small explanation about where these appearance settings will be used */}
            <div style={styles.helpText}>
              This style will be shown when viewing the set and during practice mode.
            </div>

            {/* Live preview showing how the current appearance settings will look */}
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

// Centralised styles object for the Edit Set page.
// Keeps layout and appearance styling separate from the main logic.
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
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 24,
  },

  // Main page title styling
  title: {
    margin: 0,
  },

  // Main card styling used for loading state and form container
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

  // Shared styling for textarea inputs
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

  // Header row for the appearance section title and reset button
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

  // Small helper text shown below fields and sections
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

  // Layout for the save and cancel buttons
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

  // Secondary button used to cancel editing and return to the set page
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

  // Smaller secondary button used to reset the appearance theme
  secondarySmallButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
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