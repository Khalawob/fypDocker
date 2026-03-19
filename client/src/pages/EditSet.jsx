import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useBackground } from "../context/BackgroundContext";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const DEFAULT_THEME = {
  top_color: "#121a2a",
  bottom_color: "#0b1220",
  text_color: "#ffffff",
  accent_color: "#3b82f6",
  border_radius: "12px",
};

export default function EditSet() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [form, setForm] = useState({
    title: "",
    description: "",
    top_color: DEFAULT_THEME.top_color,
    bottom_color: DEFAULT_THEME.bottom_color,
    text_color: DEFAULT_THEME.text_color,
    accent_color: DEFAULT_THEME.accent_color,
    border_radius: DEFAULT_THEME.border_radius,
  });

  const { selectedBackground } = useBackground();

  const pageStyle = {
    ...styles.page,
    ...(selectedBackground?.image_url
      ? {
          backgroundImage: `linear-gradient(rgba(11,18,32,0.78), rgba(11,18,32,0.78)), url(${selectedBackground.image_url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }
      : {}),
  };

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
          top_color: form.top_color,
          bottom_color: form.bottom_color,
          text_color: form.text_color,
          accent_color: form.accent_color,
          border_radius: form.border_radius,
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

  const previewWrapperStyle = {
    borderRadius: form.border_radius,
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    border: `2px solid ${form.accent_color}`,
    marginTop: 18,
  };

  const previewTopStyle = {
    background: form.top_color,
    color: form.text_color,
    padding: 20,
  };

  const previewBottomStyle = {
    background: form.bottom_color,
    color: form.text_color,
    padding: 20,
    borderTop: `1px solid ${form.accent_color}`,
  };

  return (
    <div style={pageStyle}>
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
              Update the title, description, and appearance for this flashcard set.
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

            <div style={styles.helpText}>
              This style will be shown when viewing the set and during practice mode.
            </div>

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
    boxSizing: "border-box",
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
    boxSizing: "border-box",
  },
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
  appearanceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginTop: 8,
  },
  sectionHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    gap: 12,
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
  },
  helpText: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 6,
    lineHeight: 1.45,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: 700,
    opacity: 0.85,
    marginBottom: 6,
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
  secondarySmallButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
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