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

export async function onRequestOptions() {
  return withCors(new Response(null, { status: 204 }));
}

async function verifyPassword({ supabaseUrl, supabaseAnonKey, email, password }) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const raw = await resp.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  if (!resp.ok) {
    return { ok: false, data };
  }

  return { ok: true, data };
}

export async function onRequestPost({ request, env }) {
  try {
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseAnonKey = env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return withCors(
        jsonResponse(
          {
            ok: false,
            error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY",
          },
          500,
        ),
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return withCors(jsonResponse({ ok: false }, 400));
    }

    const result = await verifyPassword({
      supabaseUrl,
      supabaseAnonKey,
      email,
      password,
    });

    if (!result.ok) {
      return withCors(jsonResponse({ ok: false }, 401));
    }

    return withCors(jsonResponse({ ok: true }));
  } catch (err) {
    return withCors(
      jsonResponse({ ok: false, error: err?.message || String(err) }, 500),
    );
  }
}
