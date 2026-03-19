import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useBackground } from "../context/BackgroundContext";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function ImportDocument() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [text, setText] = useState("");
  const [maxCards, setMaxCards] = useState(8);

  const [drafts, setDrafts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);
  const [extracting, setExtracting] = useState(false);

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

  const selectedCount = useMemo(
    () => drafts.filter((d) => selectedIds.includes(d.local_id)).length,
    [drafts, selectedIds]
  );

  function validateGenerate() {
    if (!text.trim()) return "Please paste some document text first.";
    if (text.trim().split(/\s+/).length < 8) {
      return "The text is too short to generate useful flashcards.";
    }
    return "";
  }

  async function handleExtractDocument() {
    setError("");
    setSuccess("");

    if (!selectedFile) {
      setError("Please choose a .docx or .pdf file first.");
      return;
    }

    const fileName = selectedFile.name ? selectedFile.name.toLowerCase() : "";
    const isDocx = fileName.endsWith(".docx");
    const isPdf = fileName.endsWith(".pdf");

    if (!isDocx && !isPdf) {
      setError("Only .docx and .pdf files are supported right now.");
      return;
    }

    try {
      setExtracting(true);

      const formData = new FormData();
      formData.append("document", selectedFile);

      const res = await fetch(
        `${API_URL}/api/sets/${setId}/extract-document-text`,
        {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || "Failed to extract document text");
        return;
      }

      setText(data?.text || "");
      setDrafts([]);
      setSelectedIds([]);
      setSuccess("Document text extracted. Review it, then generate flashcards.");
    } catch (err) {
      setError("Server error while extracting document text.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const validationError = validateGenerate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setGenerating(true);

      const res = await fetch(`${API_URL}/api/sets/${setId}/import-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          text: text.trim(),
          max_cards: Number(maxCards),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to generate flashcards");
        return;
      }

      const incomingDrafts = Array.isArray(data?.drafts) ? data.drafts : [];

      const withIds = incomingDrafts
        .map((card, index) => ({
          local_id: `${Date.now()}-${index}`,
          question: card.question || "",
          answer: card.answer || "",
          score:
            card.score !== undefined && card.score !== null
              ? Number(card.score)
              : null,
        }))
        .sort((a, b) => (b.score ?? -999) - (a.score ?? -999));

      setDrafts(withIds);
      setSelectedIds(withIds.map((card) => card.local_id));

      if (withIds.length === 0) {
        setSuccess("No strong flashcards were found. Try shorter, more definition-based text.");
      } else {
        setSuccess(`${withIds.length} draft flashcards generated. Review them before saving.`);
      }
    } catch (err) {
      setError("Server error while generating flashcards.");
    } finally {
      setGenerating(false);
    }
  }

  function updateDraft(localId, field, value) {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.local_id === localId ? { ...draft, [field]: value } : draft
      )
    );
  }

  function removeDraft(localId) {
    setDrafts((prev) => prev.filter((draft) => draft.local_id !== localId));
    setSelectedIds((prev) => prev.filter((id) => id !== localId));
  }

  function toggleSelected(localId) {
    setSelectedIds((prev) =>
      prev.includes(localId)
        ? prev.filter((id) => id !== localId)
        : [...prev, localId]
    );
  }

  function selectAll() {
    setSelectedIds(drafts.map((draft) => draft.local_id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function cleanCardsForSave() {
    return drafts
      .filter((draft) => selectedIds.includes(draft.local_id))
      .map((draft) => ({
        question: String(draft.question || "").trim(),
        answer: String(draft.answer || "").trim(),
      }))
      .filter((draft) => draft.question && draft.answer);
  }

  async function handleSaveSelected() {
    setError("");
    setSuccess("");

    const cards = cleanCardsForSave();

    if (cards.length === 0) {
      setError("Please select at least one valid flashcard to save.");
      return;
    }

    try {
      setSaving(true);

      const res = await fetch(`${API_URL}/api/sets/${setId}/cards/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cards }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to save flashcards");
        return;
      }

      setSuccess(`${data?.inserted_count || cards.length} flashcards saved successfully.`);
      setTimeout(() => {
        navigate(`/sets/${setId}`);
      }, 700);
    } catch (err) {
      setError("Server error while saving flashcards.");
    } finally {
      setSaving(false);
    }
  }

  function getScoreLabel(score) {
    if (score === null || score === undefined || Number.isNaN(score)) return "Unscored";
    if (score >= 5) return "Strong";
    if (score >= 3) return "Okay";
    return "Weak";
  }

  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Import From Document</h1>
          <div style={styles.headerButtons}>
            <Link to={`/sets/${setId}`} style={styles.linkButton}>
              Back to Set
            </Link>
            <Link to={`/sets/${setId}/add-flashcard`} style={styles.linkButton}>
              Add Manually
            </Link>
          </div>
        </div>

        <div style={styles.card}>
          <p style={styles.description}>
            Upload a document or paste text, generate draft flashcards, review them, then save the good ones.
          </p>

          <label style={styles.label}>Upload Document</label>
          <input
            type="file"
            accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setSelectedFile(file);
            }}
            style={styles.fileInput}
          />

          <div style={styles.helpText}>
            Upload a Word document or PDF and its text will be placed into the box below for review.
          </div>

          <div style={styles.buttonRow}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={handleExtractDocument}
              disabled={extracting}
            >
              {extracting ? "Extracting..." : "Extract Text From Document"}
            </button>
          </div>
        </div>

        <form onSubmit={handleGenerate} style={styles.card}>
          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.success}>{success}</div>}

          <label style={styles.label}>Document Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={styles.largeTextarea}
            placeholder="Paste notes, lecture content, or revision text here..."
          />
          <div style={styles.helpText}>
            Best results usually come from short factual notes and definition-style sentences.
          </div>

          <div style={styles.row}>
            <div style={styles.fieldBlock}>
              <label style={styles.label}>Maximum Draft Cards</label>
              <select
                value={maxCards}
                onChange={(e) => setMaxCards(Number(e.target.value))}
                style={styles.select}
              >
                <option value={5}>5</option>
                <option value={8}>8</option>
                <option value={10}>10</option>
                <option value={12}>12</option>
              </select>
            </div>
          </div>

          <div style={styles.buttonRow}>
            <button type="submit" style={styles.primaryButton} disabled={generating}>
              {generating ? "Generating..." : "Generate Draft Flashcards"}
            </button>
          </div>
        </form>

        {drafts.length > 0 && (
          <div style={styles.card}>
            <div style={styles.reviewHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Review Drafts</h2>
                <p style={styles.sectionText}>
                  Edit any weak cards, remove bad ones, and save only the drafts you want.
                </p>
              </div>

              <div style={styles.reviewActions}>
                <button type="button" style={styles.secondaryButtonSmall} onClick={selectAll}>
                  Select All
                </button>
                <button type="button" style={styles.secondaryButtonSmall} onClick={clearSelection}>
                  Clear Selection
                </button>
              </div>
            </div>

            <div style={styles.selectionMeta}>
              {selectedCount} selected out of {drafts.length}
            </div>

            <div style={styles.draftList}>
              {drafts.map((draft, index) => (
                <div key={draft.local_id} style={styles.draftCard}>
                  <div style={styles.draftTopRow}>
                    <label style={styles.checkboxWrap}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(draft.local_id)}
                        onChange={() => toggleSelected(draft.local_id)}
                      />
                      Save this card
                    </label>

                    <div style={styles.metaGroup}>
                      <span style={styles.metaBadge}>Draft {index + 1}</span>
                      <span style={styles.metaBadge}>
                        {getScoreLabel(draft.score)}
                        {draft.score !== null && draft.score !== undefined
                          ? ` (${draft.score})`
                          : ""}
                      </span>
                    </div>
                  </div>

                  <label style={styles.label}>Question</label>
                  <textarea
                    value={draft.question}
                    onChange={(e) =>
                      updateDraft(draft.local_id, "question", e.target.value)
                    }
                    style={styles.textarea}
                    placeholder="Generated question"
                  />

                  <label style={styles.label}>Answer</label>
                  <textarea
                    value={draft.answer}
                    onChange={(e) =>
                      updateDraft(draft.local_id, "answer", e.target.value)
                    }
                    style={styles.textarea}
                    placeholder="Generated answer"
                  />

                  <div style={styles.inlineActions}>
                    <button
                      type="button"
                      style={styles.deleteButton}
                      onClick={() => removeDraft(draft.local_id)}
                    >
                      Remove Draft
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.buttonRow}>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleSaveSelected}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Selected Flashcards"}
              </button>
            </div>
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
    maxWidth: 900,
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
  headerButtons: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
  },
  card: {
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    marginBottom: 24,
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
  fileInput: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    boxSizing: "border-box",
  },
  largeTextarea: {
    width: "100%",
    minHeight: 220,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 110,
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
  },
  helpText: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 6,
    lineHeight: 1.45,
  },
  row: {
    display: "flex",
    gap: 16,
    marginTop: 14,
    flexWrap: "wrap",
  },
  fieldBlock: {
    minWidth: 180,
  },
  select: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    outline: "none",
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
  secondaryButtonSmall: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  },
  deleteButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#ef4444",
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
  reviewHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "center",
  },
  reviewActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
  },
  sectionText: {
    marginTop: 6,
    opacity: 0.85,
    lineHeight: 1.45,
  },
  selectionMeta: {
    marginTop: 14,
    marginBottom: 14,
    fontWeight: 600,
    opacity: 0.95,
  },
  draftList: {
    display: "grid",
    gap: 16,
  },
  draftCard: {
    border: "1px solid #2b3550",
    borderRadius: 12,
    padding: 16,
    background: "#0b1220",
  },
  draftTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  checkboxWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 600,
  },
  metaGroup: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  metaBadge: {
    background: "#1e293b",
    color: "#bfdbfe",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: "0.85rem",
    fontWeight: 600,
    border: "1px solid #334155",
  },
  inlineActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 12,
  },
};
