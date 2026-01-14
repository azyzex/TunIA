import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { load as cheerioLoad } from "cheerio";
import dotenv from "dotenv";
import MarkdownIt from "markdown-it";
import puppeteer from "puppeteer";
dotenv.config({ path: ".env.local" });

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
  apply(["واش"], "شنوة");

  // Idiom fix: replace the incorrect comparative pattern
  // "برشا ما X، برشا ما Y" -> "كل ما X، كل ما Y"
  // Keep it contextual to avoid changing valid uses of "برشا" elsewhere
  text = text.replace(
    /(\b|^|[\s.!؟\?،,:;\-\(\[])برشا\s*ما\s*([^،\n\r]+?)\s*(،|,)\s*برشا\s*ما\s*([^\.\!\?\n\r]+?)(?=($|[\.\!\?،,:;\)\]\n\r]))/g,
    (m, pre, part1, sep, part2, endDelim) => {
      const lhs = part1.trim();
      const rhs = part2.trim();
      return `${pre}كل ما ${lhs}، كل ما ${rhs}`;
    }
  );
  // Within this idiom only, prefer "نجم نجاوبك" over "نقدر نجيبك" for clarity
  text = text.replace(
    /(كل\s*ما\s*[^،\n\r]+،\s*كل\s*ما\s*)(اٍنجم\s+نجاوبك)(\s+بشكل\s+أفضل)/gi,
    (m, prefix, _v, suffix) => `${prefix}نجم نجاوبك${suffix}`
  );

  return text;
}

// Utility: lightweight detection of weather/temperature-like questions
function isWeatherLike(msg) {
  if (!msg) return false;
  const s = String(msg);
  return (
    /\b(temp|temperature|weather|meteo)\b/i.test(s) ||
    /طقس|حرارة|درجة\s*الحرارة|سخانة/.test(s)
  );
}

// Utility: detect if a location is mentioned; basic heuristics for Tunisian cities + generic patterns
function hasLocationMention(msg) {
  if (!msg) return false;
  const s = String(msg);
  // Common Tunisian place names (cities/governorates) + country
  const places =
    /(تونس|تونس\s*العاصمة|Tunis|Tunisia|Sfax|صفاقس|Sousse|سوسة|Gabes|قابس|Bizerte|بنزرت|Nabeul|نابل|Ariana|أريانة|Ben\s*Arous|بن\s*عروس|Manouba|منوبة|Kairouan|القيروان|Kasserine|القصرين|Gafsa|قفصة|Tozeur|توزر|Kebili|قبلي|Medenine|مدنين|Tataouine|تطاوين|Siliana|سليانة|Zaghouan|زغوان|Mahdia|المهدية|Monastir|المنستير|Beja|باجة|Jendouba|جندوبة|Kef|الكاف)/i;
  if (places.test(s)) return true;
  // Generic prepositions indicating a place, e.g., "في سوسة", "in Tunis"
  if (
    /(\b(in|at|near)\b\s+\p{L}+)|(في\s+[\p{L}\-]+)|(بـ\s*[\p{L}\-]+)/iu.test(s)
  )
    return true;
  return false;
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
- لو النص متوفّر من رابط/بحث، اعتمد عليه وتجنّب الاعتذارات من نوع "ما نجمش نفتح الروابط"، وما تقولش "الروابط اللي عطيتني"؛ قول بدلها "الروابط اللي عندي" ولا "الروابط اللي لقيتها".
- ما تذكرش المنصّة ولا مزوّد الخدمة في الرد.

هوية وافتراضات تونسية:
- انت مساعد أكاديمي تونسي موجّه للتوانسة. كي يسألك المستخدم "شكونك/من تكون" قول إنك مساعد ذكي لتونس وتركّز على خدمة الطالب التونسي.
- الافتراضات الافتراضية: إذا السؤال يتعلّق بالطقس/درجة الحرارة/الوقت/أحداث محلية وما حدّدش المكان، إفترض الدولة: تونس، والمدينة/الولاية: تونس (العاصمة).
- اعتمد التوقيت Africa/Tunis، والوحدات المترية (درجة مئوية، كم، كغ). في الفلوس إفترض الدينار التونسي (TND) إلا إذا المستخدم حدّد غيره.

`;

app.post("/api/chat", async (req, res) => {
  const {
    message,
    history,
    pdfText,
    webSearch,
    image,
    pdfExport,
    quizMode,
    quizQuestions,
    quizOptions,
    quizDifficulties,
    quizTypes,
    quizTimer,
    quizHints,
  } = req.body || {};
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
        quizMode: Boolean(quizMode),
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
    // Quiz generation mode: return a structured quiz instead of a normal reply
    if (quizMode && typeof message === "string" && message.trim().length) {
      console.log("🎯 Quiz mode detected!");
      console.log(
        "📄 PDF Text received:",
        pdfText ? `${pdfText.substring(0, 100)}...` : "NO PDF TEXT"
      );
      console.log("📝 Subject:", message);

      const subject = message.trim().slice(0, 400);
      const qCount = Math.max(
        2,
        Math.min(40, parseInt(quizQuestions || 5, 10))
      );
      const aCount = Math.max(2, Math.min(5, parseInt(quizOptions || 4, 10)));
      // Try to gather web context (force like PDF)
      let contextSnippets = [];

      // If PDF text is provided, use it as primary context
      if (pdfText && typeof pdfText === "string" && pdfText.trim()) {
        // Clean and truncate PDF text for quiz context
        const cleanPdfText = pdfText.replace(/\s+/g, " ").trim().slice(0, 8000); // Use first 8000 chars of PDF

        contextSnippets.push(`المحتوى من الملف المرفوع:\n${cleanPdfText}`);
        console.log(
          "Using PDF text for quiz generation, length:",
          cleanPdfText.length
        );
      } else {
        // Fallback to web search if no PDF provided
        try {
          const q = encodeURIComponent(subject.slice(0, 200));
          const ddgUrl = `https://api.duckduckgo.com/?q=${q}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
          const ddgResp = await fetch(ddgUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          const ddgJson = await ddgResp.json();
          const firstURL =
            ddgJson?.AbstractURL ||
            (Array.isArray(ddgJson?.Results) && ddgJson.Results[0]?.FirstURL) ||
            "";
          const urls = [];
          if (firstURL) urls.push(firstURL);
          if (Array.isArray(ddgJson?.RelatedTopics)) {
            for (const t of ddgJson.RelatedTopics) {
              const url =
                t?.FirstURL ||
                (Array.isArray(t?.Topics) ? t.Topics[0]?.FirstURL : "");
              if (url) urls.push(url);
              if (urls.length >= 3) break;
            }
          }
          // Fallback to HTML results if needed
          if (urls.length < 3) {
            const ddgHtmlUrl = `https://html.duckduckgo.com/html/?q=${q}`;
            const htmlResp = await fetch(ddgHtmlUrl, {
              headers: { "User-Agent": "Mozilla/5.0" },
            });
            const html = await htmlResp.text();
            const $ = cheerioLoad(html);
            $("a.result__a").each((_, el) => {
              if (urls.length >= 3) return false;
              let url = $(el).attr("href");
              if (url && url.includes("//duckduckgo.com/l/?uddg=")) {
                try {
                  const urlParams = new URL(url, "https://duckduckgo.com");
                  const actualUrl = decodeURIComponent(
                    urlParams.searchParams.get("uddg") || ""
                  );
                  if (actualUrl) url = actualUrl;
                } catch (_) {
                  // ignore URL decode errors
                }
              }
              if (url) urls.push(url);
            });
          }
          // Fetch text from top URLs
          for (const u of urls.slice(0, 2)) {
            try {
              const resp = await fetch(u, {
                headers: { "User-Agent": "Mozilla/5.0" },
              });
              const ct = (resp.headers.get("content-type") || "").toLowerCase();
              const raw = await resp.text();
              let text = raw;
              if (ct.includes("text/html")) {
                const $ = cheerioLoad(raw);
                $("script, style, noscript").remove();
                text = $("body").text().replace(/\s+/g, " ").trim();
              }
              if (text) contextSnippets.push(text.slice(0, 7000));
            } catch (_) {
              // ignore per-URL fetch errors in quiz context
            }
          }
        } catch (_) {
          // ignore web context aggregation errors for quiz
        }
      }

      const selectedTypes =
        Array.isArray(quizTypes) && quizTypes.length > 0 ? quizTypes : ["mcq"];
      const QUIZ_INSTR = `
${DARIJA_STYLE_GUIDE}

بدون أي شرح إضافي، رجّع JSON نقي فقط (Array) فيه ${qCount} أسئلة **تعليمية وحقائقية** حول الموضوع التالي.

**قواعد مهمة جداً للأسئلة**:
1. لازم تكون الأسئلة **حقائقية** (factual) وليس آراء شخصية
2. لازم يكون في إجابة واحدة صحيحة واضحة أو إجابات محددة
3. ما تسألش على الآراء مثل "شنوة رايك في..." أو "كيف تشوف..."
4. اسأل على **معلومات ومفاهيم وحقائق** متعلقة بالموضوع
5. استعمل أسئلة تبدأ بـ: "شنوة..."، "كيفاش..."، "وين..."، "قدّاش..."، "علاش..."
6. لا تكرر نفس السؤال أبداً - كل سؤال لازم يكون مختلف تماماً

**أنواع الأسئلة المسموحة فقط**: ${selectedTypes
        .map((t) => {
          if (t === "mcq") return '"mcq" (اختيار واحد)';
          if (t === "mcma") return '"mcma" (اختيارات متعددة)';
          if (t === "tf") return '"tf" (صح/غلط)';
          if (t === "fitb") return '"fitb" (فراغ)';
          return `"${t}"`;
        })
        .join("، ")}

لا تستعمل أي نوع آخر من الأسئلة غير الموجود في القائمة أعلاه.

${
  selectedTypes.length > 1
    ? `وزع الأسئلة على الأنواع المختارة بطريقة متوازنة. مثلاً: إذا كان عندك ${qCount} أسئلة و${selectedTypes.length} أنواع، وزع الأسئلة بطريقة متوازنة.`
    : ""
}

**أمثلة لأسئلة صحيحة**:
- "شنوة الغرض الأساسي من MongoDB؟"
- "كيفاش يتم تخزين البيانات في MongoDB؟"
- "MongoDB قاعدة بيانات علائقية؟" (للـ tf)
- "المجموعة الأساسية للبيانات في MongoDB تسمى _____" (للـ fitb)

**أمثلة لأسئلة ممنوعة تماماً**:
- "شنوة رايك في MongoDB؟"
- "كيف تشوف MongoDB؟"
- "MongoDB أحسن من MySQL؟" (سؤال رأي)

مستوى الصعوبة المطلوب: ${
        Array.isArray(quizDifficulties) && quizDifficulties.length > 0
          ? quizDifficulties
              .map((d) =>
                d === "easy" ? "سهل" : d === "medium" ? "متوسط" : "صعب"
              )
              .join("، ")
          : "متوسط"
      }

مهم جداً للـ MCMA: لازم تكون الإجابات الصحيحة متنوعة ومنطقية، مش كلها صحيحة. مثلاً: من 4 خيارات، ممكن 1 أو 2 أو 3 يكونوا صحاح، أما مش لازم الكل.

لكل سؤال:
- type: نوع السؤال ("mcq" للاختيار الواحد، "mcma" للاختيارات المتعددة، "tf" لصح/غلط، "fitb" للفراغ)
- question: نص السؤال (بالدارجة التونسية، واضح وقصير)
- options: Array من الخيارات (للـ mcq/mcma/tf فقط، ${aCount} خيارات للـ mcq/mcma، خيارين "صحيح"/"غلط" للـ tf)
- correctIndex: رقم الإجابة الصحيحة للـ mcq/tf (0-based index)
- correctIndices: Array من أرقام الإجابات الصحيحة للـ mcma
- answerText: النص الصحيح للـ fitb
- acceptableAnswers: Array من الإجابات المقبولة للـ fitb (اختياري)
- explanation: شرح مفصل ليه الإجابة الصحيحة صحيحة والباقي غلط (بالدارجة التونسية)${
        quizHints
          ? `
- hint: تلميحة **مفيدة حقاً** تساعد في حل السؤال. أمثلة جيدة: 
  * للـ MCQ: "تفكر في الاستعمال الأساسي..." أو "هاذا مربوط بـ..." أو "اقرا الخيار الثاني مليح"
  * للـ MCMA: "الإجابات الصحيحة عادة تكون متشابهة في..." أو "ركز على الخيارات إلي فيها كلمة..."
  * للـ TF: "فكر: ياخي MongoDB نفس Excel؟" أو "هاذي الحاجة تشبه..." أو "اسأل روحك ياخي..."  
  * للـ FITB: "الكلمة تبدأ بـ... وعندها _ حروف" أو "مرادف لـ..." أو "ضد كلمة..."
  التلميحة لازم تعطي اتجاه واضح أو تلميح مباشر بلا ما تقول الإجابة نهائياً (بالدارجة التونسية)`
          : ""
      }

أمثلة:
MCQ: { "type": "mcq", "question": "شنوّة ...؟", "options": ["...","...","...","..."], "correctIndex": 1, "explanation": "الإجابة الثانية صحيحة خاطر..."${
        quizHints
          ? ', "hint": "اقرا الخيار الثاني مليح - فيه كلمة مهمة تبدأ بحرف \'د\'"'
          : ""
      } }
MCMA: { "type": "mcma", "question": "أشنية من هذول ...؟", "options": ["...","...","...","..."], "correctIndices": [0,2], "explanation": "الخيارين الأول والثالث صحاح خاطر..."${
        quizHints
          ? ', "hint": "الإجابات الصحيحة عادة تكون مربوطة بالبيانات والتخزين"'
          : ""
      } }
TF: { "type": "tf", "question": "... صحيح؟", "options": ["صحيح","غلط"], "correctIndex": 0, "explanation": "صحيح خاطر..."${
        quizHints ? ', "hint": "فكر: ياخي MongoDB يشبه Excel؟ الجواب واضح"' : ""
      } }
FITB: { "type": "fitb", "question": "... هو ___", "answerText": "الجواب", "acceptableAnswers": ["الجواب","جواب"], "explanation": "الجواب الصحيح هو 'الجواب' خاطر..."${
        quizHints
          ? ', "hint": "الكلمة عندها 6 حروف وتبدأ بـ \'ج\' وتعني النتيجة"'
          : ""
      } }

الموضوع: ${subject}
${
  contextSnippets.length
    ? `
مراجع من الويب (مقتطفات غير مباشرة باش تعاونك في تكوين الأسئلة):
${contextSnippets.map((t, i) => `[${i + 1}] ${t}`).join("\n\n")}
`
    : ""
}

رجّع الـ JSON فقط.`;
      let quiz = [];
      try {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: QUIZ_INSTR }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
          }),
        });
        const textBody = await response.text();
        if (response.ok) {
          let data;
          try {
            data = JSON.parse(textBody);
          } catch {
            data = { raw: textBody };
          }
          let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          // Strip code fences if present
          raw = raw.replace(/```json\s*|```/g, "").trim();
          // Try to parse JSON array
          try {
            quiz = JSON.parse(raw);
          } catch (_) {
            // Try to extract JSON array via regex
            const m = raw.match(/\[[\s\S]*\]/);
            if (m) {
              try {
                quiz = JSON.parse(m[0]);
              } catch {
                quiz = [];
              }
            }
          }
        } else {
          console.warn("Quiz API error:", response.status, textBody);
        }
      } catch (e) {
        console.warn("Quiz generation error:", e.message);
      }
      const sanitizeQuiz = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr
          .filter((q) => q && typeof q.question === "string")
          .map((q) => {
            const type = String(q.type || "mcq").toLowerCase();

            // STRICT TYPE CHECKING: Only allow selected types
            if (!selectedTypes.includes(type)) {
              console.log(
                `Filtering out question type "${type}" - not in selected types:`,
                selectedTypes
              );
              return null;
            }

            const question = enforceTunisianLexicon(q.question).slice(0, 200);
            const explanation = enforceTunisianLexicon(
              String(q.explanation || "لم يتم توفير شرح لهذا السؤال.").trim()
            ).slice(0, 500);
            const hint = quizHints
              ? enforceTunisianLexicon(String(q.hint || "").trim()).slice(
                  0,
                  300
                )
              : null;

            if (type === "mcq") {
              if (!Array.isArray(q.options)) return null;
              let opts = q.options
                .slice(0, aCount)
                .map((o) => String(o).trim())
                .filter(Boolean);
              while (opts.length < aCount) opts.push("خيار إضافي");
              let idx = Number.isInteger(q.correctIndex) ? q.correctIndex : 0;
              if (idx < 0 || idx >= opts.length) idx = 0;
              const result = {
                type: "mcq",
                question,
                options: opts.map(enforceTunisianLexicon),
                correctIndex: idx,
                explanation,
              };
              if (hint) result.hint = hint;
              return result;
            } else if (type === "mcma") {
              if (!Array.isArray(q.options)) return null;
              let opts = q.options
                .slice(0, aCount)
                .map((o) => String(o).trim())
                .filter(Boolean);
              while (opts.length < aCount) opts.push("خيار إضافي");
              let indices = Array.isArray(q.correctIndices)
                ? q.correctIndices.filter(
                    (i) => Number.isInteger(i) && i >= 0 && i < opts.length
                  )
                : [0];
              if (!indices.length) indices = [0];

              // If all answers are marked as correct and we have more than 2 options,
              // randomize it 70% of the time to make it more realistic (but still allow all-correct sometimes)
              if (
                indices.length === opts.length &&
                opts.length > 2 &&
                Math.random() < 0.7
              ) {
                const numCorrect = Math.max(
                  1,
                  Math.min(
                    opts.length - 1,
                    Math.floor(Math.random() * (opts.length - 1)) + 1
                  )
                );
                indices = [];
                while (indices.length < numCorrect) {
                  const idx = Math.floor(Math.random() * opts.length);
                  if (!indices.includes(idx)) indices.push(idx);
                }
                indices.sort();
              }

              const result = {
                type: "mcma",
                question,
                options: opts.map(enforceTunisianLexicon),
                correctIndices: indices,
                explanation,
              };
              if (hint) result.hint = hint;
              return result;
            } else if (type === "tf") {
              const opts = ["صحيح", "غلط"];
              let idx = Number.isInteger(q.correctIndex) ? q.correctIndex : 0;
              if (idx < 0 || idx > 1) idx = 0;
              const result = {
                type: "tf",
                question,
                options: opts,
                correctIndex: idx,
                explanation,
              };
              if (hint) result.hint = hint;
              return result;
            } else if (type === "fitb") {
              const answerText = String(q.answerText || "").trim() || "الجواب";
              const acceptableAnswers = Array.isArray(q.acceptableAnswers)
                ? q.acceptableAnswers
                    .map((a) => String(a).trim())
                    .filter(Boolean)
                : [answerText];
              const result = {
                type: "fitb",
                question,
                answerText: enforceTunisianLexicon(answerText),
                acceptableAnswers: acceptableAnswers.map(
                  enforceTunisianLexicon
                ),
                explanation,
              };
              if (hint) result.hint = hint;
              return result;
            } else {
              // If type is unknown and not in selected types, filter it out
              console.log(`Unknown question type "${type}" - filtering out`);
              return null;
            }
          })
          .filter(Boolean)
          .slice(0, qCount);
      };
      let finalQuiz = sanitizeQuiz(quiz);
      if (finalQuiz.length < 3) {
        // Fallback simple quiz if model failed - cycle through selected types
        const baseQ = (i) => {
          const type = selectedTypes[i % selectedTypes.length];
          const questionNum = i + 1;

          if (type === "mcq") {
            const baseOptions = [
              enforceTunisianLexicon(`معلومة أساسية ومهمة`),
              enforceTunisianLexicon("معلومة مغلوطة"),
              enforceTunisianLexicon("معلومة غير دقيقة"),
              enforceTunisianLexicon("معلومة غير متعلقة"),
              enforceTunisianLexicon("معلومة إضافية"),
            ];
            const result = {
              type: "mcq",
              question: enforceTunisianLexicon(
                `سؤال ${questionNum}: شنوة الغرض الأساسي من استعمال "${subject}"؟`
              ),
              options: baseOptions.slice(0, aCount),
              correctIndex: 0,
              explanation: enforceTunisianLexicon(
                "الإجابة الأولى صحيحة خاطر تمثل الغرض الأساسي من استعمال هذا الموضوع."
              ),
            };
            if (quizHints)
              result.hint = enforceTunisianLexicon(
                `الجواب موجود في الخيار الأول - ابحث على كلمة تبدأ بـ "م" وتخص التعلم.`
              );
            return result;
          } else if (type === "mcma") {
            const baseOptions = [
              enforceTunisianLexicon(`معلومة مهمة`),
              enforceTunisianLexicon("معلومة إضافية"),
              enforceTunisianLexicon("معلومة مغلوطة"),
              enforceTunisianLexicon("معلومة عامة"),
              enforceTunisianLexicon("معلومة أخرى"),
            ];
            // Generate random correctIndices (1-3 correct answers out of aCount)
            const numCorrect = Math.max(
              1,
              Math.min(aCount - 1, Math.floor(Math.random() * 3) + 1)
            );
            const correctIndices = [];
            while (correctIndices.length < numCorrect) {
              const idx = Math.floor(Math.random() * aCount);
              if (!correctIndices.includes(idx)) correctIndices.push(idx);
            }
            const result = {
              type: "mcma",
              question: enforceTunisianLexicon(
                `سؤال ${questionNum}: أشنية من هذول صحيحة حول "${subject}"؟`
              ),
              options: baseOptions.slice(0, aCount),
              correctIndices: correctIndices.sort(),
              explanation: enforceTunisianLexicon(
                `الخيارات الصحيحة هي: ${correctIndices
                  .map((i) => `الخيار ${i + 1}`)
                  .join(" و")} خاطر تتناسب مع الموضوع المطلوب.`
              ),
            };
            if (quizHints)
              result.hint = enforceTunisianLexicon(
                `اختار الخيارات إلي فيها كلمات "مهمة" و "إضافية" - هذول عادة يكونوا صحاح في أي موضوع تعليمي.`
              );
            return result;
          } else if (type === "tf") {
            const result = {
              type: "tf",
              question: enforceTunisianLexicon(
                `سؤال ${questionNum}: "${subject}" موضوع مهم؟`
              ),
              options: ["صحيح", "غلط"],
              correctIndex: 0,
              explanation: enforceTunisianLexicon(
                "صحيح خاطر أي موضوع تعليمي يكون عادة مهم للفهم والتعلم."
              ),
            };
            if (quizHints)
              result.hint = enforceTunisianLexicon(
                'فكر: ياخي التعلم مهم؟ لو كان الجواب نعم، اختار "صحيح".'
              );
            return result;
          } else if (type === "fitb") {
            const result = {
              type: "fitb",
              question: enforceTunisianLexicon(
                `سؤال ${questionNum}: الموضوع متاعنا هو ___`
              ),
              answerText: enforceTunisianLexicon(subject.slice(0, 50)),
              acceptableAnswers: [enforceTunisianLexicon(subject.slice(0, 50))],
              explanation: enforceTunisianLexicon(
                `الجواب الصحيح هو "${subject.slice(
                  0,
                  50
                )}" خاطر هذا هو الموضوع إلي قاعد نتناقش فيه.`
              ),
            };
            if (quizHints)
              result.hint = enforceTunisianLexicon(
                `الجواب يبدأ بأول حرف من "${subject}" وله نفس عدد الحروف (${subject.length} حرف)`
              );
            return result;
          } else {
            // Default MCQ fallback
            return {
              type: "mcq",
              question: enforceTunisianLexicon(
                `سؤال ${questionNum}: شنوة الغرض من استعمال "${subject}"؟`
              ),
              options: [
                enforceTunisianLexicon(`غرض تعليمي ومهم`),
                enforceTunisianLexicon("غرض غير واضح"),
                enforceTunisianLexicon("ما لهوش غرض محدد"),
                enforceTunisianLexicon("غرض تجريبي"),
              ],
              correctIndex: 0,
              explanation: enforceTunisianLexicon(
                "الإجابة الأولى صحيحة خاطر أي موضوع تعليمي عندو غرض واضح ومهم."
              ),
            };
          }
        };
        finalQuiz = Array.from({ length: qCount }, (_, i) => baseQ(i));
      }
      return res.json({ isQuiz: true, quiz: finalQuiz });
    }
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
    
    // Smart web search: only search if it's a question or needs current info
    const needsWebSearch = (msg) => {
      if (!msg || typeof msg !== 'string') return false;
      const text = msg.trim();
      // Too short to be a real question
      if (text.length < 10) return false;
      // Has question words or patterns
      const hasQuestionWord = /(\?|شنوة|علاش|كيفاش|وين|وقتاش|قداش|شكون|what|when|where|why|how|who|اش هو|اش هي|شنية)/i.test(text);
      // Needs current/recent info
      const needsCurrentInfo = /(تاو|اليوم|today|current|latest|آخر|الآن|هذا الأسبوع|this week|recent)/i.test(text);
      // Looks for external info (news, weather, events, etc)
      const needsExternalInfo = /(أخبار|news|weather|طقس|event|حدث|price|سعر|stock|update|تحديث)/i.test(text);
      
      return hasQuestionWord || needsCurrentInfo || needsExternalInfo;
    };
    
    // Only search if webSearch is enabled AND message needs it
    if (webSearch && message && needsWebSearch(message)) {
      try {
        // Prepend today's date to bias results freshness; also default location to Tunis, Tunisia for weather-like queries
        const today = new Date().toISOString().slice(0, 10);
        let baseQuery = String(message).slice(0, 200);
        const needsDefaultLoc =
          isWeatherLike(message) && !hasLocationMention(message);
        if (needsDefaultLoc) {
          baseQuery = `${String(message).slice(
            0,
            200
          )} weather today temperature in Tunis, Tunisia`;
        }
        const q = encodeURIComponent(`[${today}] ` + baseQuery);
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
          needsDefaultLoc &&
            `بما إنك ما حدّدتش البلاصة، اعتبرنا المكان الافتراضي: تونس العاصمة، تونس (Africa/Tunis).`,
          abstract && `نتيجة مختصرة: ${abstract}`,
          webResults.length ? `روابط لقيتها:\n${list}` : "",
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
    // If weather-like and no location, add explicit instruction for default location/timezone/units
    if (isWeatherLike(userPrompt) && !hasLocationMention(userPrompt)) {
      userPrompt += `\n\nتنبيه داخلي: ما فماش مكان مذكور في السؤال، اعتبر المكان الافتراضي: تونس العاصمة، تونس. اعتمد التوقيت Africa/Tunis والوحدة: درجة مئوية.`;
    }
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          role: "user",
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
    // If no AI messages, fall back to last user message so preview still works
    let combinedContent = "";
    if (aiMessages.length === 0) {
      const lastUser = Array.isArray(messages)
        ? [...messages]
            .reverse()
            .find((m) => m && m.sender === "user" && m.text)
        : null;
      if (!lastUser) {
        return res.status(400).json({ error: "ما فماش محتوى واضح للتصدير." });
      }
      combinedContent = String(lastUser.text || "");
    } else {
      // Combine all AI content
      combinedContent = aiMessages.map((msg) => msg.text).join("\n\n");
    }

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

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
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
          // Keep refinedContent as original combinedContent on failure
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
      // refinedContent already defaults to combinedContent
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
    const { messages, includeCitations } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "نقص شوية معلومات لإنشاء ال-PDF." });
    }

    // Extract AI responses from messages (excluding welcome message)
    const aiMessages = messages.filter(
      (msg) => msg.sender === "ai" && !msg.isWelcomeMessage
    );
    // If no AI messages, fall back to last user message so download still works
    let combinedContent = "";
    if (aiMessages.length === 0) {
      const lastUser = Array.isArray(messages)
        ? [...messages]
            .reverse()
            .find((m) => m && m.sender === "user" && m.text)
        : null;
      if (!lastUser) {
        return res.status(400).json({ error: "ما فماش محتوى واضح للتصدير." });
      }
      combinedContent = String(lastUser.text || "");
    } else {
      combinedContent = aiMessages.map((msg) => msg.text).join("\n\n");
    }

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
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
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
          // Keep refined as original combinedContent on failure
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
      // refined already defaults to combinedContent
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

    // --- Force web search + URL fetch to gather sources, then extract citations (if enabled) ---
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
      : refined.split(/\n/).find((l) => /^#{1,2}\s/.test(l)) ||
        refined.slice(0, 200);
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
          const ddgResp = await fetch(ddgUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          const ddgJson = await ddgResp.json();
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
              if (webResults.length >= 3) break;
            }
          }
        } catch (_) {}
        // HTML fallback if needed
        if (webResults.length < 3) {
          try {
            const ddgHtmlUrl = `https://html.duckduckgo.com/html/?q=${q}`;
            const htmlResp = await fetch(ddgHtmlUrl, {
              headers: { "User-Agent": "Mozilla/5.0" },
            });
            const html = await htmlResp.text();
            const $ = cheerioLoad(html);
            $("a.result__a").each((_, el) => {
              if (webResults.length >= 3) return false;
              const title = $(el).text().trim();
              let url = $(el).attr("href");
              if (url && url.includes("//duckduckgo.com/l/?uddg=")) {
                try {
                  const urlParams = new URL(url, "https://duckduckgo.com");
                  const actualUrl = decodeURIComponent(
                    urlParams.searchParams.get("uddg") || ""
                  );
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
      .filter(
        (u) =>
          /^https?:\/\//i.test(u) &&
          !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(u)
      );

    const allUrls = Array.from(
      new Set([...urlsFromText, ...urlsFromMsgs, ...webUrls])
    )
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
        return d.toLocaleDateString("en-GB", {
          year: "numeric",
          month: "long",
          day: "2-digit",
        });
      } catch (_) {
        return null;
      }
    };

    const fetchMetaForUrl = async (u) => {
      const info = { url: u, title: "", site: "", published: null };
      try {
        const resp = await fetch(u, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const ct = (resp.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("text/html")) return info;
        const html = await resp.text();
        const $ = cheerioLoad(html);
        const getMeta = (sel, attr = "content") => $(sel).attr(attr) || "";
        info.title =
          getMeta('meta[property="og:title"]') ||
          getMeta('meta[name="twitter:title"]') ||
          $("title").first().text().trim() ||
          "";
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
                ? j.find((x) => x && x.datePublished)?.datePublished || null
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

    let referencesHtml = "";
    if (includeCitations !== false) {
      const metaList = [];
      for (const u of allUrls) {
        // Sequential to avoid too many concurrent requests; still fast with slice(0,6)
        // eslint-disable-next-line no-await-in-loop
        const meta = await fetchMetaForUrl(u);
        metaList.push(meta);
      }
      if (metaList.length > 0) {
        const lis = metaList
          .map((m, i) => {
            const n = i + 1;
            const site =
              m.site || new URL(m.url).hostname.replace(/^www\./, "");
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
    } else {
      referencesHtml = ""; // Skip references section entirely
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
  /* Footer is rendered by Puppeteer header/footer templates; no CSS counters here */
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
  
  </head>
<body>
  <header></header>
  ${contentHtml}
  ${referencesHtml}
  
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
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `
        <div style="width:100%; font-size:10px; color:#777; padding:0 15mm;">
          <div style="text-align:center; width:100%;">
            صفحة <span class="pageNumber"></span> / <span class="totalPages"></span>
          </div>
        </div>`,
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

// DOCX Download endpoint
app.post("/download-docx", async (req, res) => {
  try {
    const { messages, includeCitations } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res
        .status(400)
        .json({ error: "نقص شوية معلومات لإنشاء ال-Word." });
    }

    // Use same content extraction logic as PDF
    const aiMessages = messages.filter(
      (msg) => msg.sender === "ai" && !msg.isWelcomeMessage
    );
    let combinedContent = "";
    if (aiMessages.length === 0) {
      const lastUser = Array.isArray(messages)
        ? [...messages]
            .reverse()
            .find((m) => m && m.sender === "user" && m.text)
        : null;
      if (!lastUser) {
        return res.status(400).json({ error: "ما فماش محتوى واضح للتصدير." });
      }
      combinedContent = String(lastUser.text || "");
    } else {
      combinedContent = aiMessages.map((msg) => msg.text).join("\n\n");
    }

    // Same refinement process as PDF
    let refined = combinedContent;
    try {
      if (GEMINI_API_KEY) {
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
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
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
        if (response.ok) {
          let data;
          try {
            data = JSON.parse(textBody);
          } catch {
            data = { raw: textBody };
          }
          let out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (out) {
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
      console.warn("Refinement failed for DOCX:", e.message);
    }

    // Enforce Tunisian lexicon
    refined = enforceTunisianLexicon(refined);

    // Simple citations gathering (reuse logic from PDF)
    let referencesText = "";
    if (includeCitations !== false) {
      const urlRegexGlobal = /https?:\/\/[^\s)]+/gi;
      const urlsFromText = refined.match(urlRegexGlobal) || [];
      const urlsFromMsgs = aiMessages
        .flatMap((m) => String(m.text || "").match(urlRegexGlobal) || [])
        .filter(Boolean);
      const allUrls = Array.from(
        new Set([...urlsFromText, ...urlsFromMsgs])
      ).slice(0, 6);

      if (allUrls.length > 0) {
        const accessedStr = new Date().toLocaleDateString("en-GB");
        referencesText = "\n\n## المراجع\n\n";
        allUrls.forEach((url, i) => {
          referencesText += `${i + 1}. ${url} (accessed ${accessedStr})\n`;
        });
      }
    }

    const finalContent = refined + referencesText;

    // For better Arabic support, let's create a simple text file with .docx extension
    // that Word can open and properly format Arabic text
    let cleanText = finalContent
      .replace(/^#{1,6}\s+(.*)$/gm, "$1\n") // Convert headers to plain text
      .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold markdown
      .replace(/\*(.*?)\*/g, "$1") // Remove italic markdown
      .replace(/`(.*?)`/g, "$1") // Remove code markdown
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)") // Convert links to text
      .replace(/^\s*[-*+]\s+/gm, "• ") // Convert bullet points
      .replace(/^\s*\d+\.\s+/gm, "") // Convert numbered lists
      .replace(/\n{3,}/g, "\n\n") // Clean up extra line breaks
      .trim();

    // Add a BOM for proper UTF-8 encoding in Word
    const bom = "\ufeff";
    const content = bom + cleanText;

    // Set headers for Rich Text Format which handles Arabic better
    res.setHeader("Content-Type", "application/rtf; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="chat-export.rtf"'
    );

    // Send UTF-8 encoded content
    return res.send(Buffer.from(content, "utf8"));
  } catch (e) {
    console.error("DOCX generation failed:", e);
    return res
      .status(500)
      .json({ error: "تعطلت خدمة إنشاء ال-Word مؤقتاً. جرّب بعد شوية." });
  }
});

// Markdown Download endpoint
app.post("/download-markdown", async (req, res) => {
  try {
    const { messages, includeCitations } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res
        .status(400)
        .json({ error: "نقص شوية معلومات لإنشاء ال-Markdown." });
    }

    // Use same content extraction and refinement logic as PDF
    const aiMessages = messages.filter(
      (msg) => msg.sender === "ai" && !msg.isWelcomeMessage
    );
    let combinedContent = "";
    if (aiMessages.length === 0) {
      const lastUser = Array.isArray(messages)
        ? [...messages]
            .reverse()
            .find((m) => m && m.sender === "user" && m.text)
        : null;
      if (!lastUser) {
        return res.status(400).json({ error: "ما فماش محتوى واضح للتصدير." });
      }
      combinedContent = String(lastUser.text || "");
    } else {
      combinedContent = aiMessages.map((msg) => msg.text).join("\n\n");
    }

    // Same refinement process
    let refined = combinedContent;
    try {
      if (GEMINI_API_KEY) {
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
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
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
        if (response.ok) {
          let data;
          try {
            data = JSON.parse(textBody);
          } catch {
            data = { raw: textBody };
          }
          let out = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (out) {
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
      console.warn("Refinement failed for Markdown:", e.message);
    }

    // Enforce Tunisian lexicon
    refined = enforceTunisianLexicon(refined);

    // Add references section if enabled
    let referencesText = "";
    if (includeCitations !== false) {
      const urlRegexGlobal = /https?:\/\/[^\s)]+/gi;
      const urlsFromText = refined.match(urlRegexGlobal) || [];
      const urlsFromMsgs = aiMessages
        .flatMap((m) => String(m.text || "").match(urlRegexGlobal) || [])
        .filter(Boolean);
      const allUrls = Array.from(
        new Set([...urlsFromText, ...urlsFromMsgs])
      ).slice(0, 6);

      if (allUrls.length > 0) {
        const accessedStr = new Date().toLocaleDateString("en-GB");
        referencesText = "\n\n## المراجع\n\n";
        allUrls.forEach((url, i) => {
          referencesText += `${
            i + 1
          }. [${url}](${url}) (accessed ${accessedStr})\n`;
        });
      } else {
        referencesText =
          "\n\n## المراجع\n\nلا توجد مراجع مستعملة في هذا التقرير.\n";
      }
    }

    const finalMarkdown = refined + referencesText;

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="chat-export.md"'
    );
    return res.send(finalMarkdown);
  } catch (e) {
    console.error("Markdown generation failed:", e);
    return res
      .status(500)
      .json({ error: "تعطلت خدمة إنشاء ال-Markdown مؤقتاً. جرّب بعد شوية." });
  }
});

app.listen(3001, () => console.log("Server running on port 3001"));

