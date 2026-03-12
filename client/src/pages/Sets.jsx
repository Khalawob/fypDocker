import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function Sets() {
  const navigate = useNavigate();
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");

  useEffect(() => {
    loadSets();
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

  return (
    <div style={styles.page}>
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
            {sets.map((set) => (
              <div key={set.set_id} style={styles.card}>
                <h2 style={styles.setTitle}>{set.title}</h2>
                <p style={styles.description}>
                  {set.description || "No description"}
                </p>

                <p style={styles.meta}>
                  <strong>Set ID:</strong> {set.set_id}
                </p>

                <div style={styles.buttonRow}>
                  <Link to={`/sets/${set.set_id}`} style={styles.linkButton}>
                    Open Set
                  </Link>

                  <button
                    style={styles.primaryButton}
                    onClick={() => startPractice(set.set_id)}
                  >
                    Practice This Set
                  </button>
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
  setTitle: {
    marginTop: 0,
    marginBottom: 10,
  },
  description: {
    opacity: 0.9,
    marginBottom: 16,
  },
  meta: {
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 16,
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

