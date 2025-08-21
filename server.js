import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
// Allow bigger payloads in case PDF text is large (still capped on client)
app.use(express.json({ limit: "1mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post("/api/chat", async (req, res) => {
  const { message, history, pdfText } = req.body || {};
  // Quick request log
  console.log(
    "[POST] /api/chat",
    JSON.stringify(
      {
        messageLen: message ? String(message).length : 0,
        historyCount: Array.isArray(history) ? history.length : 0,
        hasPdfText: Boolean(pdfText),
        pdfLen: pdfText ? String(pdfText).length : 0,
        time: new Date().toISOString(),
      },
      null,
      0
    )
  );

  // Check API key early
  if (!GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY in environment.");
    return res
      .status(500)
      .json({ error: "Missing GEMINI_API_KEY on server" });
  }

  try {
    // Only keep the last 30 turns
    const last30 = Array.isArray(history) ? history.slice(-30) : [];
    // Convert history to Gemini API format with valid roles
    const contents = last30.map((turn) => ({
      role: turn.sender === "user" ? "user" : "model",
      parts: [{ text: turn.text }],
    }));
    // Add the latest user message
    let userPrompt = message || "";
    if (pdfText) {
      userPrompt += `\n\nهذا نص ملف PDF المرسل: ${pdfText}`;
    }
    contents.push({
      role: "user",
      parts: [{ text: userPrompt }],
    });
    // Add instruction for Gemini to reply in Tunisian Darija only
    contents.push({
      role: "user",
      parts: [{ text: "رد فقط بالدارجة التونسية." }],
    });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });

    const textBody = await response.text();
    let data;
    try {
      data = JSON.parse(textBody);
    } catch (e) {
      data = { raw: textBody };
    }

    if (!response.ok) {
      console.error("Gemini API error status:", response.status, response.statusText);
      console.error("Gemini API error body:", textBody);
      const apiErrorMessage =
        (data && data.error && data.error.message) ||
        (typeof data === "string" ? data : JSON.stringify(data).slice(0, 1000));
      return res.status(502).json({
        error: "Gemini API request failed",
        status: response.status,
        message: apiErrorMessage,
      });
    }

    console.log("Gemini API response:", JSON.stringify(data, null, 2));
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "ما فماش رد من Gemini.";
    res.json({ reply });
  } catch (err) {
    console.error("/api/chat handler error:", err);
    res.status(500).json({ error: "API error", details: err.message });
  }
});

app.listen(3001, () => console.log("Server running on port 3001"));
