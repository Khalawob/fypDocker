import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function JoinMultiplayerRoom() {
  const { joinCode: routeJoinCode } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [form, setForm] = useState({
    join_code: routeJoinCode || "",
    display_name: "",
  });

  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      setJoining(true);

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
      if (!res.ok) {
        setError(data?.message || "Failed to join room");
        return;
      }

      navigate(`/multiplayer/room/${code}`);
    } catch {
      setError("Server error while joining room");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Join Multiplayer Room</h1>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={onSubmit}>
          <label style={styles.label}>Room Code</label>
          <input
            name="join_code"
            value={form.join_code}
            onChange={onChange}
            style={styles.input}
            placeholder="e.g. AB12CD"
            maxLength={12}
          />

          <label style={styles.label}>Display Name</label>
          <input
            name="display_name"
            value={form.display_name}
            onChange={onChange}
            style={styles.input}
            placeholder="Your name"
            maxLength={80}
          />

          <button style={styles.primaryButton} disabled={joining}>
            {joining ? "Joining..." : "Join Room"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#0b1220", color: "white", padding: 24 },
  card: { maxWidth: 700, margin: "40px auto", background: "#121a2a", padding: 24, borderRadius: 12 },
  label: { display: "block", marginTop: 14, marginBottom: 6, fontWeight: 700 },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white",
    boxSizing: "border-box",
  },
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
  error: {
    background: "#7f1d1d",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
};