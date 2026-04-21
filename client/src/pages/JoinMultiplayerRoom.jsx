// Import React's useState hook so the component can store and update local state
import { useState } from "react";

// Import React Router helpers:
// useNavigate is used for programmatic navigation,
// useParams is used to read values such as the join code from the URL.
import { useNavigate, useParams } from "react-router-dom";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Main page component for joining a multiplayer room
export default function JoinMultiplayerRoom() {
  // Read the join code from the route if one was included in the URL
  // and rename it to routeJoinCode for clarity
  const { joinCode: routeJoinCode } = useParams();

  // React Router navigation helper used to move the user into the room after joining
  const navigate = useNavigate();

  // Read the auth token from localStorage so an authenticated join request can be made
  const token = localStorage.getItem("token");

  // Form state storing the room code and player display name.
  // If the URL already contains a join code, it is used as the initial value.
  const [form, setForm] = useState({
    join_code: routeJoinCode || "",
    display_name: "",
  });

  // Tracks whether the join request is currently in progress
  const [joining, setJoining] = useState(false);

  // Stores any error message that should be shown to the user
  const [error, setError] = useState("");

  // Generic form change handler.
  // Uses the input name to update the matching field in the form state.
  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Handles form submission.
  // It sends the room code and display name to the backend,
  // shows any error if the join fails,
  // and navigates into the multiplayer room if successful.
  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      setJoining(true);

      // Clean and normalize the room code before sending it to the backend
      const code = form.join_code.trim().toUpperCase();

      const res = await fetch(`${API_URL}/api/multiplayer/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          join_code: code,
          display_name: form.display_name.trim() || "Player",
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Show an error if the backend rejects the join request
      if (!res.ok) {
        setError(data?.message || "Failed to join room");
        return;
      }

      // If joining succeeds, navigate to the room page using the cleaned join code
      navigate(`/multiplayer/room/${code}`);
    } catch {
      setError("Server error while joining room");
    } finally {
      // Always stop the loading state when the request finishes
      setJoining(false);
    }
  }

  // Render the Join Multiplayer Room page UI
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Main page heading */}
        <h1>Join Multiplayer Room</h1>

        {/* Conditionally show any join error message */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Join room form */}
        <form onSubmit={onSubmit}>
          {/* Room code input */}
          <label style={styles.label}>Room Code</label>
          <input
            name="join_code"
            value={form.join_code}
            onChange={onChange}
            style={styles.input}
            placeholder="e.g. AB12CD"
            maxLength={12}
          />

          {/* Display name input */}
          <label style={styles.label}>Display Name</label>
          <input
            name="display_name"
            value={form.display_name}
            onChange={onChange}
            style={styles.input}
            placeholder="Your name"
            maxLength={80}
          />

          {/* Submit button used to join the room */}
          <button style={styles.primaryButton} disabled={joining}>
            {joining ? "Joining..." : "Join Room"}
          </button>
        </form>
      </div>
    </div>
  );
}

// Centralised styles object for the Join Multiplayer Room page.
// Keeps layout and visual styling separate from the main component logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },

  // Main card container that centres the form and limits width
  card: {
    maxWidth: 700,
    margin: "40px auto",
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
  },

  // Label styling for form inputs
  label: {
    display: "block",
    marginTop: 14,
    marginBottom: 6,
    fontWeight: 700,
  },

  // Shared input styling for room code and display name fields
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    boxSizing: "border-box",
  },

  // Main submit button styling
  primaryButton: {
    marginTop: 20,
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "#3b82f6",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },

  // Error message box styling
  error: {
    background: "#7f1d1d",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
};