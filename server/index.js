const express = require("express");                 // Import Express
const cors = require("cors");                      // Enable CORS
const db = require("./db");                        // MySQL connection

// Route imports
const authRoutes = require("./routes/authRoutes");           // Auth routes
const setRoutes = require("./routes/setRoutes");             // Flashcard set routes
const flashcardRoutes = require("./routes/flashcardRoutes"); // Flashcard routes
const variationRoutes = require("./routes/variationRoutes"); // NLP variation routes
const sessionRoutes = require("./routes/sessionRoutes");     // Session routes (router + completion)
const practiceRoutes = require("./routes/practiceRoutes");   // Practice engine routes

const app = express();  // Create Express app

app.use(cors());    // Enable CORS middleware
app.use(express.json());  // Parse JSON bodies

// ROUTES 

// Auth
app.use("/api/auth", authRoutes);

// Flashcard sets
app.use("/api/sets", setRoutes);

// Flashcards
app.use("/api", flashcardRoutes);

// NLP variations
app.use("/api", variationRoutes);

// Session routes
app.use("/api", sessionRoutes);

// Practice routes
app.use("/api/practice", practiceRoutes);

// End points for tests

app.get("/", (req, res) => {
  res.send("Flashcard API running");
});

app.get("/test-db", (req, res) => {
  db.query("SELECT * FROM users", (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

//START SERVER

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


