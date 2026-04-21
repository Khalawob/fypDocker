// Import React hooks:
// useEffect is used to run side effects when the component loads,
// useState is used to store local component state values.
import { useEffect, useState } from "react";

// Import Link from React Router for navigation links
import { Link } from "react-router-dom";

// Import the background context so the selected user background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Main Profile page component
export default function Profile() {
  // Read the auth token from localStorage so authenticated API requests can be made
  const token = localStorage.getItem("token");

  // Get the selected background and a helper function to refresh it after changes
  const { selectedBackground, refreshBackground } = useBackground();

  // Stores the full profile data returned by the backend
  const [profile, setProfile] = useState(null);

  // Stores editable profile form values when the user enters edit mode
  const [form, setForm] = useState({
    display_name: "",
    bio: "",
    avatar_url: "",
    timezone: "",
    study_goal_minutes_per_day: "",
    preferred_difficulty: "",
  });

  // Stores the list of available/unlocked backgrounds for the user
  const [backgrounds, setBackgrounds] = useState([]);

  // Tracks whether background data is currently loading
  const [backgroundLoading, setBackgroundLoading] = useState(true);

  // Stores the background currently being selected so the UI can show a loading state
  const [selectingBackgroundId, setSelectingBackgroundId] = useState("");

  // Tracks whether the main profile data is currently loading
  const [loading, setLoading] = useState(true);

  // Tracks whether the profile update form is currently being saved
  const [saving, setSaving] = useState(false);

  // Controls whether the page is showing view mode or edit mode
  const [editing, setEditing] = useState(false);

  // Stores any error message to display to the user
  const [error, setError] = useState("");

  // Stores any success message to display to the user
  const [success, setSuccess] = useState("");

  // Run once when the page first loads.
  // This loads both the user's profile information and their available backgrounds.
  useEffect(() => {
    loadProfile();
    loadBackgrounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loads the current user's profile data from the backend
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

      // Show an error if the profile could not be loaded
      if (!res.ok) {
        setError(data?.message || "Failed to load profile");
        return;
      }

      // Save the full profile data and also prefill the edit form with the same values
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

  // Loads the user's background unlock/selection information from the backend
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

      // If the request fails, just stop without replacing current UI with an error
      if (!res.ok) return;

      setBackgrounds(Array.isArray(data?.backgrounds) ? data.backgrounds : []);
    } catch (err) {
      // Log background loading failures for debugging
      console.error("Failed to load backgrounds");
    } finally {
      setBackgroundLoading(false);
    }
  }

  // Generic form change handler for edit mode inputs
  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  // Cancels edit mode and restores the form values back to the current saved profile data
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

  // Saves the updated profile details to the backend
  async function saveProfile(e) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      // Build the payload, converting empty optional numeric/select values to null
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

      // Show an error if the update fails
      if (!res.ok) {
        setError(data?.message || "Failed to update profile");
        return;
      }

      // Show success feedback, leave edit mode, and reload the latest profile data
      setSuccess("Profile updated successfully");
      setEditing(false);
      await loadProfile();
    } catch (err) {
      setError("Server error while updating profile");
    } finally {
      setSaving(false);
    }
  }

  // Selects a background for the user's profile
  async function selectBackground(backgroundId) {
    // Create a stable key for the currently requested selection
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

      // Show an error if background selection fails
      if (!res.ok) {
        setError(data?.message || "Failed to select background");
        return;
      }

      // Show success feedback depending on whether the default or a custom background was chosen
      setSuccess(
        backgroundId === null
          ? "Default background selected successfully"
          : "Background selected successfully"
      );

      // Reload profile/background data and refresh the global background context
      await loadBackgrounds();
      await loadProfile();
      await refreshBackground();
    } catch (err) {
      setError("Server error while selecting background");
    } finally {
      setSelectingBackgroundId("");
    }
  }

  // Formats a date value into a readable local date string
  function formatDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
  }

  // Build the background list shown in the UI.
  // A built-in default background option is added before the fetched backgrounds.
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

  // Safely read the badges array from the profile
  const badges = Array.isArray(profile?.badges) ? profile.badges : [];

  // Build the final page style object.
  // It starts with the default page styles and conditionally adds a selected background image
  // with a dark overlay so the content remains readable.
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

  // Render the Profile page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Header section showing page title, subtitle, and navigation/edit actions */}
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

            {/* Show the edit button only when profile data is loaded and the page is not already in edit mode */}
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

        {/* Top-level page states for loading, error, and success messages */}
        {loading && <div style={styles.card}>Loading profile...</div>}
        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        {/* Read-only profile view mode */}
        {!loading && !error && profile && !editing && (
          <div style={styles.grid}>
            {/* Card showing main profile information */}
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

            {/* Card showing activity/progress statistics */}
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

            {/* Wide card showing badges and their unlock status */}
            <div style={styles.cardWide}>
              <h2 style={styles.sectionTitle}>Badges</h2>

              {badges.length === 0 ? (
                <div style={styles.text}>No badges found.</div>
              ) : (
                <div style={styles.badgesGrid}>
                  {badges.map((badge) => {
                    // Convert numeric flag to boolean for easier conditional rendering
                    const isEarned = Number(badge.is_earned) === 1;

                    return (
                      <div
                        key={badge.badge_id}
                        style={{
                          ...styles.badgeCard,
                          opacity: isEarned ? 1 : 0.72,
                          border: isEarned
                            ? "1px solid rgba(34,197,94,0.35)"
                            : "1px solid #334155",
                        }}
                      >
                        {isEarned && badge.icon ? (
                          <img
                            src={badge.icon}
                            alt={badge.name}
                            style={styles.badgeImage}
                          />
                        ) : (
                          <div style={styles.badgePlaceholder}>🔒</div>
                        )}

                        <div style={styles.badgeContent}>
                          <div style={styles.badgeHeaderRow}>
                            <div style={styles.badgeName}>{badge.name}</div>
                            <span
                              style={
                                isEarned
                                  ? styles.earnedBadgeStatus
                                  : styles.lockedBadgeStatus
                              }
                            >
                              {isEarned ? "Unlocked" : "Locked"}
                            </span>
                          </div>

                          <div style={styles.badgeDescription}>
                            {badge.description || "Complete the required challenge to unlock this badge."}
                          </div>

                          <div style={styles.badgeEarnedAt}>
                            {isEarned
                              ? `Earned: ${formatDate(badge.earned_at)}`
                              : "Not unlocked yet"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Wide card showing background unlocks and selection controls */}
            <div style={styles.cardWide}>
              <h2 style={styles.sectionTitle}>Unlocked Backgrounds</h2>

              {backgroundLoading ? (
                <div style={styles.text}>Loading backgrounds...</div>
              ) : backgroundOptions.length === 0 ? (
                <div style={styles.text}>No backgrounds found.</div>
              ) : (
                <div style={styles.backgroundGrid}>
                  {backgroundOptions.map((bg) => {
                    // Convert numeric flags to booleans for easier UI logic
                    const unlocked = Number(bg.is_unlocked) === 1;
                    const selected = Number(bg.is_selected) === 1;

                    // Create a stable selection key used for loading state matching
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

        {/* Editable profile form shown when the user enters edit mode */}
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

// Centralised styles object for the Profile page.
// Keeps layout and visual styling separate from the component logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },

  // Main content container that centres the page and limits width
  container: {
    maxWidth: 1000,
    margin: "0 auto",
  },

  // Header section layout
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 24,
  },

  // Main page title styling
  title: {
    margin: 0,
  },

  // Subtitle text under the page title
  subtitle: {
    marginTop: 8,
    opacity: 0.9,
    lineHeight: 1.5,
  },

  // Layout for header action buttons
  headerButtons: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  // Main responsive grid for profile content cards
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
  },

  // Standard card styling
  card: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Wide card styling spanning the full grid width
  cardWide: {
    background: "#121a2a",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    gridColumn: "1 / -1",
  },

  // Shared section heading styling
  sectionTitle: {
    marginTop: 0,
    marginBottom: 20,
  },

  // Wrapper for avatar or avatar placeholder
  avatarWrap: {
    marginBottom: 20,
  },

  // Avatar image styling
  avatar: {
    width: 96,
    height: 96,
    borderRadius: "50%",
    objectFit: "cover",
    border: "3px solid rgba(255,255,255,0.12)",
  },

  // Placeholder avatar styling when no avatar image exists
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

  // Generic content block spacing
  block: {
    marginBottom: 16,
  },

  // Small uppercase label styling used in read-only cards
  label: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
    opacity: 0.8,
    marginBottom: 8,
  },

  // Standard text styling for profile values
  text: {
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    opacity: 0.95,
  },

  // Large stat number styling
  bigStat: {
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.2,
  },

  // Standard form group spacing
  formGroup: {
    marginBottom: 16,
  },

  // Half-width form group used in side-by-side layouts
  formGroupHalf: {
    flex: 1,
    minWidth: 220,
  },

  // Row layout for grouped form inputs
  formRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 16,
  },

  // Label styling for editable form fields
  inputLabel: {
    display: "block",
    marginBottom: 8,
    fontSize: 14,
    fontWeight: 600,
  },

  // Shared text input/select styling
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

  // Shared textarea styling
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

  // Button row layout
  buttonRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 8,
  },

  // Styled navigation link button
  linkButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
  },

  // Main green action button styling
  primaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#22c55e",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  // Secondary button styling
  secondaryButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },

  // Disabled button styling for unavailable background choices
  disabledButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#94a3b8",
    cursor: "not-allowed",
    fontWeight: 700,
  },

  // Edit profile button styling
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

  // Red button styling used for cancel actions in edit mode
  deleteButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "none",
    background: "#ef4444",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
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

  // Grid layout for badge cards
  badgesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },

  // Individual badge card styling
  badgeCard: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  // Badge image styling
  badgeImage: {
    width: "100%",
    height: 120,
    objectFit: "contain",
    borderRadius: 10,
    background: "#111827",
    border: "1px solid #334155",
    padding: 10,
    boxSizing: "border-box",
  },

  // Placeholder styling for locked badges without icon images
  badgePlaceholder: {
    width: "100%",
    height: 120,
    borderRadius: 10,
    background: "#111827",
    border: "1px solid #334155",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 40,
  },

  // Layout for badge text content
  badgeContent: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  // Header row inside each badge card
  badgeHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },

  // Badge title styling
  badgeName: {
    fontWeight: 700,
    fontSize: 16,
  },

  // Badge description text styling
  badgeDescription: {
    opacity: 0.9,
    lineHeight: 1.5,
    fontSize: 14,
  },

  // Badge earned date styling
  badgeEarnedAt: {
    fontSize: 13,
    color: "#cbd5e1",
    opacity: 0.9,
  },

  // Status pill styling for earned badges
  earnedBadgeStatus: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(34,197,94,0.2)",
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(34,197,94,0.35)",
    whiteSpace: "nowrap",
  },

  // Status pill styling for locked badges
  lockedBadgeStatus: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(148,163,184,0.15)",
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(148,163,184,0.25)",
    whiteSpace: "nowrap",
  },

  // Grid layout for background cards
  backgroundGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },

  // Individual background card styling
  backgroundCard: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 14,
  },

  // Preview area showing a background thumbnail
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

  // Background name styling
  backgroundName: {
    fontWeight: 700,
    marginBottom: 10,
  },

  // Row holding status badges for backgrounds
  backgroundStatusRow: {
    marginBottom: 12,
  },

  // Status badge styling for selected background
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

  // Status badge styling for unlocked but not selected backgrounds
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

  // Status badge styling for locked backgrounds
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