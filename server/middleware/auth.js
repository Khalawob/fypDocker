const jwt = require("jsonwebtoken"); // Library used to verify JSON Web Tokens (JWTs)

// Authentication middleware used to protect routes.
// It checks for a Bearer token in the Authorization header,
// verifies it, and if valid attaches the authenticated user ID to req.user.
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ""; // Read the Authorization header safely
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null; // Extract the token if the header uses Bearer format

  // If no token is present, reject the request as unauthenticated.
  if (!token) {
    return res.status(401).json({ message: "Missing Authorization token" });
  }

  try {
    // Verify the token using the server's JWT secret.
    // If verification succeeds, extract the userId from the payload.
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");

    // Attach the authenticated user information to the request object
    // so later route handlers can access req.user.userId.
    req.user = { userId: payload.userId };

    next(); // Continue to the next middleware or route handler
  } catch (err) {
    // If the token is invalid, malformed, or expired, reject the request.
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// Export the middleware so it can be reused in protected route files
module.exports = { requireAuth };