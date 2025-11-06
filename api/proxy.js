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

  try {
    // Forward Range header for PDF streaming
    const headers = new Headers();
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      headers.set("Range", rangeHeader);
    }

    // Fetch the target PDF
    const response = await fetch(targetUrl, {
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
