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

export async function onRequestPost() {
  // NOTE: The old Node server used Puppeteer to render high-quality PDFs.
  // Cloudflare Workers/Pages Functions cannot run Puppeteer/Chromium on the free runtime.
  // Use Markdown/RTF export instead, or move PDF rendering to a separate service.
  return new Response(JSON.stringify({
    error: "PDF_EXPORT_NOT_AVAILABLE",
    message: "تصدير PDF بالسيرفر موش متاح توّا على Cloudflare. استعمل Markdown ولا Word (RTF).",
  }), {
    status: 501,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}
