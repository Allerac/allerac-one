import * as http from "node:http";
import { fetchHandler } from "./index";

const PORT = Number(process.env.PORT ?? "8787");
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";

if (!WORKER_SECRET) {
  console.error("WORKER_SECRET environment variable is required");
  process.exit(1);
}

const env = { WORKER_SECRET };

const server = http.createServer(async (nodeReq, nodeRes) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of nodeReq) {
      chunks.push(chunk as Buffer);
    }
    const bodyBuf = Buffer.concat(chunks);

    const url = `http://localhost:${PORT}${nodeReq.url ?? "/"}`;

    const headers: [string, string][] = [];
    const raw = nodeReq.rawHeaders;
    for (let i = 0; i < raw.length; i += 2) {
      headers.push([raw[i], raw[i + 1]]);
    }

    const hasBody =
      bodyBuf.length > 0 &&
      nodeReq.method !== "GET" &&
      nodeReq.method !== "HEAD";

    const request = new Request(url, {
      method: nodeReq.method ?? "GET",
      headers,
      body: hasBody ? bodyBuf : undefined,
    });

    const response = await fetchHandler(request, env);

    nodeRes.statusCode = response.status;
    for (const [key, value] of response.headers.entries()) {
      nodeRes.setHeader(key, value);
    }
    nodeRes.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error("Unhandled server error:", err);
    nodeRes.statusCode = 500;
    nodeRes.end(JSON.stringify({ error: "Internal server error" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`garmin-auth-worker listening on :${PORT}`);
});
