import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body;
  // history: array of { sender: 'user'|'ai', text: '...' }
  try {
    // Only keep the last 10 turns
    const last10 = Array.isArray(history) ? history.slice(-10) : [];
    // Convert history to Gemini API format with valid roles
    const contents = last10.map(turn => ({
      role: turn.sender === 'user' ? 'user' : 'model',
      parts: [
        { text: turn.text }
      ]
    }));
    // Add the latest user message
    contents.push({
      role: 'user',
      parts: [
        { text: message }
      ]
    });
    // Add instruction for Gemini to reply in Tunisian Darija only
    contents.push({
      role: 'user',
      parts: [
        { text: 'رد فقط بالدارجة التونسية.' }
      ]
    });
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      }
    );
    const data = await response.json();
    console.log('Gemini API response:', JSON.stringify(data, null, 2));
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "ما فماش رد من Gemini.";
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: "API error", details: err.message });
  }
});

app.listen(3001, () => console.log("Server running on port 3001"));
