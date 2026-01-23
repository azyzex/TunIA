const STYLE_GUIDE = `
قواعد الأسلوب:
- جاوب دايمًا وبالدارجة التونسية وبالحروف العربية.
- تجنّب الفصحى قدر الإمكان، وما تكتبش باللاتيني/فرانكو.
- استعمل Markdown وقت يلزم (عناوين، نقاط، كود بلوك).
- كان ما فهمتش السؤال، إسأل توضيح: "شنية تقصد بـ ...؟".
- ما تذكرش المزوّد/المنصّة في الرد.
`;

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return new Response(resp.body, { status: resp.status, headers });
}

function extractJsonArray(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  return JSON.parse(slice);
}

function safeTextFromHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function needsWebSearch(msg) {
  if (!msg || typeof msg !== "string") return false;
  const text = msg.trim();
  if (text.length < 10) return false;
  const hasQuestionWord =
    /(\?|شنوة|علاش|كيفاش|وين|وقتاش|قداش|شكون|what|when|where|why|how|who|اش هو|اش هي|شنية)/i.test(
      text,
    );
  const needsCurrentInfo =
    /(تاو|اليوم|today|current|latest|آخر|الآن|هذا الأسبوع|this week|recent)/i.test(
      text,
    );
  const needsExternalInfo =
    /(أخبار|news|weather|طقس|event|حدث|price|سعر|stock|update|تحديث)/i.test(text);
  return hasQuestionWord || needsCurrentInfo || needsExternalInfo;
}

function findFirstUrl(text) {
  if (!text) return null;
  const m = String(text).match(/https?:\/\/\S+/i);
  return m?.[0] || null;
}

async function callGemini({ apiKey, model, contents, temperature = 0.7, maxOutputTokens = 2048 }) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature, maxOutputTokens },
    }),
  });

  const raw = await resp.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }

  if (!resp.ok) {
    const message = data?.error?.message || raw || `Gemini error (${resp.status})`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return { text: typeof text === "string" ? text : "", raw: data };
}

function fallbackQuiz({ subject, qCount, aCount }) {
  const clean = String(subject || "").trim().slice(0, 200);
  return Array.from({ length: qCount }, (_, i) => ({
    type: "mcq",
    question: `سؤال ${i + 1}: شنوة الغرض من "${clean}"؟`,
    options: [
      "غرض تعليمي ومهم",
      "غرض غير واضح",
      "ما لهوش غرض محدد",
      "غرض تجريبي",
    ].slice(0, aCount),
    correctIndex: 0,
    explanation: "الإجابة الأولى صحيحة خاطر الموضوع تعليمي وعندو غرض واضح.",
  }));
}

export async function onRequestOptions() {
  return withCors(new Response(null, { status: 204 }));
}

export async function onRequestPost({ request, env }) {
  try {
    const apiKey = env.GEMINI_API_KEY;
    const model = env.GEMINI_MODEL || "gemini-2.5-flash";

    if (!apiKey) {
      return withCors(jsonResponse({ error: "Missing GEMINI_API_KEY" }, 500));
    }

    const body = await request.json().catch(() => ({}));
    const {
      message,
      history,
      pdfText,
      webSearch,
      fetchUrl,
      image,
      pdfExport,
      quizMode,
      quizQuestions,
      quizOptions,
      quizDifficulties,
      quizTypes,
      quizTimer,
      quizHints,
      quizImmediateFeedback,
    } = body || {};

    const userMessage = typeof message === "string" ? message : "";

    if (quizMode && userMessage.trim()) {
      const subject = userMessage.trim().slice(0, 400);
      const qCount = Math.max(2, Math.min(40, parseInt(quizQuestions || 5, 10)));
      const aCount = Math.max(2, Math.min(5, parseInt(quizOptions || 4, 10)));
      const difficulties = Array.isArray(quizDifficulties) && quizDifficulties.length ? quizDifficulties : ["medium"];
      const types = Array.isArray(quizTypes) && quizTypes.length ? quizTypes : ["mcq"];

      let context = "";
      if (pdfText && typeof pdfText === "string" && pdfText.trim()) {
        context += `\n\nالمحتوى من الملف المرفوع (مختصر):\n${pdfText.replace(/\s+/g, " ").trim().slice(0, 8000)}`;
      }

      const quizPrompt = `
${STYLE_GUIDE}

المطلوب: كوّن اختبار قصير على الموضوع التالي: "${subject}".
- عدد الأسئلة: ${qCount}
- عدد الاختيارات لكل سؤال: ${aCount}
- الصعوبة: ${difficulties.join(", ")}
- الأنواع: ${types.join(", ")}
- مؤقّت (بالدقائق): ${quizTimer ?? "بدون"}
- تلميحات: ${quizHints ? "نعم" : "لا"}
- تصحيح فوري: ${quizImmediateFeedback ? "نعم" : "لا"}

القواعد:
- رجّع JSON فقط (بدون أي كلام زايد وبدون Markdown).
- الصيغة: Array من objects.
- كل object لازم يحتوي: type, question, options (array), correctIndex, explanation.
- type يكون "mcq".

${context}
`;

      const contents = [{ role: "user", parts: [{ text: quizPrompt }] }];
      const result = await callGemini({ apiKey, model, contents, temperature: 0.5, maxOutputTokens: 2048 });

      let quiz = null;
      try {
        quiz = extractJsonArray(result.text);
      } catch {
        quiz = null;
      }

      if (!Array.isArray(quiz) || quiz.length === 0) {
        quiz = fallbackQuiz({ subject, qCount, aCount });
      }

      return withCors(jsonResponse({ isQuiz: true, quiz }));
    }

    // Optional URL fetch (if a URL is present in message or history)
    let fetchedPageText = "";
    const urlFromMsg = findFirstUrl(userMessage);
    let urlFromHistory = null;
    if (!urlFromMsg && Array.isArray(history)) {
      for (let i = history.length - 1; i >= 0; i--) {
        const t = history?.[i]?.text;
        const u = findFirstUrl(t);
        if (u) {
          urlFromHistory = u;
          break;
        }
      }
    }
    const candidateUrl = urlFromMsg || urlFromHistory;

    if (fetchUrl && candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
      try {
        const pageResp = await fetch(candidateUrl, { headers: { "user-agent": "Mozilla/5.0" } });
        const ct = (pageResp.headers.get("content-type") || "").toLowerCase();
        const raw = await pageResp.text();
        const text = ct.includes("text/html") ? safeTextFromHtml(raw) : raw;
        fetchedPageText = String(text).slice(0, 50000);
      } catch {
        fetchedPageText = "";
      }
    }

    // Optional DuckDuckGo snippet
    let webSnippet = "";
    if (webSearch && needsWebSearch(userMessage)) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const q = encodeURIComponent(`[${today}] ` + userMessage.slice(0, 200));
        const ddgUrl = `https://api.duckduckgo.com/?q=${q}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
        const ddgResp = await fetch(ddgUrl, { headers: { "user-agent": "Mozilla/5.0" } });
        const ddgJson = await ddgResp.json().catch(() => null);
        const abstract = ddgJson?.AbstractText || ddgJson?.Abstract || "";
        if (abstract) {
          webSnippet = `\n\nمعلومة من بحث سريع (مقتطف):\n${String(abstract).slice(0, 1200)}`;
        }
      } catch {
        webSnippet = "";
      }
    }

    const contextParts = [];
    if (pdfText && typeof pdfText === "string" && pdfText.trim()) {
      contextParts.push(`المحتوى من PDF (مختصر):\n${pdfText.replace(/\s+/g, " ").trim().slice(0, 8000)}`);
    }
    if (fetchedPageText) {
      contextParts.push(`نص من رابط (مختصر):\n${fetchedPageText.slice(0, 8000)}`);
    }
    if (webSnippet) {
      contextParts.push(webSnippet.trim());
    }

    const systemLike = `${STYLE_GUIDE}${contextParts.length ? `\n\nسياق إضافي للاستعانة:\n${contextParts.join("\n\n---\n\n")}` : ""}`;

    const contents = [];
    contents.push({ role: "user", parts: [{ text: systemLike }] });

    if (Array.isArray(history)) {
      for (const h of history.slice(-30)) {
        const txt = typeof h?.text === "string" ? h.text : "";
        if (!txt) continue;
        const role = h?.sender === "ai" ? "model" : "user";
        contents.push({ role, parts: [{ text: txt.slice(0, 4000) }] });
      }
    }

    const lastUserParts = [{ text: userMessage }];
    if (image?.data && image?.mimeType) {
      lastUserParts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
    }

    contents.push({ role: "user", parts: lastUserParts });

    const result = await callGemini({ apiKey, model, contents, temperature: 0.7, maxOutputTokens: 2048 });
    let reply = (result.text || "").trim();

    if (!reply) {
      reply = "صارّت مشكلة مؤقتة في الخدمة، جرّب بعد شوية.";
    }

    if (pdfExport) {
      const pdfContent = `# الردّ من الـ AI\n\n${reply}\n\n---\n*تم التوليد في: ${new Date().toLocaleString("ar-TN")}*\n`;
      return withCors(
        jsonResponse({
          reply: `هاذو المعلومات اللي باش تكون في الـ PDF:\n\n${pdfContent}`,
          isPdfExport: true,
          pdfContent,
        }),
      );
    }

    return withCors(jsonResponse({ reply }));
  } catch (err) {
    return withCors(jsonResponse({ error: "API error", details: err?.message || String(err) }, 500));
  }
}
