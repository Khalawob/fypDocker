import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function SetDetails() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [setInfo, setSetInfo] = useState(null);
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

      const [setRes, flashcardsRes] = await Promise.all([
        fetch(`${API_URL}/api/sets/${setId}`, { headers }),
        fetch(`${API_URL}/api/sets/${setId}/cards`, { headers }),
      ]);

      const setData = await setRes.json().catch(() => ({}));
      const flashcardsData = await flashcardsRes.json().catch(() => []);

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
    } catch (err) {
      setError("Server error while loading set details");
    } finally {
      setLoading(false);
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

  return (
    <div style={styles.page}>
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


            <Link to={`/sets/${setId}/add-flashcard`} style={styles.primaryButtonLink}>
              Add Flashcard
            </Link>

            <button style={styles.primaryButton} onClick={startPractice}>
              Practice Set
            </button>

            <button style={styles.deleteButton} onClick={deleteSet}>
              Delete Set
            </button>
          </div>
        </div>

        {loading && <div style={styles.card}>Loading set...</div>}
        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        {!loading && !error && flashcards.length === 0 && (
          <div style={styles.card}>
            <h3>No flashcards yet</h3>
            <p style={styles.emptyText}>
              Add your first flashcard to start building this set.
            </p>
            <Link to={`/sets/${setId}/add-flashcard`} style={styles.primaryButtonLink}>
              Add First Flashcard
            </Link>
          </div>
        )}

        {!loading && !error && flashcards.length > 0 && (
          <div style={styles.list}>
            {flashcards.map((card) => (
              <div key={card.flashcard_id} style={styles.card}>
                <div style={styles.cardMeta}>
                  Flashcard ID: {card.flashcard_id}
                </div>

                <div style={styles.block}>
                  <div style={styles.label}>Question</div>
                  <div style={styles.text}>{card.question}</div>
                </div>

                <div style={styles.block}>
                  <div style={styles.label}>Answer</div>
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
  card: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
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

