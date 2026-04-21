// Import Link from React Router so the page can provide navigation back to the home page
import { Link } from "react-router-dom";

// Import the background context so the user's selected background can be applied to this page
import { useBackground } from "../context/BackgroundContext";

// Main component for the 404 Not Found page
export default function NotFound() {
  // Get the currently selected custom background from the shared background context
  const { selectedBackground } = useBackground();

  // Build the final page style object.
  // It starts with the default page styles and conditionally adds a selected background image
  // with a dark overlay so the content remains readable.
  const pageStyle = {
    ...styles.page,
    ...(selectedBackground?.image_url
      ? {
          backgroundImage: `linear-gradient(rgba(11,18,32,0.78), rgba(11,18,32,0.78)), url(${selectedBackground.image_url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }
      : {}),
  };

  // Render the 404 page UI
  return (
    <div style={pageStyle}>
      <div style={styles.card}>
        {/* Large error code shown to the user */}
        <h1 style={styles.title}>404</h1>

        {/* Short message explaining that the page does not exist */}
        <p style={styles.subtitle}>Page not found</p>

        {/* Navigation link back to the homepage */}
        <Link to="/" style={styles.link}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}

// Centralised styles object for the Not Found page.
// Keeps layout and visual styling separate from the component logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  // Main card container used to display the 404 message
  card: {
    background: "#121a2a",
    padding: 32,
    borderRadius: 12,
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    maxWidth: 420,
    width: "100%",
  },

  // Large 404 title styling
  title: {
    margin: 0,
    fontSize: 48,
  },

  // Subtitle styling for the page-not-found message
  subtitle: {
    marginTop: 12,
    marginBottom: 24,
    opacity: 0.9,
  },

  // Styled link button used to return the user to the homepage
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