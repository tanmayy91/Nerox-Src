import express from "express";
import { log } from "../../logger.js";

/**
 * Allowed Josh DB collection names (flat + nested).
 * Nested collections use slash notation (e.g. "stats/songsPlayed").
 */
const ALLOWED_COLLECTIONS = [
  "noPrefix",
  "ticket",
  "botmods",
  "giveaway",
  "msgCount",
  "botstaff",
  "redeemCode",
  "serverstaff",
  "ignore",
  "bypass",
  "blacklist",
  "config",
  "prefix",
  "afk",
  "spotify",
  "likedSongs",
  "userPreferences",
  "twoFourSeven",
  "stats/songsPlayed",
  "stats/commandsUsed",
  "stats/friends",
];

/**
 * Map a collection name to the correct josh instance on client.db.
 * Nested paths use dot notation on the object (e.g. "stats/songsPlayed" → client.db.stats.songsPlayed).
 */
function resolveCollection(db, name) {
  const parts = name.split("/");
  let ref = db;
  for (const part of parts) {
    if (ref == null || typeof ref !== "object") return null;
    ref = ref[part];
  }
  return ref ?? null;
}

/**
 * Middleware: verify the request carries a valid API key.
 * Accepts the key via the `x-api-key` header or the `apiKey` query param.
 */
function authenticate(apiKey) {
  return (req, res, next) => {
    const provided =
      req.headers["x-api-key"] || req.query.apiKey;
    if (!provided || provided !== apiKey) {
      return res.status(401).json({ error: "Unauthorized: invalid API key." });
    }
    next();
  };
}

/**
 * Start the REST API server that exposes the bot's Josh DB.
 *
 * Available endpoints (all require the API key):
 *   GET  /api/db                        → list available collections
 *   GET  /api/db/:collection            → get all entries in a collection
 *   GET  /api/db/:collection/:key       → get one entry
 *   POST /api/db/:collection/:key       → set one entry  (body: { value: … })
 *   DELETE /api/db/:collection/:key     → delete one entry
 *
 * @param {import("../../bot/structures/client.js").ExtendedClient} client
 */
export function startApiServer(client) {
  const port = process.env.API_PORT || 3000;
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    log(
      "API_KEY is not set in environment variables. The REST API will NOT start.",
      "warn",
    );
    return;
  }

  const app = express();
  app.use(express.json());

  const auth = authenticate(apiKey);

  // List available collections
  app.get("/api/db", auth, (_req, res) => {
    res.json({ collections: ALLOWED_COLLECTIONS });
  });

  // Get all entries in a collection
  app.get("/api/db/:collection", auth, async (req, res) => {
    const name = req.params.collection;
    if (!ALLOWED_COLLECTIONS.includes(name)) {
      return res.status(404).json({ error: `Collection "${name}" not found.` });
    }
    try {
      const col = resolveCollection(client.db, name);
      if (!col) return res.status(404).json({ error: `Collection "${name}" not found.` });
      const data = await col.getAll();
      res.json({ collection: name, data });
    } catch (err) {
      log(`API error on GET /api/db/${name}: ${err.message}`, "error");
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Get one entry
  app.get("/api/db/:collection/:key", auth, async (req, res) => {
    const { collection: name, key } = req.params;
    if (!ALLOWED_COLLECTIONS.includes(name)) {
      return res.status(404).json({ error: `Collection "${name}" not found.` });
    }
    try {
      const col = resolveCollection(client.db, name);
      if (!col) return res.status(404).json({ error: `Collection "${name}" not found.` });
      const value = await col.get(key);
      if (value === null || value === undefined) {
        return res.status(404).json({ error: `Key "${key}" not found.` });
      }
      res.json({ collection: name, key, value });
    } catch (err) {
      log(`API error on GET /api/db/${name}/${key}: ${err.message}`, "error");
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Set one entry
  app.post("/api/db/:collection/:key", auth, async (req, res) => {
    const { collection: name, key } = req.params;
    if (!ALLOWED_COLLECTIONS.includes(name)) {
      return res.status(404).json({ error: `Collection "${name}" not found.` });
    }
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: 'Request body must contain a "value" field.' });
    }
    try {
      const col = resolveCollection(client.db, name);
      if (!col) return res.status(404).json({ error: `Collection "${name}" not found.` });
      await col.set(key, value);
      res.json({ collection: name, key, value });
    } catch (err) {
      log(`API error on POST /api/db/${name}/${key}: ${err.message}`, "error");
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // Delete one entry
  app.delete("/api/db/:collection/:key", auth, async (req, res) => {
    const { collection: name, key } = req.params;
    if (!ALLOWED_COLLECTIONS.includes(name)) {
      return res.status(404).json({ error: `Collection "${name}" not found.` });
    }
    try {
      const col = resolveCollection(client.db, name);
      if (!col) return res.status(404).json({ error: `Collection "${name}" not found.` });
      await col.delete(key);
      res.json({ collection: name, key, deleted: true });
    } catch (err) {
      log(`API error on DELETE /api/db/${name}/${key}: ${err.message}`, "error");
      res.status(500).json({ error: "Internal server error." });
    }
  });

  app.listen(port, () => {
    log(`REST API server listening on port ${port}`, "info");
  });
}
