const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const { PDFParse } = require("pdf-parse");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

async function ensureSetOwnership(setId, userId) {
  const rows = await query(
    `SELECT set_id
     FROM flashcard_set
     WHERE set_id = ? AND user_id = ?`,
    [setId, userId]
  );
  return rows.length > 0;
}

router.post(
  "/sets/:setId/extract-document-text",
  requireAuth,
  upload.single("document"),
  async (req, res) => {
    const setId = Number(req.params.setId);

    try {
      const ok = await ensureSetOwnership(setId, req.user.userId);
      if (!ok) {
        return res.status(404).json({ message: "Set not found" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const originalName = (req.file.originalname || "").toLowerCase();
      let text = "";

      if (originalName.endsWith(".docx")) {
        const result = await mammoth.extractRawText({
          buffer: req.file.buffer,
        });
        text = String(result.value || "").trim();
      } else if (originalName.endsWith(".pdf")) {
        const parser = new PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        await parser.destroy();
        text = String(result.text || "").trim();
      } else {
        return res.status(400).json({
          message: "Only .docx and .pdf files are supported right now",
        });
      }

      if (!text) {
        return res.status(400).json({
          message: "No readable text found in document",
        });
      }

      return res.json({ text });
    } catch (err) {
      console.error("Document text extraction error:", err);
      return res.status(500).json({
        message: "Failed to extract document text",
      });
    }
  }
);

module.exports = router;