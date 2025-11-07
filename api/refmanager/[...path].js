export const runtime = "edge";

function jsonResponse(status, data, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

export default async function handler(request) {
  const url = new URL(request.url);
  const pathAfter = url.pathname.replace(/^\/api\/refmanager\/?/, "/");

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, x-client-request-id",
        "Access-Control-Expose-Headers": "Content-Type",
      },
    });
  }

  const upstreamBase = process.env.REFMANAGER_API_URL;
  if (!upstreamBase) {
    return jsonResponse(500, {
      error: "Server not configured: REFMANAGER_API_URL missing",
    });
  }

  const target = new URL(pathAfter, upstreamBase).toString();

  // Copy headers selectively
  const headers = new Headers();
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  headers.set("content-type", "application/json");

  let body = undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      const json = await request.json();
      body = JSON.stringify(json);
    } catch {
      body = await request.text();
    }
  }

  try {
    const resp = await fetch(target, {
      method: request.method,
      headers,
      body,
    });

    const passHeaders = {
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "Content-Type",
      "content-type": resp.headers.get("content-type") || "application/json",
    };

    if (!resp.ok) {
      let message = `HTTP ${resp.status}`;
      try {
        const err = await resp.json();
        message = err?.message || err?.error || message;
        return jsonResponse(resp.status, { error: message }, passHeaders);
      } catch {
        const txt = await resp.text();
        if (txt) message = txt;
        return jsonResponse(resp.status, { error: message }, passHeaders);
      }
    }

    // Try to stream through JSON
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await resp.json();
      return jsonResponse(200, data, passHeaders);
    }

    // Fallback: pass text
    const text = await resp.text();
    return new Response(text, { status: 200, headers: passHeaders });
  } catch (e) {
    return jsonResponse(502, { error: `Upstream error: ${e?.message || e}` });
  }
}
