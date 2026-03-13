import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>404</h1>
        <p style={styles.subtitle}>Page not found</p>

        <Link to="/" style={styles.link}>
          Back to Home
        </Link>
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
    maxWidth: 420,
    width: "100%",
  },
  title: {
    margin: 0,
    fontSize: 48,
  },
  subtitle: {
    marginTop: 12,
    marginBottom: 24,
    opacity: 0.9,
  },
  link: {
    display: "inline-block",
    padding: "10px 14px",
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    borderRadius: 8,
    fontWeight: 600,
  },
};