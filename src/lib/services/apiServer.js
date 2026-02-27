import os from "os";
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
 * Start the REST API server that exposes the bot's Josh DB and live KPI data.
 *
 * All endpoints require the API key (x-api-key header or ?apiKey query param).
 *
 * DB endpoints:
 *   GET    /api/db                        → list available collections
 *   GET    /api/db/:collection            → get all entries in a collection
 *   GET    /api/db/:collection/:key       → get one entry
 *   POST   /api/db/:collection/:key       → set one entry  (body: { value: … })
 *   DELETE /api/db/:collection/:key       → delete one entry
 *
 * KPI endpoints (live data, read-only):
 *   GET    /api/kpi/overview              → guilds, users, players, uptime, ping
 *   GET    /api/kpi/system               → CPU %, memory, platform, Node.js version
 *   GET    /api/kpi/shards               → per-shard ping, guilds, status
 *   GET    /api/kpi/players              → active music players with current track
 *   GET    /api/kpi/guilds               → full server list sorted by member count
 *   GET    /api/kpi/stats               → aggregated songs-played & commands-used totals
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
      const data = await col.get(col.all);
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

  // ── KPI endpoints ───────────────────────────────────────────────────────────

  /**
   * GET /api/kpi/overview
   * Main dashboard headline numbers.
   */
  app.get("/api/kpi/overview", auth, async (_req, res) => {
    try {
      const totalUsers = client.guilds.cache.reduce(
        (sum, g) => sum + g.memberCount,
        0,
      );
      res.json({
        guilds: client.guilds.cache.size,
        users: totalUsers,
        channels: client.channels.cache.size,
        activePlayers: client.manager?.players?.size ?? 0,
        commandsLoaded: client.commands.size,
        uptimeMs: client.uptime ?? 0,
        wsPingMs: client.ws.ping,
        underMaintenance: client.underMaintenance,
      });
    } catch (err) {
      log(`API error on GET /api/kpi/overview: ${err.message}`, "error");
      res.status(500).json({ error: "Internal server error." });
    }
  });

  /**
   * GET /api/kpi/system
   * Host process / hardware metrics.
   */
  app.get("/api/kpi/system", auth, async (_req, res) => {
    try {
      const cpuUsageModule = (await import("os-utils")).default;
      const cpuPercent = await new Promise((resolve) =>
        cpuUsageModule.cpuUsage(resolve),
      );
      const mem = process.memoryUsage();
      res.json({
        cpuPercent: parseFloat((cpuPercent * 100).toFixed(2)),
        memoryHeapUsedBytes: mem.heapUsed,
        memoryHeapTotalBytes: mem.heapTotal,
        memoryRssBytes: mem.rss,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid,
        cpuModel: os.cpus()[0]?.model ?? "unknown",
        hostname: os.hostname(),
      });
    } catch (err) {
      log(`API error on GET /api/kpi/system: ${err.message}`, "error");
      res.status(500).json({ error: "Internal server error." });
    }
  });

  /**
   * GET /api/kpi/shards
   * Per-shard guild count, ping and connection status.
   */
  app.get("/api/kpi/shards", auth, async (_req, res) => {
    try {
      const shards = await client.cluster.broadcastEval((c) => ({
        shardId: c.ws.shards.first()?.id ?? 0,
        ping: c.ws.ping,
        guilds: c.guilds.cache.size,
        status: c.ws.status,
      }));
      res.json({ totalShards: client.options.shardCount ?? 1, shards });
    } catch (err) {
      log(`API error on GET /api/kpi/shards: ${err.message}`, "error");
      res.status(500).json({ error: "Internal server error." });
    }
  });

  /**
   * GET /api/kpi/players
   * List of every active music player with its current track and queue info.
   */
  app.get("/api/kpi/players", auth, (_req, res) => {
    try {
      const players = [];
      for (const [guildId, player] of (client.manager?.players ?? new Map())) {
        const current = player.queue?.current;
        players.push({
          guildId,
          guildName: client.guilds.cache.get(guildId)?.name ?? null,
          paused: player.paused,
          volume: player.volume,
          positionMs: player.position,
          queueLength: player.queue?.size ?? 0,
          currentTrack: current
            ? {
                title: current.title,
                author: current.author,
                uri: current.uri,
                durationMs: current.length,
                thumbnail: current.thumbnail ?? null,
                isStream: current.isStream,
                requester: current.requester?.id ?? null,
              }
            : null,
        });
      }
      res.json({ count: players.length, players });
    } catch (err) {
      log(`API error on GET /api/kpi/players: ${err.message}`, "error");
      res.status(500).json({ error: "Internal server error." });
    }
  });

  /**
   * GET /api/kpi/guilds
   * Full server list sorted by member count (descending).
   */
  app.get("/api/kpi/guilds", auth, (_req, res) => {
    try {
      const guilds = [...client.guilds.cache.values()]
        .sort((a, b) => b.memberCount - a.memberCount)
        .map((g) => ({
          id: g.id,
          name: g.name,
          memberCount: g.memberCount,
          ownerId: g.ownerId,
          icon: g.iconURL({ dynamic: true }) ?? null,
          joinedAt: g.joinedAt,
        }));
      res.json({ count: guilds.length, guilds });
    } catch (err) {
      log(`API error on GET /api/kpi/guilds: ${err.message}`, "error");
      res.status(500).json({ error: "Internal server error." });
    }
  });

  /**
   * GET /api/kpi/stats
   * Aggregated totals pulled from the Josh DB stats collections.
   */
  app.get("/api/kpi/stats", auth, async (_req, res) => {
    try {
      const [songsPlayed, commandsUsed] = await Promise.all([
        client.db.stats.songsPlayed.get(client.db.stats.songsPlayed.all),
        client.db.stats.commandsUsed.get(client.db.stats.commandsUsed.all),
      ]);

      const sumValues = (obj) =>
        Object.values(obj ?? {}).reduce((acc, v) => acc + (Number(v) || 0), 0);

      const toObject = (obj) => obj ?? {};

      res.json({
        totalSongsPlayed: sumValues(songsPlayed),
        totalCommandsUsed: sumValues(commandsUsed),
        perGuildSongsPlayed: toObject(songsPlayed),
        perGuildCommandsUsed: toObject(commandsUsed),
      });
    } catch (err) {
      log(`API error on GET /api/kpi/stats: ${err.message}`, "error");
      res.status(500).json({ error: "Internal server error." });
    }
  });

  // ── server start ─────────────────────────────────────────────────────────────

  app.listen(port, () => {
    log(`REST API server listening on port ${port}`, "info");
  });
}
