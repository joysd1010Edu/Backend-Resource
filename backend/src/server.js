/* ==========  backend/src/server.js  ===============*/
const dotenv = require("dotenv");
dotenv.config();
dotenv.config({ path: ".env.local" });

const app = require("./app");
const { connectToDatabase, closeDatabase } = require("./config/db");
const { syncAllIndexes } = require("./models");

const port = Number(process.env.PORT) || 5000;
const shouldSyncIndexes = process.env.SYNC_INDEXES === "true";
const isProduction = process.env.NODE_ENV === "production";

function logInfo(message) {
  if (!isProduction) {
    console.log(message);
  }
}

/* ==========  Function startServer contains reusable module logic used by this feature.  ===============*/
async function startServer() {
  try {
    await connectToDatabase();
    if (shouldSyncIndexes) {
      await syncAllIndexes();
      logInfo("Mongoose indexes synced");
    }

    const server = app.listen(port, () => {
      logInfo(`Server is running on port ${port}`);
    });

    /* ==========  Function gracefulShutdown contains reusable module logic used by this feature.  ===============*/
    const gracefulShutdown = (signal) => {
      logInfo(`${signal} received. Closing server...`);
      server.close(async () => {
        await closeDatabase();
        process.exit(0);
      });
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});
