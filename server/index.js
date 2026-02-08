const express = require("express");
const cors = require("cors");
const db = require("./db");
const authRoutes = require("./routes/authRoutes");
const setRoutes = require("./routes/setRoutes");
const flashcardRoutes = require("./routes/flashcardRoutes");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/sets", setRoutes);
app.use("/api", flashcardRoutes);


app.use("/api/auth", authRoutes);

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

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


