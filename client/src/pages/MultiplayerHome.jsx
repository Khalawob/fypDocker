// Import Link from React Router so this page can provide navigation to other parts of the app
import { Link } from "react-router-dom";

// Main page component for the multiplayer home screen
export default function MultiplayerHome() {
  // Render the multiplayer landing page UI
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Main page heading */}
        <h1>Multiplayer</h1>

        {/* Short description explaining what the page is for */}
        <p>Create a room or join a room with a code or QR scan.</p>

        {/* Button row containing navigation options for multiplayer actions */}
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

// Centralised styles object for the Multiplayer Home page.
// Keeps layout and visual styling separate from the component logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },

  // Main card container that centres the content and limits width
  card: {
    maxWidth: 700,
    margin: "40px auto",
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
  },

  // Layout row for the navigation buttons
  row: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 20,
  },

  // Primary green button styling used for creating a room
  primaryButton: {
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    background: "#22c55e",
    color: "white",
    fontWeight: 700,
  },

  // Secondary blue button styling used for joining a room
  secondaryButton: {
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    background: "#3b82f6",
    color: "white",
    fontWeight: 700,
  },

  // Neutral button styling used for returning to the sets page
  linkButton: {
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    background: "#334155",
    color: "white",
    fontWeight: 700,
  },
};