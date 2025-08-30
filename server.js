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

// Replace non-Tunisian terms with Tunisian equivalents using safe Arabic word boundaries
function enforceTunisianLexicon(input) {
  if (!input || typeof input !== "string") return input;
  let text = input;
  const AR = "\\u0600-\\u06FF"; // Arabic block
  const boundary = {
    pre: new RegExp(`(^|[^${AR}])`),
    post: new RegExp(`(?=$|[^${AR}])`),
  };
  const apply = (fromList, to) => {
    for (const from of fromList) {
      const pattern = new RegExp(`(^|[^${AR}])(${from})(?=$|[^${AR}])`, "g");
      text = text.replace(pattern, (m, pre) => `${pre}${to}`);
    }
  };

  // Multi-word first (to avoid partial overlaps)
  apply(["لم\\s+يعد"], "معادش");
  apply(["نزّل", "أنزل"], "هبّط");
  apply(["ارتفع", "صعد"], "طلع");
  apply(["قبل\\s+قليل"], "توّاكة");
  apply(["غداً"], "من غدوة");

  // Single-word / short tokens
  apply(["ديال"], "متاع");
  apply(["كمان"], "زادة");
  apply(["شيء", "شيئ"], "حاجة");
  apply(["كامل"], "برشا");
  apply(["كثير"], "برشا");
  apply(["ما\\s*حدش", "ما\\s*فيش"], "ما فماش");
  // 'مين' -> 'شكون' is safe; avoid generic 'من' due to ambiguity (from vs who)
  apply(["مين"], "شكون");
  // Heuristic: replace question-start 'من' with 'شكون' if not followed by common prepositional phrases
  text = text.replace(
    /(^|[.!؟\?\n\r\t\s])من(\s+)(?!غدوة|بعد|فضلك|فضل|هنا|هناك|تم|قبل|ورا|فوق|تحت)/g,
    (m, pre, ws) => `${pre}شكون${ws}`
  );
  apply(["كفى"], "يزّي");
  apply(["يكفيك"], "يزيك");
  apply(["كم"], "قدّاش");
  apply(["لماذا"], "علاش");
  apply(["الآن"], "تاو");
  apply(["فعلاً"], "بالحقّ");
  apply(["جيّد"], "باهي");
  apply(["ليس", "مش"], "موش");
  apply(["أعطِ"], "عطي");
  apply(["لأنّ"], "خاطر");
  apply(["سكب"], "صبّ");
  apply(["قفز"], "فزّ");
  apply(["أمسك"], "شدّ");
  // Contextual replacement for 'ادفع':
  text = text.replace(/ادفع(\s+)([^.!؟\?\n\r\t\s]{0,12})/g, (m, ws, after) => {
    // If the next word/phrase is about money/payment, use 'خلّص', else 'دزّ'
    if (
      /فلوس|مال|مبلغ|فاتورة|حساب|ثمن|دفع|سعر|مصروف|شراء|بيع|قيمة|دين|قرض|رسوم|تسديد|بنك|بطاقة|صرف|دفع|أجرة|راتب|معاليم|مصاريف|دفع/i.test(
        after
      )
    ) {
      return `خلّص${ws}${after}`;
    } else {
      return `دزّ${ws}${after}`;
    }
  });
  // Standalone 'ادفع' (no context): default to 'دزّ'
  apply(["ادفع"], "دزّ");

  // Register additional phrase mappings (skip if already present)
  apply(["فيs+الوقتs+الحالي"], "تاو");
  apply(["بعدs+قليل"], "توّاكة");
  apply(["حتىs+الآن"], "تاو");
  apply(["فيs+المستقبل"], "كان حيانا ربي");
  apply(["لكي", "من أجل"], "خاطر");
  apply(["معs+ذلك"], "مع هذا");
  apply(["علىs+الأقل"], "على الأقل");
  apply(["كمs+مرة"], "قدّاش من مرة");
  apply(["جيد", "جيّد"], "باهِي");
  apply(["سيء"], "موش باهِي");
  apply(["سريع"], "فيسع");
  apply(["بطيء"], "بشوية");
  apply(["غداً"], "من غدوة");
  apply(["كم"], "قدّاش");
  apply(["كيف"], "كيفاش");
  apply(["كل"], "برشا");
  apply(["قليل"], "شوية");
  apply(["كثير"], "برشا");
  apply(["بزاف"], "برشا");
  apply(["يجب"], "لازم");
  apply(["لذلك"], "علاهذاكا");
  apply(["تعتمد "], "تعامل");
  apply(["لكن"], "أما");
  apply(["بيت"], "دار");
  apply(["طريق"], "ثنية");
  apply(["عمل"], "خدمة");
  apply(["أكل"], "ماكلة");
  apply(["ذهب"], "مشى");
  apply(["جاء"], "جا");
  apply(["أخذ"], "خذ");
  apply(["أعطى"], "عطا");
  apply(["يا ترى"], "زعما");
  apply(["حاظر"], "مريقل");
  apply(["حبة"], "كعبة");
  apply(["اذهب"], "برّا");
  apply(["عندمى"], "وقتلي");
  apply(["أضن"], "ضاهرلي");
  apply(["الملل"], "القلق");
  apply(["سيارة"], "كرهبة");
  apply(["بدون أن"], "منغير ما");

  return text;
}

// Style guide to steer Gemini to proper Tunisian Darija usage and Markdown formatting
const DARIJA_STYLE_GUIDE = `
قواعد الأسلوب الصارمة:
- جاوب دايمًا وبشكل حصري بالدارجة التونسية وبالحروف العربية (ما تكتبش باللاتيني/فرانكو).
- "جاوب ديما بالدارجة التونسية بكلماتها المتعارفة اليومية، وتجنّب كلمات مغربية، مصرية ولا فصحى. كان فما أكثر من كلمة، اختار التونسية."
- استثناء: إذا طلب المستخدم صراحةً لغة أخرى (مثلاً إنجليزية/فرنسية/فصحى) لهذه الرسالة، جاوب باللغة المطلوبة في نفس الرسالة.
- تجنّب الفصحى قدر الإمكان؛ خليك دارج تونسي واضح ومهذّب.
- ما تستعملش إنجليزي/فرنسي إلا إذا ما فماش بديل تونسي مفهوم، وبكميات قليلة.
- رتّب الإجابات بنقاط وقت يلزم، واستعمل عناوين فرعية وقت تفسّر مواضيع طويلة.
- استعمل تنسيق Markdown وين يلزم: عناوين (##)، نقاط (bullet points)، فواصل (breaks)، ومسافات واضحة بين الفقرات.
- استعمل أحيانًا كود بلوك ثلاثي (\`\`\` ... \`\`\`) وقت تفسّر أمثلة أو خطوات تقنية أو نصوص طويلة.
- كان ما فهمتش سؤال المستخدم، إسألو توضيح: "شنية تقصد بـ ...؟" بلا تعابير جارحة.
- ما تستعملش "يا حسرة" كان للنوستالجيا فقط.
- لو النص متوفّر من رابط/بحث، اعتمد عليه وتجنّب الاعتذارات من نوع "ما نجمش نفتح الروابط".
- ما تذكرش المنصّة ولا مزوّد الخدمة في الرد.

`;

app.post("/api/chat", async (req, res) => {
  const { message, history, pdfText, webSearch, image, pdfExport } =
    req.body || {};
  const { fetchUrl } = req.body || {};
  // Language request detection (explicit instructions override Darija)
  const detectRequestedLanguage = (msg) => {
    if (!msg || typeof msg !== "string") return null;
    const s = msg.toLowerCase();
    // English
    if (
      /\b(in english|answer in english|english only)\b/i.test(s) ||
      /\benglish\b/i.test(s) ||
      /\beng\b/i.test(s) ||
      /\banglais\b/i.test(s) ||
      /بالإنجليزي(ة)?|بالانجليزي(ة)?/.test(msg)
    )
      return "en";
    // French
    if (
      /\b(in french|en français|french only)\b/i.test(s) ||
      /\bfrançais\b/i.test(s) ||
      /بالفَرْنَسِيَّة|بالفرنسية/.test(msg)
    )
      return "fr";
    // MSA Arabic (Fusha)
    if (
      /\b(arabic|fusha|msa|modern standard arabic)\b/i.test(s) ||
      /بالفصحى|بالعربية\s*الفصحى/.test(msg)
    )
      return "ar";
    // Darija explicitly
    if (/بالدارجة|بلهج(ة)? تونسي(ة)?|tunisian darija/i.test(msg))
      return "darija";
    return null;
  };
  const requestedLang = detectRequestedLanguage(message);
  const darijaPreferred = !requestedLang || requestedLang === "darija";
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
              const pageResp = await fetch(r.url, {
                headers: { "User-Agent": "Mozilla/5.0" },
              });
              const ct = (
                pageResp.headers.get("content-type") || ""
              ).toLowerCase();
              if (
                ct.includes("text/html") ||
                ct.startsWith("text/") ||
                ct.includes("json") ||
                ct.includes("xml")
              ) {
                const raw = await pageResp.text();
                let text = raw;
                if (ct.includes("text/html")) {
                  const $ = cheerioLoad(raw);
                  $("script, style, noscript").remove();
                  text = $("body").text().replace(/\s+/g, " ").trim();
                }
                const capped = text.slice(0, 15000); // cap per page
                fetchedSearchPages.push({
                  title: r.title,
                  url: r.url,
                  text: capped,
                });
                console.log(
                  "Fetched search page:",
                  r.url,
                  "len:",
                  capped.length
                );
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
        .map((p) => `من ${p.title} - ${p.url}:\n${p.text}`)
        .join("\n\n");
      userPrompt += `\n\nنصوص من روابط البحث:\n${joined}`;
    }
    if (pdfText) {
      userPrompt += `\n\nهذا نص ملف PDF المرسل: ${pdfText}`;
    }
    // If a non-Darija language is explicitly requested, append a clear directive for this turn only
    if (requestedLang === "en") {
      userPrompt += `\n\nInstruction: Please answer strictly in English for this message.`;
    } else if (requestedLang === "fr") {
      userPrompt += `\n\nInstruction: Réponds strictement en français pour ce message.`;
    } else if (requestedLang === "ar") {
      userPrompt += `\n\nتعليمات: أجب بالعربية الفصحى فقط في هذه الرسالة.`;
    }
    // Build final user turn parts (text + optional image)
    const parts = [{ text: userPrompt }];
    if (image && image.data && image.mimeType) {
      parts.push({
        inlineData: {
          mimeType: String(image.mimeType),
          data: String(image.data),
        },
      });
    }
    contents.push({ role: "user", parts });
    // No need to add an extra instruction; covered by style guide

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          role: "system",
          parts: [{ text: DARIJA_STYLE_GUIDE }],
        },
        contents,
      }),
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
      console.error(
        "Model API error status:",
        response.status,
        response.statusText
      );
      console.error("Model API error body:", textBody);
      // Friendly Darija message without exposing provider/model
      const friendly =
        "صارت مشكلة تقنية مؤقتة في الخدمة. جرّب بعد شوية ولا قصّر شوية من الصورة/المحتوى. سامحني.";
      return res.json({ reply: friendly, softError: true });
    }

    console.log("Gemini API response:", JSON.stringify(data, null, 2));
    let reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "ما نجمتش نكوّن ردّ مناسب تاو.";
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
    // Guard-rail: if the reply drifts to non-Darija (Latin-heavy or obvious EN/FR), rewrite once into Tunisian Darija (Arabic script)
    const latinCount = (reply.match(/[A-Za-z]/g) || []).length;
    const arabicCount = (reply.match(/[\u0600-\u06FF]/g) || []).length;
    const enFrHint =
      /(\bthe\b|\band\b|\bis\b|\bwith\b|\bfor\b|\bto\b|\ble\b|\bla\b|\bles\b|\bun\b|\bune\b|\bdes\b|\bavec\b|\bpour\b)/i.test(
        reply
      );
    const needsRewrite =
      darijaPreferred &&
      (latinCount > arabicCount * 0.3 ||
        (arabicCount < 30 && latinCount > 50) ||
        enFrHint);
    if (needsRewrite && GEMINI_API_KEY) {
      try {
        const rewriteInstr = `
${DARIJA_STYLE_GUIDE}
حوّل النص التالي إلى دارجة تونسية واضحة وبالحروف العربية فقط (مش لاتيني)، بلا فصحى وبلا إنجليزي/فرنسي إلا للضرورة القصوى. حافظ على نفس المعنى والمحتوى.`;
        const rewriteResp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              role: "system",
              parts: [{ text: DARIJA_STYLE_GUIDE }],
            },
            contents: [
              { role: "user", parts: [{ text: rewriteInstr }] },
              { role: "user", parts: [{ text: reply.slice(0, 16000) }] },
            ],
            generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
          }),
        });
        const rewriteBody = await rewriteResp.text();
        if (rewriteResp.ok) {
          let rdata;
          try {
            rdata = JSON.parse(rewriteBody);
          } catch {
            rdata = { raw: rewriteBody };
          }
          let out = rdata?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (out) {
            reply = out
              .replace(/\bgemini\b/gi, "")
              .replace(/\bgoogle\b/gi, "")
              .trim();
          }
        } else {
          console.warn("Rewrite step failed:", rewriteResp.status, rewriteBody);
        }
      } catch (e) {
        console.warn("Darija rewrite error:", e.message);
      }
    }
    // Enforce Tunisian lexicon replacements only when Darija is preferred
    if (darijaPreferred) {
      reply = enforceTunisianLexicon(reply);
    }

    // Handle PDF export case: format the content and provide metadata for client-side download
    if (pdfExport) {
      // Format the reply for PDF display with Markdown
      const pdfContent = `# الردّ من الـ AI

${reply}

---
*تم التوليد في: ${new Date().toLocaleString("ar-TN")}*
`;

      return res.json({
        reply: `هاذو المعلومات اللي باش تكون في الـ PDF:

${pdfContent}`,
        isPdfExport: true,
        pdfContent: pdfContent,
      });
    }

    // Don't append sources at the end since they're already in the prompt/reply
    res.json({ reply });
  } catch (err) {
    console.error("/api/chat handler error:", err);
    res.status(500).json({ error: "API error", details: err.message });
  }
});

// PDF Preview endpoint - shows what will be in the PDF
app.post("/export-pdf", async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "نقص شوية معلومات لإنشاء ال-PDF." });
    }

    // Extract AI responses from messages
    const aiMessages = messages.filter(
      (msg) => msg.sender === "ai" && !msg.isWelcomeMessage
    );
    if (aiMessages.length === 0) {
      return res.status(400).json({ error: "ما فماش رسائل AI للتصدير." });
    }

    // Combine all AI content
    let combinedContent = aiMessages.map((msg) => msg.text).join("\n\n");

    // Transform the content to academic format using Gemini
    let refinedContent = combinedContent;
    try {
      if (!GEMINI_API_KEY) {
        console.warn(
          "Missing GEMINI_API_KEY; showing original text without refinement."
        );
      } else {
        const REFINE_INSTRUCTION = `
${DARIJA_STYLE_GUIDE}

حول المحتوى التالي إلى تقرير علمي أكاديمي طويل ومُنظّم بلهجة تونسية واضحة ورصينة:
`;
        const contents = [
          { role: "user", parts: [{ text: REFINE_INSTRUCTION }] },
          {
            role: "user",
            parts: [
              {
                text: `المحتوى المراد تحويله للصيغة الأكاديمية:\n${String(
                  combinedContent
                ).slice(0, 12000)}`,
              },
            ],
          },
          {
            role: "user",
            parts: [{ text: "رجّع النص الأكاديمي المفصل بنسق Markdown فقط." }],
          },
        ];

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            },
          }),
        });

        const textBody = await response.text();
        if (!response.ok) {
          console.error(
            "Refine API error:",
            response.status,
            response.statusText
          );
          console.error(textBody);
        } else {
          let data;
          try {
            data = JSON.parse(textBody);
          } catch {
            data = { raw: textBody };
          }
          let out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (out) {
            // Light sanitize
            out = out
              .replace(/```[a-z]*\n|```/g, "")
              .replace(/\bgemini\b/gi, "")
              .replace(/\bgoogle\b/gi, "")
              .trim();
            refinedContent = out;
          }
        }
      }
    } catch (e) {
      console.warn(
        "Refinement step failed, falling back to original text:",
        e.message
      );
    }

    // Create the preview message with the actual refined content
    const previewContent = `هاذا هو المحتوى إلي باش يتكتب في ملف الـ PDF:

---

${refinedContent}`;

    return res.json({
      success: true,
      previewContent: previewContent,
    });
  } catch (e) {
    console.error("PDF preview generation failed:", e);
    return res.status(500).json({
      error: "صارت مشكلة في تجهيز المعاينة للـ PDF. جرّب بعد شوية.",
    });
  }
});

// PDF Download endpoint - actually generates the PDF
app.post("/download-pdf", async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "نقص شوية معلومات لإنشاء ال-PDF." });
    }

    // Extract AI responses from messages (excluding welcome message)
    const aiMessages = messages.filter(
      (msg) => msg.sender === "ai" && !msg.isWelcomeMessage
    );
    if (aiMessages.length === 0) {
      return res.status(400).json({ error: "ما فماش رسائل AI للتصدير." });
    }

    // Combine all AI content
    let combinedContent = aiMessages.map((msg) => msg.text).join("\n\n");

    // Attempt to refine the content using the model (Darija academic long-form, markdown output)
    let refined = combinedContent;
    try {
      if (!GEMINI_API_KEY) {
        console.warn(
          "Missing GEMINI_API_KEY; exporting existing text without refinement."
        );
      } else {
        const REFINE_INSTRUCTION = `
${DARIJA_STYLE_GUIDE}

حول المحتوى التالي إلى تقرير علمي أكاديمي طويل ومُنظّم بلهجة تونسية واضحة ورصينة:
- استعمل عناوين رئيسية وثانوية (##، ###) مع هيكلة واضحة: مقدمة، خلفية/نظريات، منهجية/خطوات، تحليل/نقاش، أمثلة تطبيقية، حدود العمل، وخلاصة.
- كثّر التفاصيل والأمثلة والشرح، واستعمل قوائم نقطية أين يلزم.
- لو فما مفاهيم أساسية، عرّفها بطريقة دقيقة وبسيطة.
- ما تركّبش حقائق غير صحيحة. كان المعلومة مش مؤكدة، قول "حسب المعارف العامة".
- خرّج النتيجة بنص Markdown فقط، بلا كود fences وبلا ذكر المنصّة ولا المزوّد.
- خدم باللغة: الدارجة التونسية، وبأسلوب أكاديمي مهذّب.
`;
        const contents = [
          { role: "user", parts: [{ text: REFINE_INSTRUCTION }] },
          {
            role: "user",
            parts: [
              {
                text: `المحتوى المراد تحويله للصيغة الأكاديمية:\n${String(
                  combinedContent
                ).slice(0, 12000)}`,
              },
            ],
          },
          {
            role: "user",
            parts: [{ text: "رجّع النص الأكاديمي المفصل بنسق Markdown فقط." }],
          },
        ];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            },
          }),
        });

        const textBody = await response.text();
        if (!response.ok) {
          console.error(
            "Refine API error:",
            response.status,
            response.statusText
          );
          console.error(textBody);
        } else {
          let data;
          try {
            data = JSON.parse(textBody);
          } catch {
            data = { raw: textBody };
          }
          let out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (out) {
            // Light sanitize
            out = out
              .replace(/```[a-z]*\n|```/g, "")
              .replace(/\bgemini\b/gi, "")
              .replace(/\bgoogle\b/gi, "")
              .trim();
            refined = out;
          }
        }
      }
    } catch (e) {
      console.warn(
        "Refinement step failed, falling back to original text:",
        e.message
      );
    }

    // Enforce Tunisian lexicon before rendering
    refined = enforceTunisianLexicon(refined);
    const md = new MarkdownIt({ html: true, linkify: true, breaks: false });
    let contentHtml = "";
    try {
      contentHtml = md.render(refined);
    } catch (_) {
      contentHtml = `<pre>${refined.replace(
        /[&<>]/g,
        (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[s])
      )}</pre>`;
    }

    // --- Force web search + URL fetch to gather sources, then extract citations ---
    const urlRegexGlobal = /https?:\/\/[^\s)]+/gi;
    const urlsFromText = refined.match(urlRegexGlobal) || [];
    const urlsFromMsgs = aiMessages
      .flatMap((m) => String(m.text || "").match(urlRegexGlobal) || [])
      .filter(Boolean);

    // Build a search query from the latest user message or fallback to refined heading
    const userMsgs = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && m.sender === "user" && m.text)
      .map((m) => String(m.text));
    let searchQuery = userMsgs.length
      ? userMsgs[userMsgs.length - 1]
      : (refined.split(/\n/).find((l) => /^#{1,2}\s/.test(l)) || refined.slice(0, 200));
    searchQuery = String(searchQuery)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#*_`>]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

    // Perform DuckDuckGo search (JSON first, then HTML fallback) to get external URLs
    let webResults = [];
    try {
      if (searchQuery) {
        const q = encodeURIComponent(searchQuery);
        const ddgUrl = `https://api.duckduckgo.com/?q=${q}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
        try {
          const ddgResp = await fetch(ddgUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          const ddgJson = await ddgResp.json();
          const firstURL =
            ddgJson?.AbstractURL ||
            (Array.isArray(ddgJson?.Results) && ddgJson.Results[0]?.FirstURL) ||
            "";
          if (firstURL) webResults.push({ title: ddgJson?.Heading || "Result", url: firstURL });
          if (Array.isArray(ddgJson?.RelatedTopics)) {
            for (const t of ddgJson.RelatedTopics) {
              const title = t?.Text || (Array.isArray(t?.Topics) ? t.Topics[0]?.Text : "");
              const url =
                t?.FirstURL || (Array.isArray(t?.Topics) ? t.Topics[0]?.FirstURL : "");
              if (title && url) webResults.push({ title, url });
              if (webResults.length >= 3) break;
            }
          }
        } catch (_) {}
        // HTML fallback if needed
        if (webResults.length < 3) {
          try {
            const ddgHtmlUrl = `https://html.duckduckgo.com/html/?q=${q}`;
            const htmlResp = await fetch(ddgHtmlUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
            const html = await htmlResp.text();
            const $ = cheerioLoad(html);
            $("a.result__a").each((_, el) => {
              if (webResults.length >= 3) return false;
              const title = $(el).text().trim();
              let url = $(el).attr("href");
              if (url && url.includes("//duckduckgo.com/l/?uddg=")) {
                try {
                  const urlParams = new URL(url, "https://duckduckgo.com");
                  const actualUrl = decodeURIComponent(urlParams.searchParams.get("uddg") || "");
                  if (actualUrl) url = actualUrl;
                } catch (_) {}
              }
              if (title && url) webResults.push({ title, url });
            });
          } catch (_) {}
        }
      }
    } catch (_) {
      // Ignore web search errors; we'll continue with any URLs found in text
    }

    const webUrls = webResults
      .map((r) => r && r.url)
      .filter(Boolean)
      .filter((u) =>
        /^https?:\/\//i.test(u) && !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(u)
      );

    const allUrls = Array.from(new Set([...urlsFromText, ...urlsFromMsgs, ...webUrls]))
      .filter((u) => /^https?:\/\//i.test(u))
      .slice(0, 6);

    const accessedStr = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "2-digit",
    });

    const formatDate = (iso) => {
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "2-digit" });
      } catch (_) {
        return null;
      }
    };

    const fetchMetaForUrl = async (u) => {
      const info = { url: u, title: "", site: "", published: null };
      try {
        const resp = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
        const ct = (resp.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("text/html")) return info;
        const html = await resp.text();
        const $ = cheerioLoad(html);
        const getMeta = (sel, attr = "content") => $(sel).attr(attr) || "";
        info.title =
          getMeta('meta[property="og:title"]') ||
          getMeta('meta[name="twitter:title"]') ||
          $("title").first().text().trim() || "";
        info.site =
          getMeta('meta[property="og:site_name"]') ||
          getMeta('meta[name="application-name"]') ||
          new URL(u).hostname.replace(/^www\./, "");
        const pub =
          getMeta('meta[property="article:published_time"]') ||
          getMeta('meta[name="article:published_time"]') ||
          getMeta('meta[name="datePublished"]') ||
          getMeta('meta[itemprop="datePublished"]') ||
          $("time[datetime]").attr("datetime") ||
          "";
        const formatted = formatDate(pub);
        if (formatted) info.published = formatted;
        // Try JSON-LD datePublished
        if (!info.published) {
          $('script[type="application/ld+json"]').each((_, el) => {
            try {
              const txt = $(el).text();
              const j = JSON.parse(txt);
              const date = Array.isArray(j)
                ? (j.find((x) => x && x.datePublished)?.datePublished || null)
                : j?.datePublished || null;
              const fmt = date && formatDate(date);
              if (fmt) {
                info.published = fmt;
                return false;
              }
            } catch (_) {}
          });
        }
      } catch (_) {
        // network or parse error: keep defaults
      }
      return info;
    };

    const metaList = [];
    for (const u of allUrls) {
      // Sequential to avoid too many concurrent requests; still fast with slice(0,6)
      // eslint-disable-next-line no-await-in-loop
      const meta = await fetchMetaForUrl(u);
      metaList.push(meta);
    }

    let referencesHtml = "";
    if (metaList.length > 0) {
      const lis = metaList
        .map((m, i) => {
          const n = i + 1;
          const site = m.site || new URL(m.url).hostname.replace(/^www\./, "");
          const title = m.title || site;
          const pub = m.published ? `Published: ${m.published}. ` : "";
          return (
            `<li style='margin:4pt 0; list-style:none; direction:ltr; text-align:left; word-break:break-word;'>` +
            `[${n}] ${site}. ${title}. ${pub}Accessed: ${accessedStr}. URL: ${m.url}` +
            `</li>`
          );
        })
        .join("");
      referencesHtml = `<h2 style='margin-top:18mm'>المراجع</h2><ul style='padding-left:0; font-size:12.5pt;'>${lis}</ul>`;
    } else {
      referencesHtml = `<h2 style='margin-top:18mm'>المراجع</h2><p style='font-size:12pt;color:#888'>لا توجد مراجع مستعملة في هذا التقرير.</p>`;
    }

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
  ${contentHtml}
  ${referencesHtml}
  <footer>صفحة <span class="page-number"></span></footer>
</body>
</html>`;

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="chat-export.pdf"'
    );
    return res.send(pdfBuffer);
  } catch (e) {
    console.error("PDF generation failed:", e);
    return res
      .status(500)
      .json({ error: "تعطلت خدمة إنشاء ال-PDF مؤقتاً. جرّب بعد شوية." });
  }
});

app.listen(3001, () => console.log("Server running on port 3001"));
