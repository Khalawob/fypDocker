import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBackground } from "../context/BackgroundContext";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const DEFAULT_THEME = {
  top_color: "#121a2a",
  bottom_color: "#0b1220",
  text_color: "#ffffff",
  accent_color: "#3b82f6",
  border_radius: "12px",
};

export default function Sets() {
  const navigate = useNavigate();
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");

  const { selectedBackground } = useBackground();

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

  useEffect(() => {
    loadSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      if (!res.ok) {
        setError(data?.message || "Failed to load sets");
        return;
      }

      setSets(Array.isArray(data) ? data : data.sets || []);
    } catch (err) {
      setError("Server error while loading sets");
    } finally {
      setLoading(false);
    }
  }

  function startPractice(setId) {
    navigate(`/practice?set_id=${setId}`);
  }

  function getTheme(set) {
    return {
      top_color: set?.top_color || DEFAULT_THEME.top_color,
      bottom_color: set?.bottom_color || DEFAULT_THEME.bottom_color,
      text_color: set?.text_color || DEFAULT_THEME.text_color,
      accent_color: set?.accent_color || DEFAULT_THEME.accent_color,
      border_radius: set?.border_radius || DEFAULT_THEME.border_radius,
    };
  }

  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1>Your Flashcard Sets</h1>

          <div style={styles.buttonRow}>
            <Link to="/" style={styles.linkButton}>Home</Link>
            <Link to="/sets/create" style={styles.linkButton}>Create Set</Link>
          </div>
        </div>

        {loading && <div style={styles.card}>Loading sets...</div>}
        {error && <div style={styles.error}>{error}</div>}

        {!loading && !error && sets.length === 0 && (
          <div style={styles.card}>
            <p>No flashcard sets found.</p>
          </div>
        )}

        {!loading && !error && sets.length > 0 && (
          <div style={styles.grid}>
            {sets.map((set) => {
              const theme = getTheme(set);

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

              const themedOpenButtonStyle = {
                ...styles.linkButton,
                backgroundColor: "#3b82f6",
                color: "#ffffff",
              };

              const themedPracticeButtonStyle = {
                ...styles.primaryButton,
                backgroundColor: "#22c55e",
                color: "#ffffff",
                
              };

              return (
                <div key={set.set_id} style={cardWrapperStyle}>
                  <div style={topHalfStyle}>
                    <h2 style={styles.setTitle}>{set.title}</h2>
                    <p style={styles.description}>
                      {set.description || "No description"}
                    </p>
                  </div>

                  <div style={bottomHalfStyle}>

                    <div style={styles.previewThemeRow}>
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
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap",
    gap: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
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
  setTitle: {
    marginTop: 0,
    marginBottom: 10,
  },
  description: {
    opacity: 0.9,
    marginBottom: 0,
    lineHeight: 1.5,
  },
  meta: {
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 12,
  },
  previewThemeRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  themeDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    display: "inline-block",
  },
  shapeLabel: {
    fontSize: 13,
    opacity: 0.95,
    marginLeft: 4,
  },
  buttonRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
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
  linkButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
  },
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 12,
    borderRadius: 8,
  },
};

