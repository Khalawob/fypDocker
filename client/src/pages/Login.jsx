// Import React's useState hook so the component can store and update local state
import { useState } from "react";

// Import React Router helpers:
// Link is used for clickable navigation,
// useNavigate is used for programmatic navigation after a successful login.
import { Link, useNavigate } from "react-router-dom";

// Import the background context so the user's selected background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Main Login page component
export default function Login() {
  // React Router navigation helper used to redirect the user after logging in
  const navigate = useNavigate();

  // Form state storing the user's email and password input values
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  // Tracks whether the login request is currently being submitted
  const [loading, setLoading] = useState(false);

  // Stores any validation or server error message shown to the user
  const [error, setError] = useState(null);

  // Get the currently selected custom background from the shared background context
  const { selectedBackground } = useBackground();

  // Build the final page style object.
  // It starts with the default page styles and conditionally adds a selected background image
  // with a dark overlay so the form remains readable.
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

  // Generic form change handler.
  // Uses the input name to update the matching field in the form state.
  function onChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Validates the login form before submission.
  // Ensures the user entered both an email and a password.
  function validate() {
    if (!form.email.trim()) return "Email is required";
    if (!form.password) return "Password is required";
    return null;
  }

  // Handles form submission.
  // Validates the input, sends a login request to the backend,
  // stores the returned token and user data,
  // and redirects the user to the home page if login succeeds.
  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) return setError(validationError);

    try {
      setLoading(true);

      // Use the configured frontend environment API URL if available,
      // otherwise fall back to localhost for development
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

      // If login fails, show the backend error message or a generic fallback
      if (!res.ok) {
        setError(data?.message || "Login failed");
        return;
      }

      // On successful login, store the token and user details in localStorage
      // so the app can keep the user logged in across page refreshes
      if (data?.token) localStorage.setItem("token", data.token);
      if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));

      // Redirect the user to the home page after login
      navigate("/");
    } catch (err) {
      // Handle unexpected server/network errors
      setError("Server error. Try again.");
    } finally {
      // Always stop the loading state when the request finishes
      setLoading(false);
    }
  }

  // Render the Login page UI
  return (
    <div style={pageStyle}>
      <form onSubmit={onSubmit} style={styles.card}>
        {/* Main heading for the login form */}
        <h2 style={styles.title}>Welcome back</h2>

        {/* Conditionally show any validation or login error message */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Email input field */}
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

        {/* Password input field */}
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

        {/* Submit button for logging in */}
        <button disabled={loading} style={styles.button}>
          {loading ? "Logging in..." : "Login"}
        </button>

        {/* Small footer text with a link to the registration page */}
        <p style={styles.footer}>
          Don’t have an account? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  );
}

// Centralised styles object for the Login page.
// Keeps layout and appearance styling separate from the main component logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0b1220",
    padding: 16,
  },

  // Main card containing the login form
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    color: "white",
    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  },

  // Main form title styling
  title: {
    marginBottom: 16,
  },

  // Label styling for form fields
  label: {
    fontSize: 14,
    opacity: 0.9,
  },

  // Shared input styling for email and password fields
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

  // Main submit button styling
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

  // Error message box styling
  error: {
    background: "rgba(239,68,68,0.15)",
    color: "#fecaca",
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(239,68,68,0.3)",
    marginBottom: 12,
  },

  // Footer text styling below the login button
  footer: {
    marginTop: 12,
    opacity: 0.9,
  },
};