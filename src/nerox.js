/**
 * @nerox v1.0.0
 * @author Tanmay
 * @copyright 2024 Nerox - Services
 */

import { loadAntiCrash } from "./lib/utils/anticrash.js";
import { ExtendedClient } from "./bot/structures/client.js";
import { connectMongoDB } from "./lib/services/josh.js";

console.clear();

// Load anti-crash handler
loadAntiCrash();

// Initialize client (db table instances are lazy — no connection yet)
const client = new ExtendedClient();

// Connect to MongoDB first, then log in to Discord.
// This ensures the cache is available the moment the bot becomes ready.
connectMongoDB()
  .then(() => client.connectToGateway())
  .catch((err) => {
    console.error("[MongoDB] Failed to connect:", err);
    process.exit(1);
  });

export default client;
