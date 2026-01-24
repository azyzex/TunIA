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

async function verifyPassword({
  supabaseUrl,
  supabaseAnonKey,
  email,
  password,
}) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${supabaseAnonKey}`,
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

async function adminDeleteUser({ supabaseUrl, serviceKey, userId }) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(
    userId,
  )}`;
  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  });

  const raw = await resp.text();
  if (!resp.ok) {
    let msg = raw;
    try {
      const j = JSON.parse(raw);
      msg = j?.msg || j?.error_description || j?.error || j?.message || raw;
    } catch {
      // ignore
    }
    const err = new Error(msg || `Delete failed (${resp.status})`);
    err.status = resp.status;
    throw err;
  }
  return true;
}

export async function onRequestPost({ request, env }) {
  try {
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
    const serviceKey = env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
      return withCors(
        jsonResponse(
          {
            ok: false,
            error:
              "Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY (or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)",
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

    const verified = await verifyPassword({
      supabaseUrl,
      supabaseAnonKey,
      email,
      password,
    });

    if (!verified.ok) {
      return withCors(
        jsonResponse(
          {
            ok: false,
            error: "كلمة السرّ موش صحيحة.",
          },
          401,
        ),
      );
    }

    const userId = verified?.data?.user?.id;
    if (!userId) {
      return withCors(
        jsonResponse(
          {
            ok: false,
            error: "ما نجّمتش نحدّد الحساب. جرّب عاود.",
          },
          500,
        ),
      );
    }

    await adminDeleteUser({ supabaseUrl, serviceKey, userId });

    return withCors(
      jsonResponse({ ok: true, message: "تمّ حذف الحساب." }, 200),
    );
  } catch (err) {
    return withCors(
      jsonResponse(
        {
          ok: false,
          error: "صار مشكل وقت حذف الحساب. جرّب بعد شوية.",
          details: err?.message || String(err),
        },
        500,
      ),
    );
  }
}
