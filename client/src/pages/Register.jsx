import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

// Use env variable for Docker, fallback to localhost for normal dev
// works locally and in docker without code changes
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export default function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function onChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function validate() {
    if (!form.username.trim()) return "Username is required";
    if (!form.email.trim()) return "Email is required";
    if (!form.password) return "Password is required";
    if (form.password.length < 6) return "Password must be at least 6 characters";
    if (form.password !== form.confirmPassword) return "Passwords do not match";
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) return setError(validationError);

    try {
      setLoading(true);

      // CHANGE THIS if  backend URL changes
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          email: form.email,
          password: form.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Registration failed");
        return;
      }

      // If the backend returns a token on register:
      // localStorage.setItem("token", data.token);

      // If you want to go straight to login:
      navigate("/login");
    } catch (err) {
      setError("Server error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <form onSubmit={onSubmit} style={styles.card}>
        <h2 style={styles.title}>Create an account</h2>

        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.label}>Username</label>
        <input
          name="username"
          value={form.username}
          onChange={onChange}
          style={styles.input}
          placeholder="e.g. jack123"
        />

        <label style={styles.label}>Email</label>
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={onChange}
          style={styles.input}
          placeholder="e.g. jack@email.com"
        />

        <label style={styles.label}>Password</label>
        <input
          name="password"
          type="password"
          value={form.password}
          onChange={onChange}
          style={styles.input}
          placeholder="••••••••"
        />

        <label style={styles.label}>Confirm Password</label>
        <input
          name="confirmPassword"
          type="password"
          value={form.confirmPassword}
          onChange={onChange}
          style={styles.input}
          placeholder="••••••••"
        />

        <button disabled={loading} style={styles.button}>
          {loading ? "Creating..." : "Register"}
        </button>

        <p style={styles.footer}>
          Already have an account? <Link to="/login">Login</Link>
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