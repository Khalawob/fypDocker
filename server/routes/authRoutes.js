const express = require("express");
const bcrypt = require("bcrypt"); //this is for hashing passwords
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// register
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields required" });
  }

  const hash = await bcrypt.hash(password, 10); //this hashes password

  db.query(
    "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
    [username, email, hash],
    (err, result) => {
      if (err) 
        return res.status(500).json({ message: err.message });

      const newUserId = result.insertId;

      db.query(
        "INSERT INTO user_profile (user_id) VALUES (?)",
        [newUserId],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ message: "User registered successfully" });
        }
      )
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

      try {
        await updateLoginStreak(user.user_id);
        await awardStreakBadges(user.user_id);
      } catch (e) {
        console.error("Streak/badge update failed:", e);
        // do NOT block login if gamification fails
      }
      
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

// Function for login streak
async function updateLoginStreak(userId) {
  const rows = await query(
    "SELECT current_streak, longest_streak, last_login_date FROM user_profile WHERE user_id = ?",
    [userId]
  );

  const profile = rows?.[0] || { current_streak: 0, longest_streak: 0, last_login_date: null };

  // Use server-local date (UK) OR use user timezone later. Start simple: server date.
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD (UTC). If you want UK local day, use a timezone lib.

  const last = profile.last_login_date ? new Date(profile.last_login_date) : null;

  // Helper: difference in whole days using YYYY-MM-DD strings
  const toYMD = (d) => new Date(d).toISOString().slice(0, 10);

  let newStreak = profile.current_streak;

  if (!profile.last_login_date) {
    newStreak = 1;
  } else {
    const lastStr = toYMD(profile.last_login_date);
    if (lastStr === todayStr) {
      return; // already counted today
    }

    // yesterday in UTC-based day
    const y = new Date(today);
    y.setUTCDate(y.getUTCDate() - 1);
    const yesterdayStr = y.toISOString().slice(0, 10);

    newStreak = (lastStr === yesterdayStr) ? (profile.current_streak + 1) : 1;
  }

  const newLongest = Math.max(profile.longest_streak, newStreak);

  await query(
    `UPDATE user_profile
     SET current_streak = ?, longest_streak = ?, last_login_date = ?
     WHERE user_id = ?`,
    [newStreak, newLongest, todayStr, userId]
  );
}


async function awardStreakBadges(userId) {
  const p = await query("SELECT current_streak FROM user_profile WHERE user_id = ?", [userId]);
  const streak = p?.[0]?.current_streak || 0;

  const codesToCheck = [];
  if (streak >= 3) codesToCheck.push("STREAK_3");
  if (streak >= 7) codesToCheck.push("STREAK_7");
  if (streak >= 30) codesToCheck.push("STREAK_30");

  if (codesToCheck.length === 0) return;

  const badgeRows = await query(
    `SELECT badge_id FROM badges WHERE code IN (${codesToCheck.map(() => "?").join(",")})`,
    codesToCheck
  );

  for (const b of badgeRows) {
    await query(
      "INSERT IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)",
      [userId, b.badge_id]
    );
  }
}



module.exports = router;