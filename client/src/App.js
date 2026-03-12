import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Sets from "./pages/Sets";
import Practice from "./pages/Practice";
import CreateSet from "./pages/CreateSet";
import SetDetails from "./pages/SetDetails";
import EditFlashcard from "./pages/EditFlashcard";
import AddFlashcard from "./pages/AddFlashcard";
import EditSet from "./pages/EditSet";
import Profile from "./pages/Profile";
import About from "./pages/About";
import Calibration from "./pages/Calibration";

function Home() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Flashcard App</h1>
        <p style={styles.subtitle}>Welcome to your practice system</p>

        <div style={styles.links}>
          <Link style={styles.link} to="/register">
            Register
          </Link>
          <Link style={styles.link} to="/login">
            Login
          </Link>
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
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/sets" element={<Sets />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/sets/create" element={<CreateSet />} />
        <Route path="/sets/:setId" element={<SetDetails />} />
        <Route path="/sets/:setId/add-flashcard" element={<AddFlashcard />} />
        <Route path="/sets/:setId/flashcards/:flashcardId/edit" element={<EditFlashcard />} />
        <Route path="/sets/:setId/edit" element={<EditSet />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/about" element={<About />} />
        <Route path="/calibration" element={<Calibration />} />
      </Routes>
    </BrowserRouter>
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
};

export default App;
