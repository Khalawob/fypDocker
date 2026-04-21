// Import React's useState hook so the component can store and update local state
import { useState } from "react";

// Import React Router helpers:
// useNavigate is used for programmatic navigation after successful registration,
// Link is used for clickable navigation links.
import { useNavigate, Link } from "react-router-dom";

// Import the background context so the user's selected background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Base API URL used for backend requests.
// It uses an environment variable if available, otherwise falls back to localhost for development.
// This makes the same code work both locally and inside Docker.
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

// Main Register page component
export default function Register() {
  // React Router navigation helper used to redirect the user after successful registration
  const navigate = useNavigate();

  // Form state storing the values entered by the user in the registration form
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  // Tracks whether the registration request is currently being submitted
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

  // Validates the registration form before submission.
  // It checks that all required fields are filled in,
  // that the password is long enough,
  // and that both password fields match.
  function validate() {
    if (!form.username.trim()) return "Username is required";
    if (!form.email.trim()) return "Email is required";
    if (!form.password) return "Password is required";
    if (form.password.length < 6) return "Password must be at least 6 characters";
    if (form.password !== form.confirmPassword) return "Passwords do not match";
    return null;
  }

  // Handles form submission.
  // It validates the form, sends the registration request to the backend,
  // shows any returned error,
  // and redirects the user to the login page if registration succeeds.
  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) return setError(validationError);

    try {
      setLoading(true);

      // Send the registration request to the backend
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

      // If registration fails, show the backend error message or a fallback message
      if (!res.ok) {
        setError(data?.message || "Registration failed");
        return;
      }

      // If your backend later returns a token here, it could be stored in localStorage.
      // Right now, this form redirects the user to the login page after successful registration.
      navigate("/login");
    } catch (err) {
      // Handle unexpected server/network errors
      setError("Server error. Try again.");
    } finally {
      // Always stop the loading state when the request finishes
      setLoading(false);
    }
  }

  // Render the Register page UI
  return (
    <div style={pageStyle}>
      <form onSubmit={onSubmit} style={styles.card}>
        {/* Main heading for the registration form */}
        <h2 style={styles.title}>Create an account</h2>

        {/* Conditionally show any validation or registration error message */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Username input field */}
        <label style={styles.label}>Username</label>
        <input
          name="username"
          value={form.username}
          onChange={onChange}
          style={styles.input}
          placeholder="e.g. jack123"
        />

        {/* Email input field */}
        <label style={styles.label}>Email</label>
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={onChange}
          style={styles.input}
          placeholder="e.g. jack@email.com"
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
        />

        {/* Confirm password input field */}
        <label style={styles.label}>Confirm Password</label>
        <input
          name="confirmPassword"
          type="password"
          value={form.confirmPassword}
          onChange={onChange}
          style={styles.input}
          placeholder="••••••••"
        />

        {/* Submit button for creating the account */}
        <button disabled={loading} style={styles.button}>
          {loading ? "Creating..." : "Register"}
        </button>

        {/* Footer text with a link to the login page */}
        <p style={styles.footer}>
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </form>
    </div>
  );
}

// Centralised styles object for the Register page.
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

  // Main card containing the registration form
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

  // Shared input styling for all form fields
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

  // Footer text styling shown below the registration button
  footer: {
    marginTop: 12,
    opacity: 0.9,
  },
};