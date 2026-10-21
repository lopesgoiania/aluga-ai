import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["API_PORT"] ?? process.env["PORT"] ?? "5050";

const port = Number(rawPort);
const host = process.env["PANEL_HOST"] ?? "127.0.0.1";

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");
});
