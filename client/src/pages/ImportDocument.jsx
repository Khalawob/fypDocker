// Import React hooks:
// useMemo is used to calculate derived values efficiently,
// useState is used to store local component state values.
import { useMemo, useState } from "react";

// Import React Router helpers:
// Link is used for clickable navigation links,
// useNavigate is used for programmatic navigation,
// useParams is used to read the setId from the current route.
import { Link, useNavigate, useParams } from "react-router-dom";

// Import the background context so the user's selected background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Main page component for importing flashcards from document text
export default function ImportDocument() {
  // Read the setId from the current route so imported cards can be added to the correct set
  const { setId } = useParams();

  // React Router navigation helper used to return the user to the set page after saving cards
  const navigate = useNavigate();

  // Read the auth token from localStorage so authenticated API requests can be made
  const token = localStorage.getItem("token");

  // Stores the extracted or manually pasted document text that will be used for flashcard generation
  const [text, setText] = useState("");

  // Stores the maximum number of draft flashcards the user wants to generate
  const [maxCards, setMaxCards] = useState(8);

  // Stores the generated draft flashcards before the user saves them
  const [drafts, setDrafts] = useState([]);

  // Stores the local IDs of draft cards currently selected for saving
  const [selectedIds, setSelectedIds] = useState([]);

  // Tracks whether the app is currently generating draft flashcards
  const [generating, setGenerating] = useState(false);

  // Tracks whether selected flashcards are currently being saved to the backend
  const [saving, setSaving] = useState(false);

  // Stores any error message to show on screen
  const [error, setError] = useState("");

  // Stores any success message to show on screen
  const [success, setSuccess] = useState("");

  // Stores the file selected by the user for document text extraction
  const [selectedFile, setSelectedFile] = useState(null);

  // Tracks whether the app is currently extracting text from the uploaded file
  const [extracting, setExtracting] = useState(false);

  // Get the selected custom background from the shared background context
  const { selectedBackground } = useBackground();

  // Build the final page style object.
  // It starts with the default page styles and conditionally adds a selected background image
  // with a dark overlay so text remains readable.
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

  // Calculate how many currently visible draft cards are selected for saving.
  // useMemo avoids recalculating this on every render unless drafts or selectedIds change.
  const selectedCount = useMemo(
    () => drafts.filter((d) => selectedIds.includes(d.local_id)).length,
    [drafts, selectedIds]
  );

  // Validates whether the current document text is suitable for generating flashcards
  function validateGenerate() {
    if (!text.trim()) return "Please paste some document text first.";
    if (text.trim().split(/\s+/).length < 8) {
      return "The text is too short to generate useful flashcards.";
    }
    return "";
  }

  // Handles extracting raw text from an uploaded .docx or .pdf file
  async function handleExtractDocument() {
    setError("");
    setSuccess("");

    // Make sure the user selected a file first
    if (!selectedFile) {
      setError("Please choose a .docx or .pdf file first.");
      return;
    }

    // Check that the uploaded file has a supported extension
    const fileName = selectedFile.name ? selectedFile.name.toLowerCase() : "";
    const isDocx = fileName.endsWith(".docx");
    const isPdf = fileName.endsWith(".pdf");

    if (!isDocx && !isPdf) {
      setError("Only .docx and .pdf files are supported right now.");
      return;
    }

    try {
      setExtracting(true);

      // Build form data so the file can be uploaded as multipart/form-data
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

      // Show an error if text extraction fails
      if (!res.ok) {
        setError(data?.message || "Failed to extract document text");
        return;
      }

      // Store the extracted text, clear any old drafts, and show success feedback
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

  // Handles generating draft flashcards from the current text
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

      // Show an error if generation fails
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to generate flashcards");
        return;
      }

      // Read the returned draft flashcards safely
      const incomingDrafts = Array.isArray(data?.drafts) ? data.drafts : [];

      // Add a local ID to each draft so the frontend can track edits, deletion, and selection
      // Then sort drafts so stronger cards appear first
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

      // By default, select every generated draft for saving
      setSelectedIds(withIds.map((card) => card.local_id));

      // Show feedback depending on whether any good drafts were generated
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

  // Updates a specific field in a specific draft card
  function updateDraft(localId, field, value) {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.local_id === localId ? { ...draft, [field]: value } : draft
      )
    );
  }

  // Removes a draft card entirely and also removes it from the selected list
  function removeDraft(localId) {
    setDrafts((prev) => prev.filter((draft) => draft.local_id !== localId));
    setSelectedIds((prev) => prev.filter((id) => id !== localId));
  }

  // Toggles whether a draft card is selected for saving
  function toggleSelected(localId) {
    setSelectedIds((prev) =>
      prev.includes(localId)
        ? prev.filter((id) => id !== localId)
        : [...prev, localId]
    );
  }

  // Selects every draft card
  function selectAll() {
    setSelectedIds(drafts.map((draft) => draft.local_id));
  }

  // Clears all selected draft cards
  function clearSelection() {
    setSelectedIds([]);
  }

  // Cleans and prepares the selected draft cards so only valid question/answer pairs are sent to the backend
  function cleanCardsForSave() {
    return drafts
      .filter((draft) => selectedIds.includes(draft.local_id))
      .map((draft) => ({
        question: String(draft.question || "").trim(),
        answer: String(draft.answer || "").trim(),
      }))
      .filter((draft) => draft.question && draft.answer);
  }

  // Saves the currently selected valid draft cards to the backend
  async function handleSaveSelected() {
    setError("");
    setSuccess("");

    const cards = cleanCardsForSave();

    // Make sure at least one valid selected card exists before saving
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

      // Show an error if saving fails
      if (!res.ok) {
        setError(data?.message || data?.error || "Failed to save flashcards");
        return;
      }

      // Show success feedback and return to the set page shortly after
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

  // Converts a numeric draft score into a simple user-friendly quality label
  function getScoreLabel(score) {
    if (score === null || score === undefined || Number.isNaN(score)) return "Unscored";
    if (score >= 5) return "Strong";
    if (score >= 3) return "Okay";
    return "Weak";
  }

  // Render the Import Document page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header row with page title and navigation buttons */}
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

        {/* Card for document upload and text extraction */}
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

        {/* Main form for generating draft flashcards from the current text */}
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

        {/* Review section only appears once at least one draft flashcard exists */}
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

            {/* Summary showing how many draft cards are currently selected */}
            <div style={styles.selectionMeta}>
              {selectedCount} selected out of {drafts.length}
            </div>

            {/* List of editable generated draft flashcards */}
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

            {/* Final save button for sending selected reviewed draft cards into the set */}
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

// Centralised styles object for the Import Document page.
// Keeps layout and appearance styling separate from the main component logic.
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
    maxWidth: 900,
    margin: "0 auto",
  },

  // Header row layout for title and action buttons
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 24,
  },

  // Container for the header navigation buttons
  headerButtons: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },

  // Main page title styling
  title: {
    margin: 0,
  },

  // Shared card styling for all major content sections
  card: {
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    marginBottom: 24,
  },

  // Description text shown near the top of cards
  description: {
    marginTop: 0,
    marginBottom: 20,
    opacity: 0.9,
    lineHeight: 1.5,
  },

  // Shared label styling for fields
  label: {
    display: "block",
    fontWeight: 600,
    marginBottom: 6,
    marginTop: 14,
  },

  // File input styling
  fileInput: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    boxSizing: "border-box",
  },

  // Large textarea styling used for the full document text input
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

  // Standard textarea styling used for draft question/answer editing
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

  // Small helper text styling
  helpText: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 6,
    lineHeight: 1.45,
  },

  // Row layout used for grouped fields
  row: {
    display: "flex",
    gap: 16,
    marginTop: 14,
    flexWrap: "wrap",
  },

  // Small field wrapper used around compact form controls
  fieldBlock: {
    minWidth: 180,
  },

  // Shared select dropdown styling
  select: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    outline: "none",
  },

  // Layout row used for action buttons
  buttonRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 24,
  },

  // Primary green action button styling
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

  // Secondary button styling
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

  // Smaller secondary button styling used in the review section
  secondaryButtonSmall: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  },

  // Red delete button styling used for removing draft cards
  deleteButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#ef4444",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  },

  // Styled link button used in the page header
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

  // Header layout for the draft review section
  reviewHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "center",
  },

  // Layout for the review section action buttons
  reviewActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  // Section title styling used in the review section
  sectionTitle: {
    margin: 0,
  },

  // Supporting text styling used below section titles
  sectionText: {
    marginTop: 6,
    opacity: 0.85,
    lineHeight: 1.45,
  },

  // Text showing how many drafts are currently selected
  selectionMeta: {
    marginTop: 14,
    marginBottom: 14,
    fontWeight: 600,
    opacity: 0.95,
  },

  // Grid layout for the list of generated draft cards
  draftList: {
    display: "grid",
    gap: 16,
  },

  // Styling for each generated draft card container
  draftCard: {
    border: "1px solid #2b3550",
    borderRadius: 12,
    padding: 16,
    background: "#0b1220",
  },

  // Top row inside each draft card for selection checkbox and metadata
  draftTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },

  // Layout for the save-this-card checkbox label
  checkboxWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 600,
  },

  // Layout for grouped metadata badges
  metaGroup: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  // Badge styling for draft number and quality score
  metaBadge: {
    background: "#1e293b",
    color: "#bfdbfe",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: "0.85rem",
    fontWeight: 600,
    border: "1px solid #334155",
  },

  // Layout for actions inside each draft card
  inlineActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 12,
  },
};
