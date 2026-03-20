import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useBackground } from "../context/BackgroundContext";

export default function Home() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { selectedBackground } = useBackground();

  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
  }, []);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setIsLoggedIn(false);
    navigate("/");
    window.location.reload();
  }

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

  return (
    <div style={pageStyle}>
      <header style={styles.navbar}>
        <div style={styles.brand}>Flashcard App</div>

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
              <Link style={styles.navLink} to="/profile">
                Profile
              </Link>
              <Link style={styles.navLink} to="/calibration">
                Calibration
              </Link>
            </>
          )}
        </nav>

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

      <main style={styles.heroSection}>
        <div style={styles.heroContent}>
          <h1 style={styles.heroTitle}>
            Study with the power of
            <br />
            active recall — without
            <br />
            wasting any time
          </h1>

          <p style={styles.heroSubtitle}>
            Create flashcard sets, practise with adaptive timing, unlock badges
            and backgrounds, and build a smarter revision system designed to
            keep learning focused, fast, and motivating.
          </p>

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
              </>
            )}
          </div>

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

      <div style={styles.bottomGlow} />
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at bottom center, rgba(59,130,246,0.18), transparent 28%), #020617",
    color: "white",
    position: "relative",
    overflow: "hidden",
  },
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
    padding: "18px 32px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  brand: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: "-0.03em",
  },
  navLinks: {
    display: "flex",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
  },
  navLink: {
    color: "rgba(255,255,255,0.82)",
    textDecoration: "none",
    fontSize: 15,
    fontWeight: 500,
  },
  navActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  loginLink: {
    color: "white",
    textDecoration: "none",
    fontWeight: 600,
    padding: "10px 12px",
  },
  topCtaButton: {
    background: "#4f46e5",
    color: "white",
    textDecoration: "none",
    padding: "12px 18px",
    borderRadius: 10,
    fontWeight: 700,
    boxShadow: "0 10px 28px rgba(79,70,229,0.28)",
  },
  secondaryTopButton: {
    background: "rgba(255,255,255,0.08)",
    color: "white",
    textDecoration: "none",
    padding: "12px 16px",
    borderRadius: 10,
    fontWeight: 700,
    border: "1px solid rgba(255,255,255,0.12)",
  },
  heroSection: {
    minHeight: "calc(100vh - 80px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "40px 24px 110px",
    boxSizing: "border-box",
  },
  heroContent: {
    maxWidth: 980,
    width: "100%",
  },
  heroTitle: {
    margin: 0,
    fontSize: "clamp(3rem, 7vw, 5.5rem)",
    lineHeight: 1.02,
    letterSpacing: "-0.06em",
    fontWeight: 800,
  },
  heroSubtitle: {
    maxWidth: 760,
    margin: "28px auto 0",
    fontSize: "clamp(1rem, 2vw, 1.15rem)",
    lineHeight: 1.7,
    color: "rgba(255,255,255,0.72)",
  },
  heroButtons: {
    display: "flex",
    justifyContent: "center",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 34,
  },
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
  quickLinks: {
    marginTop: 24,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  quickLink: {
    color: "#bfdbfe",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 14,
  },
  quickDivider: {
    color: "rgba(255,255,255,0.3)",
  },
  logoutButton: {
    padding: "12px 16px",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
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