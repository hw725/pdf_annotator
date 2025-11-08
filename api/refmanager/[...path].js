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
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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

  // Copy headers; for uploads, preserve original content-type
  const headers = new Headers();
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const incomingContentType = request.headers.get("content-type") || "";

  let body = undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Multipart 또는 바이너리는 원본 스트림 그대로 전달
    if (
      incomingContentType.includes("multipart/form-data") ||
      incomingContentType.includes("application/pdf") ||
      incomingContentType.includes("application/octet-stream")
    ) {
      headers.set("content-type", incomingContentType);
      body = request.body; // pass-through stream
      console.log(
        `[Proxy Request Body] ${clientRequestId} (stream passthrough)`,
        {
          contentType: incomingContentType,
        }
      );
    } else {
      // JSON/text 요청은 읽어서 로깅
      try {
        const json = await request.json();
        body = JSON.stringify(json);
        headers.set("content-type", "application/json");
        console.log(`[Proxy Request Body] ${clientRequestId}`, json);
      } catch {
        const txt = await request.text();
        body = txt;
        if (incomingContentType)
          headers.set("content-type", incomingContentType);
        console.log(`[Proxy Request Body (text)] ${clientRequestId}`, txt);
      }
    }
  }

  try {
    const resp = await fetch(target, {
      method: request.method,
      headers,
      body,
    });

    // 업스트림 응답 로깅
    const contentType = resp.headers.get("content-type") || "";
    const responseBuffer = await resp.arrayBuffer();
    let responseText = "";
    if (
      contentType.includes("application/json") ||
      responseBuffer.byteLength < 1024 * 512
    ) {
      try {
        responseText = new TextDecoder().decode(responseBuffer).slice(0, 2000);
      } catch {}
    }
    console.log(`[Proxy Response] ${clientRequestId}`, {
      status: resp.status,
      ok: resp.ok,
      contentType,
      bodyPreview: responseText,
      size: responseBuffer.byteLength,
    });

    const passHeaders = {
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "Content-Type",
      "content-type": resp.headers.get("content-type") || "application/json",
    };

    if (!resp.ok) {
      let message = `HTTP ${resp.status}`;
      try {
        const err = responseText
          ? JSON.parse(responseText)
          : { error: message };
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

    // Try to parse as JSON, else 바이너리/텍스트 그대로 전달
    if (contentType.includes("application/json")) {
      try {
        const json = JSON.parse(responseText || "null");
        return jsonResponse(200, json ?? {}, passHeaders);
      } catch {
        return new Response(responseBuffer, {
          status: 200,
          headers: passHeaders,
        });
      }
    }
    return new Response(responseBuffer, { status: 200, headers: passHeaders });
  } catch (e) {
    console.error(`[Proxy Fetch Error] ${clientRequestId}`, e);
    return jsonResponse(502, { error: `Upstream error: ${e?.message || e}` });
  }
}
