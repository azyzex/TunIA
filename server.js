import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { load as cheerioLoad } from "cheerio";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
// Allow bigger payloads in case PDF text is large (still capped on client)
app.use(express.json({ limit: "1mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Style guide to steer Gemini to proper Tunisian Darija usage
const DARIJA_STYLE_GUIDE = `
قواعد الأسلوب:
- جاوب ديما بالدارجة التونسية، مفهومة وبسيطة وبعيدة على الفصحى.
- ما تستعملش "يا حسرة" كان وقت الحديث على الحنين للماضي/النوستالجيا. ما تعنيش "ما فهمتش".
- كان ما فهمتش سؤال المستخدم، إسألو توضيح: "شنية تقصد بـ ...؟" وما تستعملش تعابير جارحة.
- خليك مختصر وواضح، وكي تعطي خطوات دراسية ولا حلول، رتبهم بنقاط.
- قلّل من الكلمات الفرنسية/الإنجليزية كان فما بديل دارج تونسي.
`;

app.post("/api/chat", async (req, res) => {
  const { message, history, pdfText, webSearch } = req.body || {};
  // Quick request log
  console.log(
    "[POST] /api/chat",
    JSON.stringify(
      {
        messageLen: message ? String(message).length : 0,
        historyCount: Array.isArray(history) ? history.length : 0,
  hasPdfText: Boolean(pdfText),
  webSearch: Boolean(webSearch),
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
    return res.status(500).json({ error: "Missing GEMINI_API_KEY on server" });
  }

  try {
    // Optional DuckDuckGo search if requested
    let webSearchSnippet = '';
    let webResults = [];
    if (webSearch && message) {
      try {
        const q = encodeURIComponent(String(message).slice(0, 200));
        const ddgUrl = `https://api.duckduckgo.com/?q=${q}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
        const ddgResp = await fetch(ddgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const ddgJson = await ddgResp.json();
        const abstract = ddgJson?.AbstractText || ddgJson?.Abstract || '';
        const firstURL = ddgJson?.AbstractURL || (Array.isArray(ddgJson?.Results) && ddgJson.Results[0]?.FirstURL) || '';
        if (firstURL) webResults.push({ title: ddgJson?.Heading || 'Result', url: firstURL });
        if (Array.isArray(ddgJson?.RelatedTopics)) {
          for (const t of ddgJson.RelatedTopics) {
            const title = t?.Text || (Array.isArray(t?.Topics) ? t.Topics[0]?.Text : '');
            const url = t?.FirstURL || (Array.isArray(t?.Topics) ? t.Topics[0]?.FirstURL : '');
            if (title && url) webResults.push({ title, url });
            if (webResults.length >= 2) break; // Limit to 2 results total
          }
        }
        // HTML fallback if not enough URLs
        if (webResults.length < 2) {
          const ddgHtmlUrl = `https://html.duckduckgo.com/html/?q=${q}`;
          const htmlResp = await fetch(ddgHtmlUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const html = await htmlResp.text();
          const $ = cheerioLoad(html);
          $("a.result__a").each((_, el) => {
            if (webResults.length >= 2) return false; // Limit to 2 results
            const title = $(el).text().trim();
            let url = $(el).attr('href');
            // Extract actual URL from DuckDuckGo redirect
            if (url && url.includes('//duckduckgo.com/l/?uddg=')) {
              try {
                const urlParams = new URL(url, 'https://duckduckgo.com');
                const actualUrl = decodeURIComponent(urlParams.searchParams.get('uddg') || '');
                if (actualUrl) url = actualUrl;
              } catch (e) {
                // Keep original if parsing fails
              }
            }
            if (title && url) webResults.push({ title, url });
          });
        }
        const list = webResults.map((r, i) => `${i + 1}. ${r.title} - ${r.url}`).join('\n');
        webSearchSnippet = [
          abstract && `نتيجة مختصرة: ${abstract}`,
          webResults.length ? `روابط مفيدة:\n${list}` : ''
        ].filter(Boolean).join('\n\n');
        console.log('Web search results found:', webResults.length);
      } catch (e) {
        console.warn('Web search failed:', e.message);
      }
    }

    // Only keep the last 30 turns
    const last30 = Array.isArray(history) ? history.slice(-30) : [];
    // Convert history to Gemini API format with valid roles
    const contents = last30.map((turn) => ({
      role: turn.sender === "user" ? "user" : "model",
      parts: [{ text: turn.text }],
    }));
    // Add style guide as initial instruction
    contents.unshift({ role: "user", parts: [{ text: DARIJA_STYLE_GUIDE }] });
    // Add the latest user message
    let userPrompt = message || "";
    // Prefer web search when enabled; otherwise include PDF text if present
    if (webSearchSnippet) {
      userPrompt += `\n\n${webSearchSnippet}`;
    } else if (pdfText) {
      userPrompt += `\n\nهذا نص ملف PDF المرسل: ${pdfText}`;
    }
    contents.push({
      role: "user",
      parts: [{ text: userPrompt }],
    });
    // No need to add an extra instruction; covered by style guide

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
      console.error(
        "Gemini API error status:",
        response.status,
        response.statusText
      );
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
    let reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "ما فماش رد من Gemini.";
    // Sanitize known misused phrases (light-touch). Can be expanded.
    try {
      reply = reply
        // remove standalone/misplaced "يا حسرة" occurrences
        .replace(/(^|\s)يا\s*حسرة[،,.!؟]*\s*/g, (m, p1) => (p1 ? " " : ""))
        .trim();
    } catch (_) {}
    // Don't append sources at the end since they're already in the prompt/reply
    res.json({ reply });
  } catch (err) {
    console.error("/api/chat handler error:", err);
    res.status(500).json({ error: "API error", details: err.message });
  }
});

app.listen(3001, () => console.log("Server running on port 3001"));
