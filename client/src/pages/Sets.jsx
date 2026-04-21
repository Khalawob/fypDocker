// Import React hooks:
// useEffect is used to run side effects when the page loads,
// useState is used to store local component state values.
import { useEffect, useState } from "react";

// Import React Router helpers:
// Link is used for clickable navigation,
// useNavigate is used for programmatic navigation to practice mode.
import { Link, useNavigate } from "react-router-dom";

// Import the background context so the user's selected background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Default fallback theme used when a set does not have custom appearance values saved
const DEFAULT_THEME = {
  top_color: "#121a2a",
  bottom_color: "#0b1220",
  text_color: "#ffffff",
  accent_color: "#3b82f6",
  border_radius: "12px",
};

// Main page component for showing all of the user's flashcard sets
export default function Sets() {
  // React Router navigation helper used to start practice for a selected set
  const navigate = useNavigate();

  // Stores the list of flashcard sets returned by the backend
  const [sets, setSets] = useState([]);

  // Tracks whether the sets are currently loading
  const [loading, setLoading] = useState(true);

  // Stores any error message that should be shown to the user
  const [error, setError] = useState("");

  // Read the auth token from localStorage so authenticated API requests can be made
  const token = localStorage.getItem("token");

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

  // Run once when the page first loads to fetch the user's sets
  useEffect(() => {
    loadSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loads all flashcard sets for the current user from the backend
  async function loadSets() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(`${API_URL}/api/sets`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json().catch(() => []);

      // Show an error if the backend request fails
      if (!res.ok) {
        setError(data?.message || "Failed to load sets");
        return;
      }

      // Support either a direct array response or an object containing a sets array
      setSets(Array.isArray(data) ? data : data.sets || []);
    } catch (err) {
      setError("Server error while loading sets");
    } finally {
      setLoading(false);
    }
  }

  // Starts a practice session for the selected set by navigating to the practice page
  function startPractice(setId) {
    navigate(`/practice?set_id=${setId}`);
  }

  // Builds a safe theme object for a set, falling back to default colours and shape if needed
  function getTheme(set) {
    return {
      top_color: set?.top_color || DEFAULT_THEME.top_color,
      bottom_color: set?.bottom_color || DEFAULT_THEME.bottom_color,
      text_color: set?.text_color || DEFAULT_THEME.text_color,
      accent_color: set?.accent_color || DEFAULT_THEME.accent_color,
      border_radius: set?.border_radius || DEFAULT_THEME.border_radius,
    };
  }

  // Render the Sets page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header row containing the page title and top navigation actions */}
        <div style={styles.headerRow}>
          <h1>Your Flashcard Sets</h1>

          <div style={styles.buttonRow}>
            <Link to="/" style={styles.linkButton}>Home</Link>
            <Link to="/sets/create" style={styles.linkButton}>Create Set</Link>
          </div>
        </div>

        {/* Loading state shown while the sets are being fetched */}
        {loading && <div style={styles.card}>Loading sets...</div>}

        {/* Error message shown if loading fails */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Empty state shown when loading succeeds but the user has no sets */}
        {!loading && !error && sets.length === 0 && (
          <div style={styles.card}>
            <p>No flashcard sets found.</p>
          </div>
        )}

        {/* Main sets grid shown when sets are available */}
        {!loading && !error && sets.length > 0 && (
          <div style={styles.grid}>
            {sets.map((set) => {
              // Build the theme for this specific set so each card preview can use its saved appearance
              const theme = getTheme(set);

              // Dynamic wrapper styling for this set card
              const cardWrapperStyle = {
                ...styles.cardWrapper,
                borderRadius: theme.border_radius,
                border: `2px solid ${theme.accent_color}`,
              };

              // Dynamic styling for the top half of the set preview card
              const topHalfStyle = {
                ...styles.topHalf,
                background: theme.top_color,
                color: theme.text_color,
              };

              // Dynamic styling for the bottom half of the set preview card
              const bottomHalfStyle = {
                ...styles.bottomHalf,
                background: theme.bottom_color,
                color: theme.text_color,
                borderTop: `1px solid ${theme.accent_color}`,
              };

              // Special blue styling for the "Open Set" link
              const themedOpenButtonStyle = {
                ...styles.linkButton,
                backgroundColor: "#3b82f6",
                color: "#ffffff",
              };

              // Special green styling for the "Practice This Set" button
              const themedPracticeButtonStyle = {
                ...styles.primaryButton,
                backgroundColor: "#22c55e",
                color: "#ffffff",
                
              };

              return (
                <div key={set.set_id} style={cardWrapperStyle}>
                  {/* Top half of the card showing the set title and description */}
                  <div style={topHalfStyle}>
                    <h2 style={styles.setTitle}>{set.title}</h2>
                    <p style={styles.description}>
                      {set.description || "No description"}
                    </p>
                  </div>

                  {/* Bottom half of the card showing theme preview info and action buttons */}
                  <div style={bottomHalfStyle}>

                    <div style={styles.previewThemeRow}>
                      {/* Colour dots visually preview the set's saved appearance settings */}
                      <span
                        style={{
                          ...styles.themeDot,
                          background: theme.top_color,
                          border: "1px solid rgba(255,255,255,0.25)",
                        }}
                        title="Top colour"
                      />
                      <span
                        style={{
                          ...styles.themeDot,
                          background: theme.bottom_color,
                          border: "1px solid rgba(255,255,255,0.25)",
                        }}
                        title="Bottom colour"
                      />
                      <span
                        style={{
                          ...styles.themeDot,
                          background: theme.text_color,
                          border: "1px solid rgba(255,255,255,0.25)",
                        }}
                        title="Text colour"
                      />
                      <span
                        style={{
                          ...styles.themeDot,
                          background: theme.accent_color,
                          border: "1px solid rgba(255,255,255,0.25)",
                        }}
                        title="Accent colour"
                      />
                      <span style={styles.shapeLabel}>
                        Shape:{" "}
                        {theme.border_radius === "0px"
                          ? "Square"
                          : theme.border_radius === "24px"
                          ? "Soft"
                          : "Rounded"}
                      </span>
                    </div>

                    {/* Action buttons for opening the set or starting practice directly */}
                    <div style={styles.buttonRow}>
                      <Link to={`/sets/${set.set_id}`} style={themedOpenButtonStyle}>
                        Open Set
                      </Link>

                      <button
                        style={themedPracticeButtonStyle}
                        onClick={() => startPractice(set.set_id)}
                      >
                        Practice This Set
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Centralised styles object for the Sets page.
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
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap",
    gap: 12,
  },

  // Responsive grid used to display all set cards
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },

  // Standard card styling used for loading and empty states
  card: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Outer wrapper styling for each themed set preview card
  cardWrapper: {
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Top half styling for each set preview card
  topHalf: {
    padding: 20,
  },

  // Bottom half styling for each set preview card
  bottomHalf: {
    padding: 20,
  },

  // Set title styling
  setTitle: {
    marginTop: 0,
    marginBottom: 10,
  },

  // Set description styling
  description: {
    opacity: 0.9,
    marginBottom: 0,
    lineHeight: 1.5,
  },

  // Unused/general metadata styling for small supporting text
  meta: {
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 12,
  },

  // Layout for the row that previews the set's theme colours and shape
  previewThemeRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  },

  // Small coloured circle used in the theme preview row
  themeDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    display: "inline-block",
  },

  // Text label describing the saved card shape
  shapeLabel: {
    fontSize: 13,
    opacity: 0.95,
    marginLeft: 4,
  },

  // Shared button row layout
  buttonRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  // Shared green button styling used for practice actions
  primaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#22c55e",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  // Shared blue link button styling
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
  },
};

