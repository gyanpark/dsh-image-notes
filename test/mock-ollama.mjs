// Tiny Ollama look-alike for tests: two vision models (one big, one small) and one text model.
import http from "node:http";
export function startMock(port = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = ""; req.on("data", (d) => (body += d)); req.on("end", () => {
        res.setHeader("content-type", "application/json");
        const j = () => (body ? JSON.parse(body) : {});
        if (req.url === "/api/ps") return res.end(JSON.stringify({ models: [] }));
        if (req.url === "/api/tags") return res.end(JSON.stringify({ models: [
          { name: "big-vision:latest", size: 18e9 }, { name: "coder:latest", size: 1e9 }, { name: "small-vision:latest", size: 6e9 }] }));
        if (req.url === "/api/show") { const m = j().model; return res.end(JSON.stringify({ capabilities: m.includes("vision") ? ["completion", "vision"] : ["completion"] })); }
        if (req.url === "/api/chat") { const m = j(); return res.end(JSON.stringify({ message: { content:
          `1. **Type**: test\n2. **Visible text**: hello\n3. **Layout**: one box\n4. **Problems**: none visible\n5. **Summary**: Read by ${m.model}; image had ${m.messages[0].images[0].length} base64 chars.` } })); }
        if (req.url === "/api/generate") return res.end(JSON.stringify({ done: true }));
        res.statusCode = 404; res.end("{}");
      });
    });
    srv.listen(port, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}
