/**
 * Vercel Edge Function: PDF Proxy
 * Base44에서 업로드된 PDF 파일의 CORS 문제를 해결하기 위한 프록시
 */

export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type",
      },
    });
  }

  if (!targetUrl) {
    return new Response("Missing url parameter", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Validate URL
  try {
    const parsedUrl = new URL(targetUrl);
    if (!/^https?:$/.test(parsedUrl.protocol)) {
      return new Response("Invalid URL protocol", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }
  } catch (err) {
    return new Response("Invalid URL", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // helper: normalize Google Drive viewer/share URLs to direct-download endpoint
  const normalizeTarget = (rawUrl) => {
    try {
      const u = new URL(rawUrl);
      const host = u.hostname.toLowerCase();
      if (host === "drive.google.com") {
        // /file/d/{id}/view or /file/d/{id}/preview
        const fileIdMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//);
        let fileId = fileIdMatch ? fileIdMatch[1] : null;
        // /open?id={id} 또는 /uc?id={id}
        if (!fileId) fileId = u.searchParams.get("id");
        if (fileId) {
          const direct = new URL("https://drive.google.com/uc");
          direct.searchParams.set("export", "download");
          direct.searchParams.set("id", fileId);
          return direct.toString();
        }
      }
    } catch (_) {
      // ignore, return raw
    }
    return rawUrl;
  };

  try {
    // Forward important headers for better upstream compatibility
    const headers = new Headers();
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) headers.set("Range", rangeHeader);
    const ua = request.headers.get("user-agent");
    if (ua) headers.set("User-Agent", ua);
    const accept = request.headers.get("accept");
    if (accept) headers.set("Accept", accept);
    const lang = request.headers.get("accept-language");
    if (lang) headers.set("Accept-Language", lang);
    const referer = request.headers.get("referer");
    if (referer) headers.set("Referer", referer);

    // Normalize common viewer URLs (e.g., Google Drive) to direct binary endpoints
    const normalizedUrl = normalizeTarget(targetUrl);

    // Fetch the target PDF
    const response = await fetch(normalizedUrl, {
      method: request.method,
      headers,
    });

    // Prepare response headers
    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges"
    );

    // Copy important headers from upstream
    const headersToForward = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "last-modified",
      "etag",
    ];

    headersToForward.forEach((header) => {
      const value = response.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    });

    // Return proxied response
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response(`Proxy error: ${error.message}`, {
      status: 502,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
