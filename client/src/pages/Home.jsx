import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

export default function Home() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
    navigate("/");
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Flashcard App</h1>
        <p style={styles.subtitle}>Welcome to your practice system</p>

        <div style={styles.links}>
          {!isLoggedIn && (
            <>
              <Link style={styles.link} to="/register">
                Register
              </Link>
              <Link style={styles.link} to="/login">
                Login
              </Link>
            </>
          )}

          <Link style={styles.link} to="/sets">
            My Sets
          </Link>
          <Link style={styles.link} to="/practice">
            Practice
          </Link>
          <Link style={styles.link} to="/profile">
            Profile
          </Link>
          <Link style={styles.link} to="/about">
            About Us
          </Link>
          <Link style={styles.link} to="/calibration">
            Reading Calibration
          </Link>

          {isLoggedIn && (
            <button style={styles.logoutButton} onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    background: "#121a2a",
    padding: 32,
    borderRadius: 12,
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    maxWidth: 500,
    width: "100%",
  },
  title: {
    marginBottom: 12,
  },
  subtitle: {
    marginBottom: 24,
    opacity: 0.9,
  },
  links: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  link: {
    padding: "10px 14px",
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    borderRadius: 8,
    fontWeight: 600,
  },
  logoutButton: {
    padding: "10px 14px",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
  },
};