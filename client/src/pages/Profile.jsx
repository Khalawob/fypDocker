import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useBackground } from "../context/BackgroundContext";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function Profile() {
  const token = localStorage.getItem("token");
  const { selectedBackground, refreshBackground } = useBackground();

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    display_name: "",
    bio: "",
    avatar_url: "",
    timezone: "",
    study_goal_minutes_per_day: "",
    preferred_difficulty: "",
  });

  const [backgrounds, setBackgrounds] = useState([]);
  const [backgroundLoading, setBackgroundLoading] = useState(true);
  const [selectingBackgroundId, setSelectingBackgroundId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadProfile();
    loadBackgrounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const res = await fetch(`${API_URL}/api/profile/me`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || "Failed to load profile");
        return;
      }

      setProfile(data);
      setForm({
        display_name: data.display_name || "",
        bio: data.bio || "",
        avatar_url: data.avatar_url || "",
        timezone: data.timezone || "",
        study_goal_minutes_per_day: data.study_goal_minutes_per_day ?? "",
        preferred_difficulty: data.preferred_difficulty || "",
      });
    } catch (err) {
      setError("Server error while loading profile");
    } finally {
      setLoading(false);
    }
  }

  async function loadBackgrounds() {
    try {
      setBackgroundLoading(true);

      const res = await fetch(`${API_URL}/api/backgrounds/me`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) return;

      setBackgrounds(Array.isArray(data?.backgrounds) ? data.backgrounds : []);
    } catch (err) {
      console.error("Failed to load backgrounds");
    } finally {
      setBackgroundLoading(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function cancelEdit() {
    if (!profile) return;

    setForm({
      display_name: profile.display_name || "",
      bio: profile.bio || "",
      avatar_url: profile.avatar_url || "",
      timezone: profile.timezone || "",
      study_goal_minutes_per_day: profile.study_goal_minutes_per_day ?? "",
      preferred_difficulty: profile.preferred_difficulty || "",
    });

    setEditing(false);
    setError("");
    setSuccess("");
  }

  async function saveProfile(e) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        display_name: form.display_name,
        bio: form.bio,
        avatar_url: form.avatar_url,
        timezone: form.timezone,
        study_goal_minutes_per_day:
          form.study_goal_minutes_per_day === ""
            ? null
            : Number(form.study_goal_minutes_per_day),
        preferred_difficulty:
          form.preferred_difficulty === ""
            ? null
            : form.preferred_difficulty,
      };

      const res = await fetch(`${API_URL}/api/profile/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || "Failed to update profile");
        return;
      }

      setSuccess("Profile updated successfully");
      setEditing(false);
      await loadProfile();
    } catch (err) {
      setError("Server error while updating profile");
    } finally {
      setSaving(false);
    }
  }

  async function selectBackground(backgroundId) {
    const selectionKey = backgroundId === null ? "default" : String(backgroundId);

    try {
      setSelectingBackgroundId(selectionKey);
      setError("");
      setSuccess("");

      const res = await fetch(`${API_URL}/api/backgrounds/me/select`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          background_id: backgroundId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || "Failed to select background");
        return;
      }

      setSuccess(
        backgroundId === null
          ? "Default background selected successfully"
          : "Background selected successfully"
      );

      await loadBackgrounds();
      await loadProfile();
      await refreshBackground();
    } catch (err) {
      setError("Server error while selecting background");
    } finally {
      setSelectingBackgroundId("");
    }
  }

  const backgroundOptions = [
    {
      background_id: null,
      name: "Default",
      image_url: null,
      is_unlocked: 1,
      is_selected: profile?.selected_background_id == null ? 1 : 0,
    },
    ...backgrounds,
  ];

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

  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>My Profile</h1>
            <p style={styles.subtitle}>
              View and manage your account profile information.
            </p>
          </div>

          <div style={styles.headerButtons}>
            <Link to="/" style={styles.linkButton}>
              Home
            </Link>
            <Link to="/sets" style={styles.linkButton}>
              My Sets
            </Link>

            {!editing && !loading && profile && (
              <button
                style={styles.editButton}
                onClick={() => {
                  setEditing(true);
                  setError("");
                  setSuccess("");
                }}
              >
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {loading && <div style={styles.card}>Loading profile...</div>}
        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        {!loading && !error && profile && !editing && (
          <div style={styles.grid}>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Profile Information</h2>

              <div style={styles.avatarWrap}>
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Profile avatar"
                    style={styles.avatar}
                  />
                ) : (
                  <div style={styles.avatarPlaceholder}>
                    {(profile.display_name || profile.username || "U")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Username</div>
                <div style={styles.text}>{profile.username}</div>
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Email</div>
                <div style={styles.text}>{profile.email}</div>
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Display Name</div>
                <div style={styles.text}>{profile.display_name || "Not set"}</div>
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Bio</div>
                <div style={styles.text}>{profile.bio || "No bio added yet"}</div>
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Timezone</div>
                <div style={styles.text}>{profile.timezone || "Not set"}</div>
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Preferred Difficulty</div>
                <div style={styles.text}>
                  {profile.preferred_difficulty || "Not set"}
                </div>
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Study Goal</div>
                <div style={styles.text}>
                  {profile.study_goal_minutes_per_day !== null &&
                  profile.study_goal_minutes_per_day !== undefined
                    ? `${profile.study_goal_minutes_per_day} minutes per day`
                    : "Not set"}
                </div>
              </div>
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Progress Stats</h2>

              <div style={styles.block}>
                <div style={styles.label}>Current Streak</div>
                <div style={styles.bigStat}>{profile.current_streak ?? 0}</div>
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Longest Streak</div>
                <div style={styles.bigStat}>{profile.longest_streak ?? 0}</div>
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Last Login Date</div>
                <div style={styles.text}>
                  {profile.last_login_date
                    ? new Date(profile.last_login_date).toLocaleDateString()
                    : "No login recorded"}
                </div>
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Profile Created</div>
                <div style={styles.text}>
                  {profile.created_at
                    ? new Date(profile.created_at).toLocaleDateString()
                    : "Unknown"}
                </div>
              </div>

              <div style={styles.block}>
                <div style={styles.label}>Last Updated</div>
                <div style={styles.text}>
                  {profile.updated_at
                    ? new Date(profile.updated_at).toLocaleDateString()
                    : "Unknown"}
                </div>
              </div>
            </div>

            <div style={styles.cardWide}>
              <h2 style={styles.sectionTitle}>Unlocked Backgrounds</h2>

              {backgroundLoading ? (
                <div style={styles.text}>Loading backgrounds...</div>
              ) : backgroundOptions.length === 0 ? (
                <div style={styles.text}>No backgrounds found.</div>
              ) : (
                <div style={styles.backgroundGrid}>
                  {backgroundOptions.map((bg) => {
                    const unlocked = Number(bg.is_unlocked) === 1;
                    const selected = Number(bg.is_selected) === 1;
                    const selectionKey =
                      bg.background_id === null ? "default" : String(bg.background_id);

                    return (
                      <div
                        key={bg.background_id ?? "default-background"}
                        style={styles.backgroundCard}
                      >
                        <div
                          style={{
                            ...styles.backgroundPreview,
                            ...(bg.image_url
                              ? {
                                  backgroundImage: `url(${bg.image_url})`,
                                }
                              : {
                                  background:
                                    "linear-gradient(180deg, #121a2a 0%, #0b1220 100%)",
                                }),
                          }}
                        />

                        <div style={styles.backgroundName}>{bg.name}</div>

                        <div style={styles.backgroundStatusRow}>
                          {selected ? (
                            <span style={styles.selectedBadge}>Selected</span>
                          ) : unlocked ? (
                            <span style={styles.unlockedBadge}>Unlocked</span>
                          ) : (
                            <span style={styles.lockedBadge}>Locked</span>
                          )}
                        </div>

                        <button
                          style={
                            !unlocked
                              ? styles.disabledButton
                              : selected
                              ? styles.secondaryButton
                              : styles.primaryButton
                          }
                          disabled={
                            !unlocked ||
                            selected ||
                            selectingBackgroundId === selectionKey
                          }
                          onClick={() => selectBackground(bg.background_id)}
                        >
                          {!unlocked
                            ? "Locked"
                            : selected
                            ? "Selected"
                            : selectingBackgroundId === selectionKey
                            ? "Selecting..."
                            : "Use Background"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && !error && profile && editing && (
          <form onSubmit={saveProfile} style={styles.card}>
            <h2 style={styles.sectionTitle}>Edit Profile</h2>

            <div style={styles.formGroup}>
              <label style={styles.inputLabel}>Display Name</label>
              <input
                type="text"
                name="display_name"
                value={form.display_name}
                onChange={handleChange}
                style={styles.input}
                maxLength={80}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.inputLabel}>Bio</label>
              <textarea
                name="bio"
                value={form.bio}
                onChange={handleChange}
                style={styles.textarea}
                rows={4}
                maxLength={255}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.inputLabel}>Avatar URL</label>
              <input
                type="text"
                name="avatar_url"
                value={form.avatar_url}
                onChange={handleChange}
                style={styles.input}
                maxLength={255}
                placeholder="https://example.com/avatar.jpg"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.inputLabel}>Timezone</label>
              <input
                type="text"
                name="timezone"
                value={form.timezone}
                onChange={handleChange}
                style={styles.input}
                maxLength={64}
                placeholder="Europe/London"
              />
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroupHalf}>
                <label style={styles.inputLabel}>Study Goal Minutes Per Day</label>
                <input
                  type="number"
                  name="study_goal_minutes_per_day"
                  value={form.study_goal_minutes_per_day}
                  onChange={handleChange}
                  style={styles.input}
                  min={0}
                  max={600}
                />
              </div>

              <div style={styles.formGroupHalf}>
                <label style={styles.inputLabel}>Preferred Difficulty</label>
                <select
                  name="preferred_difficulty"
                  value={form.preferred_difficulty}
                  onChange={handleChange}
                  style={styles.input}
                >
                  <option value="">Select difficulty</option>
                  <option value="EASY">EASY</option>
                  <option value="MODERATE">MODERATE</option>
                  <option value="HARD">HARD</option>
                </select>
              </div>
            </div>

            <div style={styles.buttonRow}>
              <button type="submit" style={styles.primaryButton} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                style={styles.deleteButton}
                onClick={cancelEdit}
                disabled={saving}
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  cardWide: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    gridColumn: "1 / -1",
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 20,
  },
  avatarWrap: {
    marginBottom: 20,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: "50%",
    objectFit: "cover",
    border: "3px solid rgba(255,255,255,0.12)",
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#1d4ed8",
    color: "white",
    fontSize: 36,
    fontWeight: 700,
    border: "3px solid rgba(255,255,255,0.12)",
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
    opacity: 0.95,
  },
  bigStat: {
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  formGroup: {
    marginBottom: 16,
  },
  formGroupHalf: {
    flex: 1,
    minWidth: 220,
  },
  formRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  inputLabel: {
    display: "block",
    marginBottom: 8,
    fontSize: 14,
    fontWeight: 600,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "white",
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
  },
  textarea: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "white",
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
  },
  buttonRow: {
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
  primaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#22c55e",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  secondaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  disabledButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#94a3b8",
    cursor: "not-allowed",
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
    border: "none",
    cursor: "pointer",
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
  backgroundGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  backgroundCard: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 14,
  },
  backgroundPreview: {
    width: "100%",
    height: 120,
    borderRadius: 10,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundColor: "#1e293b",
    marginBottom: 12,
    border: "1px solid #334155",
  },
  backgroundName: {
    fontWeight: 700,
    marginBottom: 10,
  },
  backgroundStatusRow: {
    marginBottom: 12,
  },
  selectedBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(34,197,94,0.2)",
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(34,197,94,0.35)",
  },
  unlockedBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(59,130,246,0.2)",
    color: "#bfdbfe",
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(59,130,246,0.35)",
  },
  lockedBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(148,163,184,0.15)",
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(148,163,184,0.25)",
  },
};