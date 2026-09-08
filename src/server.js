import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { bootstrapAccount } from './auth.js';

const pool = createPool();
await bootstrapAccount(pool);
const port = Number(process.env.PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
const server = createApp({ pool }).listen(port, "0.0.0.0", () => {
  console.log(`Fantasy UCL Tracker API listening on port ${port}`);
});
server.on("error", (error) => {
  console.error("Unable to start API:", error.message);
  process.exit(1);
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(async () => {
    await pool?.end();
    clearTimeout(timeout);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
