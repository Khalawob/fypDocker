const express = require("express"); // Express framework for defining API routes
const multer = require("multer"); // Middleware for handling file uploads
const mammoth = require("mammoth"); // Library used to extract raw text from .docx files
const { PDFParse } = require("pdf-parse"); // Library used to extract text from PDF files
const db = require("../db"); // Shared MySQL database connection
const { requireAuth } = require("../middleware/auth"); // Middleware that ensures the user is logged in

const router = express.Router(); // Router instance exported at the end of the file

// Multer upload configuration.
// Files are stored in memory instead of being written to disk,
// and uploads are limited to 10MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// Promise wrapper around db.query so async/await can be used
// instead of callback-based SQL handling.
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// Checks that the requested flashcard set belongs to the logged-in user.
// This stops users from extracting document text for sets they do not own.
async function ensureSetOwnership(setId, userId) {
  const rows = await query(
    `SELECT set_id
     FROM flashcard_set
     WHERE set_id = ? AND user_id = ?`,
    [setId, userId]
  );
  return rows.length > 0;
}

// -----------------------------------------------------------------------------
// ROUTE: Extract readable text from an uploaded document
// POST /api/sets/:setId/extract-document-text
//
// This route accepts one uploaded file under the field name "document".
// It supports:
// - .docx files using mammoth
// - .pdf files using pdf-parse
//
// The extracted plain text is returned to the frontend, but nothing is saved
// to the database here.
// -----------------------------------------------------------------------------
router.post(
  "/sets/:setId/extract-document-text",
  requireAuth, // User must be logged in
  upload.single("document"), // Expect a single uploaded file called "document"
  async (req, res) => {
    const setId = Number(req.params.setId); // Parse set ID from the URL

    try {
      // Ensure the requested set belongs to the logged-in user.
      const ok = await ensureSetOwnership(setId, req.user.userId);
      if (!ok) {
        return res.status(404).json({ message: "Set not found" });
      }

      // Stop immediately if no file was uploaded.
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const originalName = (req.file.originalname || "").toLowerCase(); // Normalise filename for extension checks
      let text = ""; // Will hold the extracted plain text

      // If the uploaded file is a Word document, extract its raw text.
      if (originalName.endsWith(".docx")) {
        const result = await mammoth.extractRawText({
          buffer: req.file.buffer,
        });
        text = String(result.value || "").trim();

      // If the uploaded file is a PDF, parse its text content.
      } else if (originalName.endsWith(".pdf")) {
        const parser = new PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        await parser.destroy(); // Clean up parser resources after extraction
        text = String(result.text || "").trim();

      // Reject unsupported file types.
      } else {
        return res.status(400).json({
          message: "Only .docx and .pdf files are supported right now",
        });
      }

      // If extraction succeeded but no readable text was found, return an error.
      if (!text) {
        return res.status(400).json({
          message: "No readable text found in document",
        });
      }

      // Return the extracted text to the frontend so it can be used
      // for flashcard generation or review.
      return res.json({ text });
    } catch (err) {
      console.error("Document text extraction error:", err);
      return res.status(500).json({
        message: "Failed to extract document text",
      });
    }
  }
);

// Export the configured router so it can be mounted in app.js
module.exports = router;