import { Link } from "react-router-dom";

export default function MultiplayerHome() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Multiplayer</h1>
        <p>Create a room or join a room with a code or QR scan.</p>

        <div style={styles.row}>
          <Link to="/multiplayer/create" style={styles.primaryButton}>
            Create Room
          </Link>
          <Link to="/multiplayer/join" style={styles.secondaryButton}>
            Join Room
          </Link>
          <Link to="/sets" style={styles.linkButton}>
            Back to Sets
          </Link>
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
    padding: 24,
  },
  card: {
    maxWidth: 700,
    margin: "40px auto",
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
  },
  row: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 20,
  },
  primaryButton: {
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    background: "#22c55e",
    color: "white",
    fontWeight: 700,
  },
  secondaryButton: {
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    background: "#3b82f6",
    color: "white",
    fontWeight: 700,
  },
  linkButton: {
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    background: "#334155",
    color: "white",
    fontWeight: 700,
  },
};