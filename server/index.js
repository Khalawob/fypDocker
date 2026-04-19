const express = require("express"); // Import Express framework for building the API server
const cors = require("cors"); // Enable Cross-Origin Resource Sharing so the frontend can call the backend
const db = require("./db"); // Import shared MySQL database connection
const http = require("http"); // Node HTTP module, used to create the server for both Express and Socket.IO
const jwt = require("jsonwebtoken"); // JWT library for verifying socket authentication tokens
const { Server } = require("socket.io"); // Socket.IO server for real-time multiplayer communication

// Route imports
const authRoutes = require("./routes/authRoutes"); // Authentication routes such as login/register
const setRoutes = require("./routes/setRoutes"); // Flashcard set CRUD routes
const flashcardRoutes = require("./routes/flashcardRoutes"); // Individual flashcard CRUD routes
const variationRoutes = require("./routes/variationRoutes"); // NLP-based answer variation routes
const sessionRoutes = require("./routes/sessionRoutes"); // Session completion routes and reusable session logic
const practiceRoutes = require("./routes/practiceRoutes"); // Main solo practice engine routes
const calibrationRoutes = require("./routes/calibrationRoutes"); // Reading speed calibration routes
const profileRoutes = require("./routes/profileRoutes"); // User profile routes
const setReminderRoutes = require("./routes/setReminderRoutes"); // Set review reminder routes
const { startReminderJob } = require("./jobs/reminderJob"); // Background cron job for sending reminder emails
const documentImportRoutes = require("./routes/documentImportRoutes"); // Routes for generating flashcards from document text
const documentTextRoutes = require("./routes/documentTextRoutes"); // Routes for extracting raw text from uploaded documents
const backgroundRoutes = require("./routes/backgroundRoutes"); // Routes for unlockable/selectable backgrounds
const multiplayerRoutes = require("./routes/multiplayerRoutes"); // Multiplayer room and gameplay routes

const app = express(); // Create the main Express app
const server = http.createServer(app); // Create an HTTP server so Express and Socket.IO can share the same server

// Create the Socket.IO server and allow cross-origin socket connections.
// This is needed for the multiplayer frontend to connect in real time.
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Store the Socket.IO instance on the Express app so route files
// can access it with req.app.get("io") and emit live room updates.
app.set("io", io);

// Global middleware
app.use(cors()); // Allow cross-origin HTTP requests
app.use(express.json()); // Parse incoming JSON request bodies

// ROUTES
// Mount each feature router under its API path.
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

// Simple root route used as a quick check that the API server is running.
app.get("/", (req, res) => {
  res.send("Flashcard API running");
});

// Temporary/testing route to confirm database connectivity.
// It queries all users from the database and returns them directly.
app.get("/test-db", (req, res) => {
  db.query("SELECT * FROM users", (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// SOCKET AUTH
// This middleware runs before a socket connection is accepted.
// It verifies the user's JWT and attaches the authenticated user ID to the socket.
io.use((socket, next) => {
  try {
    const raw =
      socket.handshake.auth?.token || // Token sent in Socket.IO auth payload
      socket.handshake.headers?.authorization || // Or token sent in headers
      "";

    let token = String(raw).trim();

    // Remove "Bearer " prefix if present.
    if (token.startsWith("Bearer ")) {
      token = token.slice(7).trim();
    }

    // Reject socket connection if no token is provided.
    if (!token) {
      return next(new Error("Authentication token missing"));
    }

    // Verify the token using the same JWT secret as the main API.
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");

    // Attach the authenticated user identity to the socket object
    // so later socket handlers know who is connected.
    socket.user = {
      userId: payload.userId,
    };

    next(); // Allow the connection
  } catch (err) {
    return next(new Error("Authentication failed")); // Reject invalid tokens
  }
});

// Main Socket.IO connection handler.
// Runs whenever an authenticated user connects to the socket server.
io.on("connection", (socket) => {
  // Every user joins their own private room, which allows the server
  // to send personalised room/game state updates just to that user.
  const personalRoom = `user:${socket.user.userId}`;
  socket.join(personalRoom);

  // When the client joins a multiplayer room, also join the shared socket room
  // for that room's join code so broadcast updates can be received.
  socket.on("room:join", ({ joinCode }) => {
    if (!joinCode) return;
    socket.join(`room:${String(joinCode).toUpperCase()}`);
  });

  // When the client leaves a multiplayer room, leave the shared socket room
  // so it stops receiving that room's real-time updates.
  socket.on("room:leave", ({ joinCode }) => {
    if (!joinCode) return;
    socket.leave(`room:${String(joinCode).toUpperCase()}`);
  });
});

const PORT = process.env.PORT || 5000; // Use environment port if provided, otherwise default to 5000

startReminderJob(); // Start the recurring reminder email cron job when the server boots

// Start the combined HTTP + Socket.IO server and listen on all network interfaces.
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});


