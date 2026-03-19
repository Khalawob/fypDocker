import { createContext, useContext, useEffect, useMemo, useState } from "react";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const BackgroundContext = createContext(null);

export function BackgroundProvider({ children }) {
  const [selectedBackground, setSelectedBackground] = useState(null);
  const [loadingBackground, setLoadingBackground] = useState(true);

  async function loadSelectedBackground() {
    const token = localStorage.getItem("token");

    if (!token) {
      setSelectedBackground(null);
      setLoadingBackground(false);
      return;
    }

    try {
      setLoadingBackground(true);

      const res = await fetch(`${API_URL}/api/backgrounds/me`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSelectedBackground(null);
        return;
      }

      const backgrounds = Array.isArray(data?.backgrounds) ? data.backgrounds : [];
      const selected =
        backgrounds.find((bg) => Number(bg.is_selected) === 1) || null;

      setSelectedBackground(selected);
    } catch (err) {
      console.error("Failed to load selected background");
      setSelectedBackground(null);
    } finally {
      setLoadingBackground(false);
    }
  }

  useEffect(() => {
    loadSelectedBackground();
  }, []);

  const value = useMemo(
    () => ({
      selectedBackground,
      loadingBackground,
      refreshBackground: loadSelectedBackground,
    }),
    [selectedBackground, loadingBackground]
  );

  return (
    <BackgroundContext.Provider value={value}>
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground() {
  const ctx = useContext(BackgroundContext);
  if (!ctx) {
    throw new Error("useBackground must be used inside BackgroundProvider");
  }
  return ctx;
}