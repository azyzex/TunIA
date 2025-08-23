import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { load as cheerioLoad } from "cheerio";
import dotenv from "dotenv";
import MarkdownIt from "markdown-it";
import puppeteer from "puppeteer";
dotenv.config();

const app = express();
app.use(cors());
// Allow bigger payloads in case PDF text is large (still capped on client)
app.use(express.json({ limit: "10mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Style guide to steer Gemini to proper Tunisian Darija usage
const DARIJA_STYLE_GUIDE = `
قواعد الأسلوب:
- جاوب ديما بالدارجة التونسية، مفهومة وبسيطة وبعيدة على الفصحى.
- ما تستعملش "يا حسرة" كان وقت الحديث على الحنين للماضي/النوستالجيا. ما تعنيش "ما فهمتش".
- كان ما فهمتش سؤال المستخدم، إسألو توضيح: "شنية تقصد بـ ...؟" وما تستعملش تعابير جارحة.
- خليك مختصر وواضح، وكي تعطي خطوات دراسية ولا حلول، رتبهم بنقاط.
- قلّل من الكلمات الفرنسية/الإنجليزية كان فما بديل دارج تونسي.
- كان تلقى روابط في السياق، قول "لقيت روابط من البحث" أو "حسب البحث على الانترنت" - ما تقولش "عطيتني" لأن المستخدم ما عطاكش شي.
- ما تقولش "ما نجمش نفتح الروابط". كان النص من رابط توفّر في المعطيات، استعملو مباشرة وردّ عليه بلا اعتذارات.
- كان فمّا نص مستخرج من رابط، الأولوية إنك تعتمد عليه في الإجابة.
`;

app.post("/api/chat", async (req, res) => {
  const { message, history, pdfText, webSearch, image } = req.body || {};
  const { fetchUrl } = req.body || {};
  // Quick request log
  console.log(
    "[POST] /api/chat",
    JSON.stringify(
      {
        messageLen: message ? String(message).length : 0,
        historyCount: Array.isArray(history) ? history.length : 0,
        hasPdfText: Boolean(pdfText),
        webSearch: Boolean(webSearch),
        fetchUrl: Boolean(fetchUrl),
  pdfLen: pdfText ? String(pdfText).length : 0,
  hasImage: Boolean(image && image.data && image.mimeType),
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
  let webSearchSnippet = "";
  let webResults = [];
  let fetchedPageText = "";
  let fetchedSearchPages = [];
    const urlMatch =
      typeof message === "string" ? message.match(/https?:\/\/\S+/i) : null;
    // Try to recover the last URL from conversation history if current message has none
    let lastUrlFromHistory = null;
    if (!urlMatch && Array.isArray(history) && history.length) {
      for (let i = history.length - 1; i >= 0; i--) {
        const m =
          typeof history[i]?.text === "string"
            ? history[i].text.match(/https?:\/\/\S+/i)
            : null;
        if (m && m[0]) {
          lastUrlFromHistory = m[0];
          break;
        }
      }
    }
  const candidateUrl = urlMatch?.[0] || lastUrlFromHistory || null;
  // Fetch only when the combined tool is enabled AND a URL is available
  const shouldFetchFromUrl = Boolean(fetchUrl && candidateUrl);
    // Optional Fetch URL: extract readable text from a URL in the message
    if (shouldFetchFromUrl && typeof message === "string") {
      try {
        if (candidateUrl) {
          const target = candidateUrl;
          // Basic allowlist to avoid local/unsafe protocols
          if (
            /^https?:\/\//i.test(target) &&
            !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(target)
          ) {
            const pageResp = await fetch(target, {
              headers: { "User-Agent": "Mozilla/5.0" },
            });
            const ct = (
              pageResp.headers.get("content-type") || ""
            ).toLowerCase();
            console.log(
              "Fetch URL target:",
              target,
              "status:",
              pageResp.status,
              "ctype:",
              ct
            );
            const raw = await pageResp.text();
            if (ct.includes("text/html")) {
              const $ = cheerioLoad(raw);
              // Remove scripts/styles and get text
              $("script, style, noscript").remove();
              const text = $("body").text().replace(/\s+/g, " ").trim();
              fetchedPageText = text.slice(0, 50000); // cap to ~50k chars
            } else if (
              ct.startsWith("text/") ||
              ct.includes("json") ||
              ct.includes("xml")
            ) {
              // Fallback: keep as plain text
              fetchedPageText = raw.slice(0, 50000);
            }
            console.log("Fetched page text length:", fetchedPageText.length);
          }
        }
      } catch (e) {
        console.warn("Fetch URL failed:", e.message);
      }
    }

    // If user explicitly asked to extract/send the whole page text and we have it, return it directly
    const wantsRawPage =
      typeof message === "string" &&
      (/(\bextract\b|استخرج|رجع\s*النص|النص\s*كامل|المحتوى\s*كامل)/i.test(
        message
      ) ||
        /(اعطيني|هات|جيب).{0,30}(النص|text)/i.test(message));
    if (wantsRawPage && fetchedPageText) {
      const truncated = fetchedPageText.length >= 50000;
      return res.json({ reply: fetchedPageText, truncated });
    }
  if (webSearch && message) {
      try {
        const q = encodeURIComponent(String(message).slice(0, 200));
        const ddgUrl = `https://api.duckduckgo.com/?q=${q}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
        const ddgResp = await fetch(ddgUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const ddgJson = await ddgResp.json();
        const abstract = ddgJson?.AbstractText || ddgJson?.Abstract || "";
        const firstURL =
          ddgJson?.AbstractURL ||
          (Array.isArray(ddgJson?.Results) && ddgJson.Results[0]?.FirstURL) ||
          "";
        if (firstURL)
          webResults.push({
            title: ddgJson?.Heading || "Result",
            url: firstURL,
          });
        if (Array.isArray(ddgJson?.RelatedTopics)) {
          for (const t of ddgJson.RelatedTopics) {
            const title =
              t?.Text || (Array.isArray(t?.Topics) ? t.Topics[0]?.Text : "");
            const url =
              t?.FirstURL ||
              (Array.isArray(t?.Topics) ? t.Topics[0]?.FirstURL : "");
            if (title && url) webResults.push({ title, url });
            if (webResults.length >= 2) break; // Limit to 2 results total
          }
        }
        // HTML fallback if not enough URLs
        if (webResults.length < 2) {
          const ddgHtmlUrl = `https://html.duckduckgo.com/html/?q=${q}`;
          const htmlResp = await fetch(ddgHtmlUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          const html = await htmlResp.text();
          const $ = cheerioLoad(html);
          $("a.result__a").each((_, el) => {
            if (webResults.length >= 2) return false; // Limit to 2 results
            const title = $(el).text().trim();
            let url = $(el).attr("href");
            // Extract actual URL from DuckDuckGo redirect
            if (url && url.includes("//duckduckgo.com/l/?uddg=")) {
              try {
                const urlParams = new URL(url, "https://duckduckgo.com");
                const actualUrl = decodeURIComponent(
                  urlParams.searchParams.get("uddg") || ""
                );
                if (actualUrl) url = actualUrl;
              } catch (e) {
                // Keep original if parsing fails
              }
            }
            if (title && url) webResults.push({ title, url });
          });
        }
        const list = webResults
          .map((r, i) => `${i + 1}. ${r.title} - ${r.url}`)
          .join("\n");
        webSearchSnippet = [
          abstract && `نتيجة مختصرة: ${abstract}`,
          webResults.length ? `روابط مفيدة:\n${list}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        console.log("Web search results found:", webResults.length);
        // If combined tool is enabled, fetch content from top search results (limit 2)
        if (fetchUrl && webResults.length) {
          const toFetch = webResults.slice(0, 2);
          for (const r of toFetch) {
            try {
              const pageResp = await fetch(r.url, { headers: { "User-Agent": "Mozilla/5.0" } });
              const ct = (pageResp.headers.get("content-type") || "").toLowerCase();
              if (ct.includes("text/html") || ct.startsWith("text/") || ct.includes("json") || ct.includes("xml")) {
                const raw = await pageResp.text();
                let text = raw;
                if (ct.includes("text/html")) {
                  const $ = cheerioLoad(raw);
                  $("script, style, noscript").remove();
                  text = $("body").text().replace(/\s+/g, " ").trim();
                }
                const capped = text.slice(0, 15000); // cap per page
                fetchedSearchPages.push({ title: r.title, url: r.url, text: capped });
                console.log("Fetched search page:", r.url, "len:", capped.length);
              }
            } catch (e) {
              console.warn("Fetch search result failed:", r.url, e.message);
            }
          }
        }
      } catch (e) {
        console.warn("Web search failed:", e.message);
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
    // Include all available context snippets together (web search, fetched URL text, fetched search pages, then PDF)
    if (webSearchSnippet) {
      userPrompt += `\n\n${webSearchSnippet}`;
    }
    if (fetchedPageText) {
      userPrompt += `\n\nنص من صفحة الويب المطلوبة:\n${fetchedPageText}`;
    }
    if (fetchedSearchPages.length) {
      const joined = fetchedSearchPages
        .map(p => `من ${p.title} - ${p.url}:\n${p.text}`)
        .join("\n\n");
      userPrompt += `\n\nنصوص من روابط البحث:\n${joined}`;
    }
    if (pdfText) {
      userPrompt += `\n\nهذا نص ملف PDF المرسل: ${pdfText}`;
    }
    // Build final user turn parts (text + optional image)
    const parts = [{ text: userPrompt }];
    if (image && image.data && image.mimeType) {
      parts.push({ inlineData: { mimeType: String(image.mimeType), data: String(image.data) } });
    }
    contents.push({ role: "user", parts });
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
      // Include all available context snippets together (web search, fetched URL text, then PDF)
    }

    if (!response.ok) {
      console.error("Model API error status:", response.status, response.statusText);
      console.error("Model API error body:", textBody);
      // Friendly Darija message without exposing provider/model
      const friendly = "صارت مشكلة تقنية مؤقتة في الخدمة. جرّب بعد شوية ولا قصّر شوية من الصورة/المحتوى. سامحني.";
      return res.json({ reply: friendly, softError: true });
    }

    console.log("Gemini API response:", JSON.stringify(data, null, 2));
  let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "ما نجمتش نكوّن ردّ مناسب تاو.";
    // Sanitize known misused phrases (light-touch). Can be expanded.
    try {
      reply = reply
        // remove standalone/misplaced "يا حسرة" occurrences
    .replace(/(^|\s)يا\s*حسرة[،,.!؟]*\s*/g, (m, p1) => (p1 ? " " : ""))
    // hide model/provider mentions
    .replace(/\bgemini\b/gi, "")
    .replace(/\bgoogle\b/gi, "")
        .trim();
    } catch (_) {}
    // Don't append sources at the end since they're already in the prompt/reply
    res.json({ reply });
  } catch (err) {
    console.error("/api/chat handler error:", err);
    res.status(500).json({ error: "API error", details: err.message });
  }
});

// Generate Academic PDF route
app.post("/api/export-pdf", async (req, res) => {
  try {
    const { userPrompt, aiText } = req.body || {};
    if (!aiText) {
      return res.status(400).json({ error: "نقص شوية معلومات لإنشاء ال-PDF." });
    }
    const md = new MarkdownIt({ html: true, linkify: true, breaks: false });
    let contentHtml = "";
    try {
      contentHtml = md.render(aiText);
    } catch (_) {
      contentHtml = `<pre>${aiText.replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</pre>`;
    }

    const safePrompt = userPrompt ? `<blockquote class="prompt">${String(userPrompt).replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}</blockquote>` : "";

    const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { margin: 28mm 20mm 28mm 20mm; }
    body { font-family: 'Noto Naskh Arabic', serif; color: #111; line-height: 1.7; font-size: 12.5pt; }
    header { text-align: center; margin-bottom: 8mm; }
    h1.title { font-size: 28pt; font-weight: 800; text-align: center; margin: 0 0 6mm; }
    .abstract { font-style: italic; color: #444; font-size: 11.5pt; margin: 0 0 10mm; text-align: justify; }
    h2, h3 { font-weight: 700; margin: 10mm 0 4mm; }
    h2 { font-size: 18pt; }
    h3 { font-size: 15pt; }
    p { text-align: justify; margin: 0 0 4mm; }
    ul, ol { margin: 0 0 4mm 0; padding-inline-start: 18pt; }
    li { margin: 2mm 0; }
    blockquote.prompt { border-right: 3px solid #ccc; padding: 4mm 6mm; color: #555; margin: 0 0 10mm; background: #fafafa; }
    footer { position: fixed; bottom: -10mm; left: 0; right: 0; text-align: center; font-size: 10pt; color: #777; }
    .page-number:before { content: counter(page); }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700;800&display=swap" rel="stylesheet">
  <title>Academic Export</title>
  <script>
    function tryPromoteTitle(){
      const firstH1 = document.querySelector('h1,h2');
      if (firstH1) { firstH1.classList.add('title'); }
      const ps = document.querySelectorAll('p');
      for (const p of ps) { if (p.textContent.trim().startsWith('Abstract') || p.textContent.trim().startsWith('ملخص')) { p.classList.add('abstract'); break; } }
    }
    document.addEventListener('DOMContentLoaded', tryPromoteTitle);
  </script>
  <style>
    @page { @bottom-center { content: counter(page); } }
  </style>
  </head>
<body>
  <header></header>
  ${safePrompt}
  ${contentHtml}
  <footer>صفحة <span class="page-number"></span></footer>
</body>
</html>`;

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="export.pdf"');
    return res.send(pdfBuffer);
  } catch (e) {
    console.error('PDF generation failed:', e);
    return res.status(500).json({ error: 'تعطلت خدمة إنشاء ال-PDF مؤقتاً. جرّب بعد شوية.' });
  }
});

app.listen(3001, () => console.log("Server running on port 3001"));
