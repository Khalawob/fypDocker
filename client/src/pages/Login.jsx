import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function onChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function validate() {
    if (!form.email.trim()) return "Email is required";
    if (!form.password) return "Password is required";
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) return setError(validationError);

    try {
      setLoading(true);

      // If you set REACT_APP_API_URL in docker compose, use it here:
      const baseUrl = process.env.REACT_APP_API_URL || "http://localhost:5000";

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // your backend uses { message: "..."} on login errors
        setError(data?.message || "Login failed");
        return;
      }

      // Expected backend success payload:
      // { message, token, user: { id, username, email } }
      if (data?.token) localStorage.setItem("token", data.token);
      if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));

      // go to a page that exists in your app (change if needed)
      navigate("/");
    } catch (err) {
      setError("Server error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <form onSubmit={onSubmit} style={styles.card}>
        <h2 style={styles.title}>Welcome back</h2>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>Email</label>
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={onChange}
          style={styles.input}
          placeholder="e.g. jack@email.com"
          autoComplete="email"
        />

        <label style={styles.label}>Password</label>
        <input
          name="password"
          type="password"
          value={form.password}
          onChange={onChange}
          style={styles.input}
          placeholder="••••••••"
          autoComplete="current-password"
        />

        <button disabled={loading} style={styles.button}>
          {loading ? "Logging in..." : "Login"}
        </button>

        <p style={styles.footer}>
          Don’t have an account? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0b1220",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    color: "white",
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
  title: { marginBottom: 16 },
  label: { fontSize: 14, opacity: 0.9 },
  input: {
    width: "100%",
    padding: 10,
    marginTop: 6,
    marginBottom: 12,
    borderRadius: 8,
    border: "1px solid #2b3550",
    background: "#0b1220",
    color: "white",
    outline: "none",
  },
  button: {
    width: "100%",
    padding: 12,
    borderRadius: 8,
    border: "none",
    background: "#3b82f6",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 6,
  },
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(239,68,68,0.3)",
    marginBottom: 12,
  },
  footer: { marginTop: 12, opacity: 0.9 },
};