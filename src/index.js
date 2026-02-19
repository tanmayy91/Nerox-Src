import { config } from "dotenv";
import { log } from "./logger.js";
import { availableParallelism } from "node:os";
import { ClusterManager, HeartbeatManager } from "discord-hybrid-sharding";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load Environment Variables
config();

const mainFile = "./nerox.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, mainFile);

const clusterManager = new ClusterManager(file, {
  respawn: true,
  mode: "process",
  restarts: {
    max: 10,
    interval: 10_000,
  },
  totalShards: 1, // Changed from 'auto' to 1 to avoid rate limiting
  totalClusters: 1, // Reduced from availableParallelism() to 1 to minimize resource usage
  token: process.env.DISCORD_TOKEN,
});

// Heartbeat Manager
clusterManager.extend(
  new HeartbeatManager({
    interval: 2000,
    maxMissedHeartbeats: 5,
  }),
);

// Spawn Clusters
clusterManager.spawn({ timeout: -1 });

log("Bot started successfully!", "info");
