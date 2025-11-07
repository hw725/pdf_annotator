/**
 * Netlify Function: PDF Proxy
 * Base44에서 업로드된 PDF 파일의 CORS 문제를 해결하기 위한 프록시
 */

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  const targetUrl = event.queryStringParameters?.url;

  if (!targetUrl) {
    return {
      statusCode: 400,
      headers: { ...headers, "Content-Type": "text/plain" },
      body: "Missing url parameter",
    };
  }

  // Validate URL
  try {
    const parsedUrl = new URL(targetUrl);
    if (!/^https?:$/.test(parsedUrl.protocol)) {
      return {
        statusCode: 400,
        headers: { ...headers, "Content-Type": "text/plain" },
        body: "Invalid URL protocol",
      };
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers: { ...headers, "Content-Type": "text/plain" },
      body: "Invalid URL",
    };
  }

  // helper: normalize Google Drive viewer/share URLs to direct-download endpoint
  const normalizeTarget = (rawUrl) => {
    try {
      const u = new URL(rawUrl);
      const host = u.hostname.toLowerCase();
      if (host === "drive.google.com") {
        const fileIdMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//);
        let fileId = fileIdMatch ? fileIdMatch[1] : null;
        if (!fileId) fileId = u.searchParams.get("id");
        if (fileId) {
          const direct = new URL("https://drive.google.com/uc");
          direct.searchParams.set("export", "download");
          direct.searchParams.set("id", fileId);
          return direct.toString();
        }
      }
    } catch (_) {
      // ignore
    }
    return rawUrl;
  };

  try {
    // Forward Range header
    const fetchHeaders = {};
    const rangeHeader = event.headers["range"] || event.headers["Range"];
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }
    const ua = event.headers["user-agent"] || event.headers["User-Agent"];
    if (ua) fetchHeaders["User-Agent"] = ua;
    const accept = event.headers["accept"] || event.headers["Accept"];
    if (accept) fetchHeaders["Accept"] = accept;
    const lang =
      event.headers["accept-language"] || event.headers["Accept-Language"];
    if (lang) fetchHeaders["Accept-Language"] = lang;
    const referer = event.headers["referer"] || event.headers["Referer"];
    if (referer) fetchHeaders["Referer"] = referer;

    // Normalize common viewer URLs (e.g., Google Drive) to direct binary endpoints
    const normalizedUrl = normalizeTarget(targetUrl);

    // Fetch the target PDF
    const response = await fetch(normalizedUrl, {
      method: event.httpMethod,
      headers: fetchHeaders,
    });

    // Get response body as buffer
    const buffer = await response.arrayBuffer();

    // Prepare response headers
    const responseHeaders = {
      ...headers,
      "Access-Control-Expose-Headers":
        "Content-Length, Content-Range, Accept-Ranges",
    };

    // Copy important headers
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
        responseHeaders[header] = value;
      }
    });

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: Buffer.from(buffer).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error("Proxy error:", error);
    return {
      statusCode: 502,
      headers: { ...headers, "Content-Type": "text/plain" },
      body: `Proxy error: ${error.message}`,
    };
  }
};
