import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

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

export default function CreateMultiplayerRoom() {
  const token = localStorage.getItem("token");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [sets, setSets] = useState([]);
  const [loadingSets, setLoadingSets] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [roomData, setRoomData] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const shouldShowBlankStyle = form.prompt_type !== "NORMAL_HIDDEN";
  const shouldShowBlankRatio =
    form.prompt_type === "RANDOM_BLANKS" ||
    form.prompt_type === "INCREASING_DIFFICULTY";

  useEffect(() => {
    loadSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const nextSets = Array.isArray(data) ? data : data?.sets || [];
      setSets(nextSets);

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

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

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

      if (!res.ok) {
        setError(data?.message || "Failed to create room");
        return;
      }

      setRoomData(data);
    } catch {
      setError("Server error while creating room");
    } finally {
      setCreating(false);
    }
  }

  function openRoom() {
    if (!roomData?.room?.join_code) return;
    navigate(`/multiplayer/room/${roomData.room.join_code}`);
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Create Multiplayer Room</h1>

          <Link to="/sets" style={styles.backLink}>
            Back to Sets
          </Link>
        </div>

        {!roomData && (
          <form onSubmit={onSubmit} style={styles.card}>
            <h2 style={styles.sectionTitle}>Room Setup</h2>
            <p style={styles.sectionDescription}>
              Choose the set and core multiplayer options below. Advanced settings can be opened if needed.
            </p>

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

            <button
              type="button"
              style={styles.advancedToggle}
              onClick={() => setShowAdvanced((prev) => !prev)}
            >
              {showAdvanced ? "Hide Advanced Settings ▲" : "Show Advanced Settings ▼"}
            </button>

            {showAdvanced && (
              <div style={styles.advancedSection}>
                <div style={styles.subsectionTitle}>Advanced Settings</div>

                <div style={styles.grid}>
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

            <button
              type="submit"
              style={creating || loadingSets ? styles.disabledStartButton : styles.startButton}
              disabled={creating || loadingSets}
            >
              {creating ? "Creating..." : "Create Room"}
            </button>
          </form>
        )}

        {error && <div style={styles.error}>{error}</div>}

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

            <div style={styles.qrWrap}>
              <QRCodeCanvas value={roomData.join_url} size={220} />
            </div>

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

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },
  container: {
    maxWidth: 980,
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
  backLink: {
    color: "#93c5fd",
    textDecoration: "none",
    fontWeight: 600,
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 10,
  },
  sectionDescription: {
    marginTop: 0,
    marginBottom: 18,
    opacity: 0.9,
    lineHeight: 1.5,
  },
  subsectionTitle: {
    fontWeight: 700,
    marginBottom: 14,
    fontSize: 16,
  },
  card: {
    background: "#121a2a",
    padding: 28,
    borderRadius: 14,
    marginBottom: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  explainerCard: {
    marginTop: 20,
    marginBottom: 8,
    padding: 20,
    borderRadius: 12,
    background: "#0f172a",
    border: "1px solid #23304c",
  },
  explainerTitle: {
    marginTop: 0,
    marginBottom: 16,
    fontSize: 20,
  },
  explainerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  explainerBlock: {
    background: "#111827",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: 14,
  },
  explainerStep: {
    fontWeight: 700,
    marginBottom: 8,
    color: "#93c5fd",
  },
  explainerText: {
    margin: 0,
    lineHeight: 1.6,
    opacity: 0.92,
    fontSize: 14,
  },
  advancedSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTop: "1px solid #23304c",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  },
  label: {
    display: "block",
    marginBottom: 6,
    marginTop: 10,
    fontWeight: 600,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 1.45,
    opacity: 0.82,
    marginTop: 6,
  },
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
  checkboxGroup: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 14,
    marginBottom: 10,
  },
  checkboxRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
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
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    border: "1px solid rgba(239,68,68,0.25)",
  },
  qrWrap: {
    background: "white",
    display: "inline-block",
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  actionRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 18,
  },
  infoLine: {
    lineHeight: 1.6,
    wordBreak: "break-word",
  },
};