// Import navigation helpers from React Router.
// Link is used for clickable route links,
// useNavigate is used to move to another route programmatically.
import { Link, useNavigate } from "react-router-dom";

// Import React hooks:
// useEffect is used to run logic when the component first loads,
// useState is used to store local component state values.
import { useEffect, useState } from "react";

// Import the background context so the user's selected background can be applied to the home page
import { useBackground } from "../context/BackgroundContext";

// Main Home page component
export default function Home() {
  // React Router navigation helper used for actions like logout redirects
  const navigate = useNavigate();

  // Tracks whether the user is currently logged in
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Get the currently selected custom background from the shared background context
  const { selectedBackground } = useBackground();

  // Runs once when the page loads.
  // It checks localStorage for a saved token and uses that to decide whether the user is logged in.
  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
  }, []);

  // Handles user logout.
  // It removes saved login data from localStorage,
  // updates the local logged-in state,
  // sends the user back to the home page,
  // and reloads the page so the UI resets fully.
  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setIsLoggedIn(false);
    navigate("/");
    window.location.reload();
  }

  // Build the final page style object.
  // It starts with the default page styles and conditionally adds a selected background image
  // with a dark overlay so text remains readable.
  const pageStyle = {
    ...styles.page,
    ...(selectedBackground?.image_url
      ? {
          backgroundImage: `linear-gradient(rgba(2,6,23,0.78), rgba(2,6,23,0.88)), url(${selectedBackground.image_url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }
      : {}),
  };

  // Render the main home page UI
  return (
    <div style={pageStyle}>
      {/* Top navigation bar for branding, navigation links, and account actions */}
      <header style={styles.navbar}>
        <div style={styles.brand}>Learn In A Flash</div>

        {/* Main navigation links.
            Extra links are shown only when the user is logged in. */}
        <nav style={styles.navLinks}>
          <Link style={styles.navLink} to="/about">
            About
          </Link>

          {isLoggedIn && (
            <>
              <Link style={styles.navLink} to="/sets">
                My Sets
              </Link>
              <Link style={styles.navLink} to="/practice">
                Practice
              </Link>
              <Link style={styles.navLink} to="/multiplayer/join">
                Join Room
              </Link>
              <Link style={styles.navLink} to="/profile">
                Profile
              </Link>
              <Link style={styles.navLink} to="/calibration">
                Calibration
              </Link>
            </>
          )}
        </nav>

        {/* Right-hand navigation actions.
            Logged-out users see login/register buttons.
            Logged-in users see dashboard and logout actions. */}
        <div style={styles.navActions}>
          {!isLoggedIn ? (
            <>
              <Link style={styles.loginLink} to="/login">
                Log in
              </Link>
              <Link style={styles.topCtaButton} to="/register">
                Get started — it&apos;s free
              </Link>
            </>
          ) : (
            <>
              <Link style={styles.secondaryTopButton} to="/sets">
                Dashboard
              </Link>
              <button style={styles.logoutButton} onClick={handleLogout}>
                Logout
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main hero section in the centre of the page */}
      <main style={styles.heroSection}>
        <div style={styles.heroContent}>
          {/* Main headline introducing the platform */}
          <h1 style={styles.heroTitle}>
            Study with the power of
            <br />
            active recall — without
            <br />
            wasting any time
          </h1>

          {/* Supporting description explaining the platform's main benefits */}
          <p style={styles.heroSubtitle}>
            Create flashcard sets, practise with adaptive timing, unlock badges
            and backgrounds, and build a smarter revision system designed to
            keep learning focused, fast, and motivating.
          </p>

          {/* Main call-to-action buttons.
              Logged-out users are encouraged to register or log in.
              Logged-in users are shown shortcuts into the main app features. */}
          <div style={styles.heroButtons}>
            {!isLoggedIn ? (
              <>
                <Link style={styles.heroPrimaryButton} to="/register">
                  Start learning
                </Link>
                <Link style={styles.heroSecondaryButton} to="/login">
                  Login
                </Link>
              </>
            ) : (
              <>
                <Link style={styles.heroPrimaryButton} to="/sets">
                  Open My Sets
                </Link>
                <Link style={styles.heroSecondaryButton} to="/practice">
                  Start Practice
                </Link>
                <Link style={styles.heroSecondaryButton} to="/multiplayer/join">
                  Join Multiplayer Room
                </Link>
              </>
            )}
          </div>

          {/* Smaller quick links shown beneath the main hero buttons */}
          <div style={styles.quickLinks}>
            <Link style={styles.quickLink} to="/about">
              Learn more
            </Link>
            <span style={styles.quickDivider}>•</span>
            <Link style={styles.quickLink} to="/profile">
              Profile
            </Link>
            <span style={styles.quickDivider}>•</span>
            <Link style={styles.quickLink} to="/calibration">
              Reading Calibration
            </Link>
          </div>
        </div>
      </main>

      {/* Decorative glowing effect at the bottom of the page */}
      <div style={styles.bottomGlow} />
    </div>
  );
}

// Centralised styles object for the Home page.
// Keeps layout and appearance styling separate from the component logic.
const styles = {
  // Full page wrapper styling
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at bottom center, rgba(59,130,246,0.18), transparent 28%), #020617",
    color: "white",
    position: "relative",
    overflow: "hidden",
  },

  // Top navigation bar layout
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
    padding: "18px 32px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },

  // Branding text styling
  brand: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },

  // Container for navigation links in the navbar
  navLinks: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
  },

  // Shared styling for navbar links
  navLink: {
    color: "rgba(255,255,255,0.82)",
    textDecoration: "none",
    fontSize: 15,
    fontWeight: 500,
  },

  // Container for top-right account action buttons
  navActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  // Styling for the login link
  loginLink: {
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
    padding: "10px 12px",
  },

  // Main top call-to-action button used for registration
  topCtaButton: {
    background: "#4f46e5",
    color: "white",
    textDecoration: "none",
    padding: "12px 18px",
    borderRadius: 10,
    fontWeight: 700,
    boxShadow: "0 10px 28px rgba(79,70,229,0.28)",
  },

  // Secondary top button shown to logged-in users for dashboard access
  secondaryTopButton: {
    background: "rgba(255,255,255,0.08)",
    color: "white",
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    fontWeight: 700,
    border: "1px solid rgba(255,255,255,0.12)",
  },

  // Main hero section layout
  heroSection: {
    minHeight: "calc(100vh - 80px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "40px 24px 110px",
    boxSizing: "border-box",
  },

  // Inner content container for the hero section
  heroContent: {
    maxWidth: 980,
    width: "100%",
  },

  // Main hero heading styling
  heroTitle: {
    margin: 0,
    fontSize: "clamp(3rem, 7vw, 5.5rem)",
    lineHeight: 1.02,
    letterSpacing: "-0.06em",
    fontWeight: 800,
  },

  // Supporting subtitle text styling
  heroSubtitle: {
    maxWidth: 760,
    margin: "28px auto 0",
    fontSize: "clamp(1rem, 2vw, 1.15rem)",
    lineHeight: 1.7,
    color: "rgba(255,255,255,0.72)",
  },

  // Layout for the hero buttons
  heroButtons: {
    display: "flex",
    justifyContent: "center",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 34,
  },

  // Main hero action button styling
  heroPrimaryButton: {
    background: "#4f46e5",
    color: "white",
    textDecoration: "none",
    padding: "15px 24px",
    borderRadius: 12,
    fontWeight: 800,
    fontSize: 16,
    boxShadow: "0 12px 36px rgba(79,70,229,0.3)",
  },

  // Secondary hero action button styling
  heroSecondaryButton: {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    textDecoration: "none",
    padding: "15px 24px",
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 16,
    border: "1px solid rgba(255,255,255,0.12)",
  },

  // Layout for the small quick links below the hero buttons
  quickLinks: {
    marginTop: 24,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  // Styling for each quick link
  quickLink: {
    color: "#bfdbfe",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 14,
  },

  // Divider styling between quick links
  quickDivider: {
    color: "rgba(255,255,255,0.3)",
  },

  // Logout button styling
  logoutButton: {
    padding: "12px 16px",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },

  // Decorative glowing effect shown near the bottom of the page
  bottomGlow: {
    position: "absolute",
    left: "50%",
    bottom: -120,
    transform: "translateX(-50%)",
    width: "75%",
    height: 220,
    background:
      "radial-gradient(ellipse at center, rgba(59,130,246,0.32) 0%, rgba(59,130,246,0.12) 35%, rgba(59,130,246,0) 72%)",
    filter: "blur(18px)",
    pointerEvents: "none",
  },
};