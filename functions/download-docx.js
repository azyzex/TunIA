function toRtf(text) {
  // Very small/safe RTF escaping
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r?\n/g, "\\par\n");
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
  const { messages } = await request.json().catch(() => ({}));
  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "ما فماش محتوى واضح للتصدير." }), {
      status: 400,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    });
  }

  const chunks = [];
  chunks.push("{\\rtf1\\ansi\\deff0");
  chunks.push("\\fs28 Chat Export\\par\\par");

  for (const msg of messages) {
    const who = msg?.sender === "user" ? "User" : "AI";
    const text = typeof msg?.text === "string" ? msg.text : "";
    if (!text) continue;
    chunks.push(`\\b ${toRtf(who)}\\b0\\par`);
    chunks.push(`${toRtf(text)}\\par\\par`);
  }

  chunks.push("}");
  const rtf = chunks.join("\n");

  return new Response(rtf, {
    status: 200,
    headers: {
      "content-type": "application/rtf; charset=utf-8",
      "content-disposition": 'attachment; filename="chat-export.rtf"',
      "access-control-allow-origin": "*",
    },
  });
}
