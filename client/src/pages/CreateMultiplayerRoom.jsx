// Import React hooks:
// useEffect runs side effects when the component loads,
// useState stores local component state values.
import { useEffect, useState } from "react";

// Import React Router helpers:
// useNavigate is used to move the user to another route programmatically,
// useSearchParams is used to read query string values from the URL,
// Link is used for clickable navigation links.
import { useNavigate, useSearchParams, Link } from "react-router-dom";

// Import QRCodeCanvas so the generated room join link can be shown as a QR code
import { QRCodeCanvas } from "qrcode.react";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// A lookup object describing the available prompt types for multiplayer practice.
// Each option has a user-friendly label and explanation shown in the form.
const PROMPT_TYPES = {
  NORMAL_HIDDEN: {
    label: "Hidden Answer",
    description: "The full answer is hidden. You must recall it completely from memory.",
  },
  ALL_BLANKS: {
    label: "All Important Words Blanked",
    description: "All eligible words are hidden. Use blank style to choose hints or full blanks.",
  },
  RANDOM_BLANKS: {
    label: "Partial Blanks",
    description: "Some eligible words are hidden. Use blank style to choose hints or full blanks.",
  },
  KEY_TERMS_ONLY: {
    label: "Key Terms Only",
    description: "Important nouns and key concepts are blanked out.",
  },
  EVERY_OTHER_WORD: {
    label: "Every Other Word",
    description: "Every second important word is hidden.",
  },
  INCREASING_DIFFICULTY: {
    label: "Increasing Difficulty",
    description: "Each attempt hides more words, making the card harder.",
  },
  DIFFICULTY_LEVEL_BLANKS: {
    label: "Difficulty Levels",
    description: "The number of blanks depends on the difficulty level.",
  },
};

// Main page component for creating a multiplayer room
export default function CreateMultiplayerRoom() {
  // Read the user's auth token from localStorage so authenticated API requests can be made
  const token = localStorage.getItem("token");

  // React Router navigation helper used to move the user into the room after creation
  const navigate = useNavigate();

  // Read any query string values from the current URL
  const [searchParams] = useSearchParams();

  // Stores the flashcard sets that belong to the user and can be selected for the room
  const [sets, setSets] = useState([]);

  // Tracks whether the set list is currently loading
  const [loadingSets, setLoadingSets] = useState(true);

  // Tracks whether the room creation request is currently in progress
  const [creating, setCreating] = useState(false);

  // Stores any error message that should be shown to the user
  const [error, setError] = useState("");

  // Stores the created room data returned by the backend after successful creation
  const [roomData, setRoomData] = useState(null);

  // Controls whether the advanced settings section is expanded or hidden
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Stores all form values used to configure the multiplayer room.
  // set_id may be prefilled from the URL query string if present.
  const [form, setForm] = useState({
    set_id: searchParams.get("set_id") || "",
    display_name: "",
    difficulty_mode: "EASY",
    prompt_type: "NORMAL_HIDDEN",
    blank_style: "FIRST_LETTER",
    randomize_order: true,
    group_size: 5,
    answer_time_limit: 20,
    display_time_per_card: 10,
    blank_ratio: "",
  });

  // Determines whether the blank style selector should be shown.
  // It is hidden when the prompt type is the normal hidden-answer mode.
  const shouldShowBlankStyle = form.prompt_type !== "NORMAL_HIDDEN";

  // Determines whether the blank ratio input should be shown.
  // It is only relevant for prompt types that hide a percentage of words.
  const shouldShowBlankRatio =
    form.prompt_type === "RANDOM_BLANKS" ||
    form.prompt_type === "INCREASING_DIFFICULTY";

  // Load the user's flashcard sets when the page first opens
  useEffect(() => {
    loadSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetches the user's available flashcard sets from the backend
  async function loadSets() {
    try {
      setLoadingSets(true);
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

      // Save the fetched set list
      const nextSets = Array.isArray(data) ? data : data?.sets || [];
      setSets(nextSets);

      // If a set_id is provided in the URL and it exists in the fetched sets, use it.
      // Otherwise, default to the first available set if none is already selected.
      const querySetId = searchParams.get("set_id");

      if (
        querySetId &&
        nextSets.some((set) => String(set.set_id) === String(querySetId))
      ) {
        setForm((prev) => ({
          ...prev,
          set_id: String(querySetId),
        }));
      } else if (nextSets.length > 0 && !form.set_id) {
        setForm((prev) => ({
          ...prev,
          set_id: String(nextSets[0].set_id),
        }));
      }
    } catch {
      setError("Server error while loading sets");
    } finally {
      setLoadingSets(false);
    }
  }

  // Generic form change handler.
  // It supports both normal inputs and checkbox inputs.
  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  // Handles submission of the room creation form.
  // It validates the set selection, builds the payload, sends the request,
  // and stores the returned room data if successful.
  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setRoomData(null);

    if (!form.set_id) {
      setError("Please select a flashcard set.");
      return;
    }

    try {
      setCreating(true);

      // Build the payload sent to the backend
      const payload = {
        set_id: Number(form.set_id),
        display_name: form.display_name.trim() || "Host",
        difficulty_mode: form.difficulty_mode,
        prompt_type: form.prompt_type,
        blank_style: form.blank_style,
        randomize_order: !!form.randomize_order,
        group_size: Number(form.group_size),
        answer_time_limit: Number(form.answer_time_limit),
        display_time_per_card: Number(form.display_time_per_card),
      };

      // Only include blank_ratio if the user actually entered one
      if (form.blank_ratio !== "") {
        payload.blank_ratio = Number(form.blank_ratio);
      }

      const res = await fetch(`${API_URL}/api/multiplayer/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      // Show an error if room creation fails
      if (!res.ok) {
        setError(data?.message || "Failed to create room");
        return;
      }

      // Save the room data so the success screen can be displayed
      setRoomData(data);
    } catch {
      setError("Server error while creating room");
    } finally {
      setCreating(false);
    }
  }

  // Opens the created multiplayer room by navigating to its room page
  function openRoom() {
    if (!roomData?.room?.join_code) return;
    navigate(`/multiplayer/room/${roomData.room.join_code}`);
  }

  // Render the Create Multiplayer Room page UI
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header row with page title and back navigation */}
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Create Multiplayer Room</h1>

          <Link to="/sets" style={styles.backLink}>
            Back to Sets
          </Link>
        </div>

        {/* Show the setup form only before a room has been created */}
        {!roomData && (
          <form onSubmit={onSubmit} style={styles.card}>
            <h2 style={styles.sectionTitle}>Room Setup</h2>
            <p style={styles.sectionDescription}>
              Choose the set and core multiplayer options below. Advanced settings can be opened if needed.
            </p>

            {/* Main grid of core room configuration inputs */}
            <div style={styles.grid}>
              <div>
                <label style={styles.label}>Flashcard Set</label>
                <select
                  name="set_id"
                  value={form.set_id}
                  onChange={onChange}
                  style={styles.input}
                  disabled={loadingSets}
                >
                  <option value="">
                    {loadingSets ? "Loading sets..." : "Select a set"}
                  </option>
                  {sets.map((set) => (
                    <option key={set.set_id} value={set.set_id}>
                      {set.title}
                    </option>
                  ))}
                </select>
                <div style={styles.helpText}>
                  Choose the flashcard set this multiplayer room will use.
                </div>
              </div>

              <div>
                <label style={styles.label}>Your Display Name</label>
                <input
                  name="display_name"
                  value={form.display_name}
                  onChange={onChange}
                  style={styles.input}
                  placeholder="Host name"
                  maxLength={80}
                />
                <div style={styles.helpText}>
                  This is the name shown to players in the room.
                </div>
              </div>

              <div>
                <label style={styles.label}>Difficulty Mode</label>
                <select
                  name="difficulty_mode"
                  value={form.difficulty_mode}
                  onChange={onChange}
                  style={styles.input}
                >
                  <option value="EASY">EASY</option>
                  <option value="MODERATE">MODERATE</option>
                  <option value="HARD">HARD</option>
                </select>
                <div style={styles.helpText}>
                  EASY gives more support, MODERATE mixes study and recall, HARD focuses on memory testing.
                </div>
              </div>

              <div>
                <label style={styles.label}>Prompt Type</label>
                <select
                  name="prompt_type"
                  value={form.prompt_type}
                  onChange={onChange}
                  style={styles.input}
                >
                  {Object.entries(PROMPT_TYPES).map(([value, config]) => (
                    <option key={value} value={value}>
                      {config.label}
                    </option>
                  ))}
                </select>
                <div style={styles.helpText}>
                  {PROMPT_TYPES[form.prompt_type]?.description}
                </div>
              </div>

              {/* Conditionally show blank style options depending on the selected prompt type */}
              {shouldShowBlankStyle && (
                <div>
                  <label style={styles.label}>Blank Style</label>
                  <select
                    name="blank_style"
                    value={form.blank_style}
                    onChange={onChange}
                    style={styles.input}
                  >
                    <option value="FIRST_LETTER">First Letter Hints</option>
                    <option value="FULL">Fully Blanked</option>
                  </select>
                  <div style={styles.helpText}>
                    Choose whether hidden words show their first letter or are completely blanked.
                  </div>
                </div>
              )}
            </div>

            {/* Button for expanding or collapsing the advanced settings section */}
            <button
              type="button"
              style={styles.advancedToggle}
              onClick={() => setShowAdvanced((prev) => !prev)}
            >
              {showAdvanced ? "Hide Advanced Settings ▲" : "Show Advanced Settings ▼"}
            </button>

            {/* Advanced settings only appear when the user expands the section */}
            {showAdvanced && (
              <div style={styles.advancedSection}>
                <div style={styles.subsectionTitle}>Advanced Settings</div>

                <div style={styles.grid}>
                  {/* Blank ratio input only appears for prompt types that support a ratio */}
                  {shouldShowBlankRatio && (
                    <div>
                      <label style={styles.label}>Blank Ratio</label>
                      <input
                        name="blank_ratio"
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={form.blank_ratio}
                        onChange={onChange}
                        style={styles.input}
                        placeholder="e.g. 0.4"
                      />
                      <div style={styles.helpText}>
                        Controls how many words are hidden. Example: 0.4 means about 40% of eligible words are blanked.
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={styles.label}>Group Size</label>
                    <input
                      name="group_size"
                      type="number"
                      min="1"
                      value={form.group_size}
                      onChange={onChange}
                      style={styles.input}
                    />
                    <div style={styles.helpText}>
                      Used in MODERATE mode. Sets how many cards are previewed and tested together.
                    </div>
                  </div>

                  <div>
                    <label style={styles.label}>Display Time Per Card</label>
                    <input
                      name="display_time_per_card"
                      type="number"
                      min="1"
                      value={form.display_time_per_card}
                      onChange={onChange}
                      style={styles.input}
                    />
                    <div style={styles.helpText}>
                      Preview time in seconds before the next card continues automatically.
                    </div>
                  </div>

                  <div>
                    <label style={styles.label}>Answer Time Limit</label>
                    <input
                      name="answer_time_limit"
                      type="number"
                      min="1"
                      value={form.answer_time_limit}
                      onChange={onChange}
                      style={styles.input}
                    />
                    <div style={styles.helpText}>
                      Maximum time in seconds allowed to type an answer before it is submitted automatically.
                    </div>
                  </div>
                </div>

                {/* Checkbox options for additional room behavior */}
                <div style={styles.checkboxGroup}>
                  <label style={styles.checkboxRow}>
                    <input
                      name="randomize_order"
                      type="checkbox"
                      checked={form.randomize_order}
                      onChange={onChange}
                    />
                    Randomize Order
                  </label>
                </div>

                <div style={styles.helpText}>
                  Randomize order shuffles the room-wide card order once so every player still gets the same sequence.
                </div>
              </div>
            )}

            {/* Explanatory section helping the user understand how multiplayer practice works */}
            <div style={styles.explainerCard}>
              <h3 style={styles.explainerTitle}>How Multiplayer Practice Works</h3>

              <div style={styles.explainerGrid}>
                <div style={styles.explainerBlock}>
                  <div style={styles.explainerStep}>1. Preview Phase</div>
                  <p style={styles.explainerText}>
                    Players first see the flashcard question and answer so they can study it before being tested.
                  </p>
                </div>

                <div style={styles.explainerBlock}>
                  <div style={styles.explainerStep}>2. Test Phase</div>
                  <p style={styles.explainerText}>
                    After previewing, everyone moves into the test phase and answers the same card. Depending on your prompt settings, the answer may be hidden or shown with blanks.
                  </p>
                </div>

                <div style={styles.explainerBlock}>
                  <div style={styles.explainerStep}>3. Timed Practice</div>
                  <p style={styles.explainerText}>
                    Cards continue automatically when the timer ends. In test mode, players must answer before time runs out.
                  </p>
                </div>

                <div style={styles.explainerBlock}>
                  <div style={styles.explainerStep}>4. Shared Results</div>
                  <p style={styles.explainerText}>
                    After everyone answers or the timer ends, the room reveals the result together before moving on.
                  </p>
                </div>
              </div>
            </div>

            {/* Main submit button used to create the multiplayer room */}
            <button
              type="submit"
              style={creating || loadingSets ? styles.disabledStartButton : styles.startButton}
              disabled={creating || loadingSets}
            >
              {creating ? "Creating..." : "Create Room"}
            </button>
          </form>
        )}

        {/* Error message shown when room creation or set loading fails */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Success screen shown once the room has been created */}
        {roomData && (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Room Created</h2>

            <p style={styles.infoLine}>
              <strong>Code:</strong> {roomData.room.join_code}
            </p>
            <p style={styles.infoLine}>
              <strong>Set:</strong> {roomData.room.set_title}
            </p>
            <p style={styles.infoLine}>
              <strong>Join URL:</strong> {roomData.join_url}
            </p>

            {/* QR code for easy joining on another device */}
            <div style={styles.qrWrap}>
              <QRCodeCanvas value={roomData.join_url} size={220} />
            </div>

            {/* Action button that opens the new room page */}
            <div style={styles.actionRow}>
              <button type="button" style={styles.button} onClick={openRoom}>
                Open Room
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Centralised styles object for the Create Multiplayer Room page.
// This keeps presentation styling separate from logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },

  // Main container that centres the content and limits width
  container: {
    maxWidth: 980,
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

  // Link styling for navigating back to the sets page
  backLink: {
    color: "#93c5fd",
    textDecoration: "none",
    fontWeight: 600,
  },

  // Main section title styling
  sectionTitle: {
    marginTop: 0,
    marginBottom: 10,
  },

  // Short descriptive paragraph shown under section titles
  sectionDescription: {
    marginTop: 0,
    marginBottom: 18,
    opacity: 0.9,
    lineHeight: 1.5,
  },

  // Subheading used inside advanced settings
  subsectionTitle: {
    fontWeight: 700,
    marginBottom: 14,
    fontSize: 16,
  },

  // Main card container used for form and result sections
  card: {
    background: "#121a2a",
    padding: 28,
    borderRadius: 14,
    marginBottom: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Special card explaining how multiplayer works
  explainerCard: {
    marginTop: 20,
    marginBottom: 8,
    padding: 20,
    borderRadius: 12,
    background: "#0f172a",
    border: "1px solid #23304c",
  },

  // Title inside the explainer card
  explainerTitle: {
    marginTop: 0,
    marginBottom: 16,
    fontSize: 20,
  },

  // Grid used to lay out the explainer steps
  explainerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },

  // Individual explainer step card
  explainerBlock: {
    background: "#111827",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: 14,
  },

  // Heading for each explainer step
  explainerStep: {
    fontWeight: 700,
    marginBottom: 8,
    color: "#93c5fd",
  },

  // Paragraph text inside each explainer block
  explainerText: {
    margin: 0,
    lineHeight: 1.6,
    opacity: 0.92,
    fontSize: 14,
  },

  // Wrapper for the advanced settings section
  advancedSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTop: "1px solid #23304c",
  },

  // Reusable grid layout for groups of inputs
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  },

  // Label styling for form fields
  label: {
    display: "block",
    marginBottom: 6,
    marginTop: 10,
    fontWeight: 600,
  },

  // Small helper text shown under inputs
  helpText: {
    fontSize: 13,
    lineHeight: 1.45,
    opacity: 0.82,
    marginTop: 6,
  },

  // Shared input styling for text fields, number fields, and dropdowns
  input: {
    width: "100%",
    padding: 11,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    marginBottom: 4,
    boxSizing: "border-box",
  },

  // Button used to expand or collapse advanced settings
  advancedToggle: {
    marginTop: 18,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },

  // Layout for grouped checkbox controls
  checkboxGroup: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 14,
    marginBottom: 10,
  },

  // Individual checkbox row styling
  checkboxRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },

  // Main green button used to create the room
  startButton: {
    display: "block",
    width: "100%",
    maxWidth: 320,
    marginTop: 22,
    padding: "15px 22px",
    borderRadius: 10,
    border: "none",
    background: "#22c55e",
    color: "white",
    fontWeight: 800,
    fontSize: 18,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(34,197,94,0.25)",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    opacity: 1,
    outline: "none",
  },

  // Disabled version of the create-room button shown while loading/creating
  disabledStartButton: {
    display: "block",
    width: "100%",
    maxWidth: 320,
    marginTop: 22,
    padding: "15px 22px",
    borderRadius: 10,
    border: "none",
    background: "#22c55e",
    color: "white",
    fontWeight: 800,
    fontSize: 18,
    cursor: "not-allowed",
    opacity: 0.65,
    filter: "grayscale(0.15)",
    boxShadow: "none",
  },

  // General blue button used for actions such as opening the room
  button: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    background: "#3b82f6",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 8,
  },

  // Error message box styling
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    border: "1px solid rgba(239,68,68,0.25)",
  },

  // White container behind the QR code for visibility
  qrWrap: {
    background: "white",
    display: "inline-block",
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },

  // Layout for room-created action buttons
  actionRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 18,
  },

  // Styling for lines of room information such as code and join URL
  infoLine: {
    lineHeight: 1.6,
    wordBreak: "break-word",
  },
};