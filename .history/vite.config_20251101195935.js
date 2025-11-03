import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Dev-time PDF proxy to bypass CORS and support Range requests
function localProxyPlugin() {
  return {
    name: "local-proxy",
    configureServer(server) {
      server.middlewares.use("/proxy", async (req, res) => {
        try {
          const reqUrl = new URL(req.url, "http://localhost");
          const target = reqUrl.searchParams.get("url");
          if (!target) {
            res.statusCode = 400;
            res.end("Missing url param");
            return;
          }

          const headers = {};
          if (req.headers["range"]) headers["Range"] = req.headers["range"]; // pass through Range
          if (req.headers["user-agent"])
            headers["User-Agent"] = req.headers["user-agent"]; // optional

          const upstream = await fetch(target, {
            method: req.method || "GET",
            headers,
          });

          res.statusCode = upstream.status;
          const passHeaders = [
            "content-type",
            "content-length",
            "accept-ranges",
            "content-range",
            "cache-control",
            "content-disposition",
            "last-modified",
          ];
          passHeaders.forEach((h) => {
            const v = upstream.headers.get(h);
            if (v) res.setHeader(h, v);
          });
          // Dev: prevent Edge from caching partial responses that may cause blank initial renders
          res.setHeader("Cache-Control", "no-store");

          if (!upstream.body) {
            res.end();
            return;
          }

          // Stream the response body
          const anyBody = upstream.body;
          if (typeof anyBody.pipe === "function") {
            anyBody.pipe(res);
          } else if (typeof anyBody.getReader === "function") {
            const { Readable } = await import("node:stream");
            Readable.fromWeb(anyBody).pipe(res);
          } else {
            const buf = Buffer.from(await upstream.arrayBuffer());
            res.end(buf);
          }
        } catch (e) {
          res.statusCode = 502;
          res.end(`Proxy error: ${e?.message || e}`);
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localProxyPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    cors: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
