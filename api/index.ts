import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../artifacts/api-server/src/app";

// Vercel rewrites every /api/* route here. Restore the original path before
// handing the request to Express, so its existing /api routes and cookies work.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.searchParams.get("__eva_path");
  if (path === null) {
    res.statusCode = 404;
    res.end();
    return;
  }

  url.searchParams.delete("__eva_path");
  req.url = `/api/${path.replace(/^\/+/, "")}${url.search}`;
  app(req, res);
}
