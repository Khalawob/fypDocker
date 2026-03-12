import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function EditSet() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [form, setForm] = useState({
    title: "",
    description: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadSet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    if (!form.title.trim()) return "Title is required";
    if (form.title.trim().length < 2) {
      return "Title must be at least 2 characters";
    }
    return "";
  }

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

      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to load set");
        return;
      }

      setForm({
        title: data.title || "",
        description: data.description || "",
      });
    } catch (err) {
      setError("Server error while loading set");
    } finally {
      setLoading(false);
    }
  }

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

      const res = await fetch(`${API_URL}/api/sets/${setId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to update set");
        return;
      }

      setSuccess("Set updated successfully");

      setTimeout(() => {
        navigate(`/sets/${setId}`);
      }, 700);
    } catch (err) {
      setError("Server error while updating set");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Edit Set</h1>
          <Link to={`/sets/${setId}`} style={styles.linkButton}>
            Back to Set
          </Link>
        </div>

        {loading && <div style={styles.card}>Loading set...</div>}

        {!loading && (
          <form onSubmit={onSubmit} style={styles.card}>
            <p style={styles.description}>
              Update the title and description for this flashcard set.
            </p>

            {error && <div style={styles.error}>{error}</div>}
            {success && <div style={styles.success}>{success}</div>}

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

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },
  container: {
    maxWidth: 760,
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 24,
  },
  title: {
    margin: 0,
  },
  card: {
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  description: {
    marginTop: 0,
    marginBottom: 20,
    opacity: 0.9,
    lineHeight: 1.5,
  },
  label: {
    display: "block",
    fontWeight: 600,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    outline: "none",
  },
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
  },
  helpText: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 6,
    lineHeight: 1.45,
  },
  buttonRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 24,
  },
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
