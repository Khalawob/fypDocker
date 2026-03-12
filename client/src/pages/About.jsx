import { Link } from "react-router-dom";

export default function About() {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>About Us</h1>
          <Link to="/" style={styles.linkButton}>
            Back Home
          </Link>
        </div>

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

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Our Goal</h2>
          <p style={styles.text}>
            The goal of this project is to explore how digital flashcards can be
            improved with adaptive timing, multiple practice modes, and
            fill-in-the-blank style question variations. It aims to make
            revision more interactive and more personalised for each learner.
          </p>
        </div>

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

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Project Background</h2>
          <p style={styles.text}>
            This system was developed as part of a university Final Year Project.
            It combines frontend development, backend API design, database
            management, and NLP-based text processing into a single study
            platform.
          </p>
        </div>

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

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b1220",
    color: "white",
    padding: 24,
  },
  container: {
    maxWidth: 900,
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
  },
  card: {
    background: "#121a2a",
    padding: 24,
    borderRadius: 12,
    marginBottom: 18,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: 12,
  },
  text: {
    lineHeight: 1.7,
    opacity: 0.95,
  },
  list: {
    margin: 0,
    paddingLeft: 20,
    lineHeight: 1.8,
  },
  linkButton: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#3b82f6",
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
  },
};
