const express = require("express");                 // Import Express
const cors = require("cors");                      // Enable CORS
const db = require("./db");                        // MySQL connection
const http = require("http");
const jwt = require("jsonwebtoken");              // JWT for authentication
const { Server } = require("socket.io");

// Route imports
const authRoutes = require("./routes/authRoutes");           // Auth routes
const setRoutes = require("./routes/setRoutes");             // Flashcard set routes
const flashcardRoutes = require("./routes/flashcardRoutes"); // Flashcard routes
const variationRoutes = require("./routes/variationRoutes"); // NLP variation routes
const sessionRoutes = require("./routes/sessionRoutes");     // Session routes (router + completion)
const practiceRoutes = require("./routes/practiceRoutes");   // Practice engine routes
const calibrationRoutes = require("./routes/calibrationRoutes"); // Calibration routes 
const profileRoutes = require("./routes/profileRoutes"); // User profile routes
const setReminderRoutes = require("./routes/setReminderRoutes"); // Set review reminder routes
const { startReminderJob } = require("./jobs/reminderJob"); // Reminder job
const documentImportRoutes = require("./routes/documentImportRoutes");
const documentTextRoutes = require("./routes/documentTextRoutes");
const backgroundRoutes = require("./routes/backgroundRoutes");
const multiplayerRoutes = require("./routes/multiplayerRoutes");


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

app.use(cors());
app.use(express.json());

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/sets", setRoutes);
app.use("/api", flashcardRoutes);
app.use("/api", variationRoutes);
app.use("/api", sessionRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api", calibrationRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/sets", setReminderRoutes);
app.use("/api", documentImportRoutes);
app.use("/api", documentTextRoutes);
app.use("/api/backgrounds", backgroundRoutes);
app.use("/api/multiplayer", multiplayerRoutes);

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

// SOCKET AUTH
io.use((socket, next) => {
  try {
    const raw =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization ||
      "";

    let token = String(raw).trim();

    if (token.startsWith("Bearer ")) {
      token = token.slice(7).trim();
    }

    if (!token) {
      return next(new Error("Authentication token missing"));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");

    socket.user = {
      userId: payload.userId,
    };

    next();
  } catch (err) {
    return next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  const personalRoom = `user:${socket.user.userId}`;
  socket.join(personalRoom);

  socket.on("room:join", ({ joinCode }) => {
    if (!joinCode) return;
    socket.join(`room:${String(joinCode).toUpperCase()}`);
  });

  socket.on("room:leave", ({ joinCode }) => {
    if (!joinCode) return;
    socket.leave(`room:${String(joinCode).toUpperCase()}`);
  });
});

const PORT = process.env.PORT || 5000;
startReminderJob();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});


