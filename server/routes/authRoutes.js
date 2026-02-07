const express = require("express");
const bcrypt = require("bcrypt"); //this is for hashing passwords
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

// register
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields required" });
  }

  const hash = await bcrypt.hash(password, 10); //this hashes password

  db.query(
    "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
    [username, email, hash],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: "User registered successfully" });
    }
  );
});


// LOGIN
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
      }

      if (results.length === 0) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const user = results[0];

      console.log("LOGIN DEBUG:"); // THIS IS FOR DEBUGGING PURPOSES ONLY, REMOVE IN PRODUCTION
      console.log("Email:", email);
      console.log("DB hash:", user.password_hash);
      console.log("Password entered:", password);

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { userId: user.user_id },
        process.env.JWT_SECRET || "dev_secret",
        { expiresIn: "1h" }
      );

      res.json({
        message: "Login successful",
        token,
        user: {
          id: user.user_id,
          username: user.username,
          email: user.email
        }
      });
    }
  );
});

module.exports = router;