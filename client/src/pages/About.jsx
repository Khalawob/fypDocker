// Import Link so the page can include navigation back to the home page
import { Link } from "react-router-dom";

// Import the custom background context so this page can use the user's selected background image
import { useBackground } from "../context/BackgroundContext";

// Main About page component
export default function About() {
  // Get the currently selected background from the shared background context
  const { selectedBackground } = useBackground();

  // Build the page style object.
  // It always starts with the default page styles,
  // then conditionally adds a background image overlay if the user has selected one.
  const pageStyle = {
    ...styles.page,
    ...(selectedBackground?.image_url
      ? {
          // Adds a dark transparent overlay on top of the background image
          // so the text stays readable
          backgroundImage: `linear-gradient(rgba(11,18,32,0.55), rgba(11,18,32,0.55)), url(${selectedBackground.image_url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }
      : {}),
  };

  // Render the About page UI
  return (
    <div style={pageStyle}>
      <div style={styles.container}>
        {/* Top header row containing the page title and navigation button */}
        <div style={styles.headerRow}>
          <h1 style={styles.title}>About Us</h1>
          <Link to="/" style={styles.linkButton}>
            Back Home
          </Link>
        </div>

        {/* Card section explaining what the project is */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>What is this project?</h2>
          <p style={styles.text}>
            This flashcard platform was created as a Final Year Project to help
            students revise more effectively using active recall and structured
            practice modes. The system allows users to create flashcard sets,
            manage their own study content, and practise using different levels
            of difficulty.
          </p>
        </div>

        {/* Card section describing the main aim of the system */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Our Goal</h2>
          <p style={styles.text}>
            The goal of this project is to explore how digital flashcards can be
            improved with adaptive timing, multiple practice modes, and
            fill-in-the-blank style question variations. It aims to make
            revision more interactive and more personalised for each learner.
          </p>
        </div>

        {/* Card section listing the core features of the platform */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Main Features</h2>
          <ul style={styles.list}>
            <li>Create and manage flashcard sets</li>
            <li>Add, edit, and delete flashcards</li>
            <li>Practise in EASY, MODERATE, and HARD modes</li>
            <li>Use answer variations such as blanks and clue-based recall</li>
            <li>Adaptive timing for preview and answer phases</li>
            <li>Session summaries and hardest-card review</li>
          </ul>
        </div>

        {/* Card section showing the technologies used to build the project */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Technology Stack</h2>
          <ul style={styles.list}>
            <li>React frontend</li>
            <li>Node.js and Express backend</li>
            <li>MySQL database</li>
            <li>Flask NLP microservice</li>
            <li>Docker Compose for development environment</li>
          </ul>
        </div>

        {/* Card section giving academic/project context */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Project Background</h2>
          <p style={styles.text}>
            This system was developed as part of a university Final Year Project.
            It combines frontend development, backend API design, database
            management, and NLP-based text processing into a single study
            platform.
          </p>
        </div>

        {/* Card section outlining possible future development ideas */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Future Improvements</h2>
          <ul style={styles.list}>
            <li>Spaced repetition scheduling</li>
            <li>Detailed progress analytics</li>
            <li>Improved accessibility and mobile responsiveness</li>
            <li>Shared or collaborative study sets</li>
            <li>More advanced NLP-generated flashcard variations</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Centralised inline styles object used by the component.
// Each key stores reusable styling for a specific part of the page.
const styles = {
  // Outer page wrapper styling
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },

  // Main content container that limits width and centres content
  container: {
    maxWidth: 900,
    margin: "0 auto",
  },

  // Header layout for title and back button
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
    flexWrap: "wrap",
  },

  // Main page title styling
  title: {
    margin: 0,
  },

  // Reusable card style for each About section
  card: {
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    marginBottom: 18,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },

  // Heading style used for each section title
  sectionTitle: {
    marginTop: 0,
    marginBottom: 12,
  },

  // Paragraph text styling for readable line spacing
  text: {
    lineHeight: 1.7,
    opacity: 0.95,
  },

  // List styling used in feature and technology sections
  list: {
    margin: 0,
    paddingLeft: 20,
    lineHeight: 1.8,
  },

  // Styled link button used for navigating back to the homepage
  linkButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
  },
};
