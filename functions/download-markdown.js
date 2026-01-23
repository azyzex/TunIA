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

  const lines = [];
  lines.push(`# Chat Export`);
  lines.push("");

  for (const msg of messages) {
    const who = msg?.sender === "user" ? "User" : "AI";
    const text = typeof msg?.text === "string" ? msg.text : "";
    if (!text) continue;
    lines.push(`## ${who}`);
    lines.push("");
    lines.push(text);
    lines.push("");
  }

  const content = lines.join("\n").trim() + "\n";

  return new Response(content, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": 'attachment; filename="chat-export.md"',
      "access-control-allow-origin": "*",
    },
  });
}
