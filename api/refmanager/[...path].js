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
  const clientRequestId =
    request.headers.get("x-client-request-id") || "unknown";

  // 디버깅: 프록시 요청 로깅
  console.log(`[Proxy Request] ${clientRequestId}`, {
    method: request.method,
    pathAfter,
    target,
    upstreamBase,
  });

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
      console.log(`[Proxy Request Body] ${clientRequestId}`, json);
    } catch {
      body = await request.text();
      console.log(`[Proxy Request Body (text)] ${clientRequestId}`, body);
    }
  }

  try {
    const resp = await fetch(target, {
      method: request.method,
      headers,
      body,
    });

    // 업스트림 응답 로깅
    const responseText = await resp.text();
    console.log(`[Proxy Response] ${clientRequestId}`, {
      status: resp.status,
      ok: resp.ok,
      bodyPreview: responseText.slice(0, 500),
    });

    const passHeaders = {
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "Content-Type",
      "content-type": resp.headers.get("content-type") || "application/json",
    };

    if (!resp.ok) {
      let message = `HTTP ${resp.status}`;
      try {
        const err = JSON.parse(responseText);
        message = err?.message || err?.error || message;
        console.error(`[Proxy Error] ${clientRequestId}`, err);
        return jsonResponse(
          resp.status,
          { error: message, details: err },
          passHeaders
        );
      } catch {
        if (responseText) message = responseText;
        console.error(`[Proxy Error (text)] ${clientRequestId}`, responseText);
        return jsonResponse(resp.status, { error: message }, passHeaders);
      }
    }

    // Try to parse as JSON
    try {
      const data = JSON.parse(responseText);
      return jsonResponse(200, data, passHeaders);
    } catch {
      // Fallback: return text
      return new Response(responseText, { status: 200, headers: passHeaders });
    }
  } catch (e) {
    console.error(`[Proxy Fetch Error] ${clientRequestId}`, e);
    return jsonResponse(502, { error: `Upstream error: ${e?.message || e}` });
  }
}
