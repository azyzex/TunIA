function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export async function onRequestPost({ request }) {
  try {
    const { messages } = await request.json().catch(() => ({}));
    if (!Array.isArray(messages)) {
      return jsonResponse({ error: "نقص شوية معلومات لإنشاء المعاينة." }, 400);
    }

    const aiMessages = messages.filter(
      (m) => m?.sender === "ai" && !m?.isWelcomeMessage && typeof m?.text === "string",
    );

    const content = aiMessages.length
      ? aiMessages.map((m) => m.text).join("\n\n---\n\n")
      : "ما فما حتى ردّ واضح باش نصدرّو.";

    const previewContent = `# معاينة التصدير\n\n${content}\n`;

    return jsonResponse({ previewContent });
  } catch (e) {
    return jsonResponse({ error: "EXPORT_PREVIEW_ERROR", details: e?.message || String(e) }, 500);
  }
}
