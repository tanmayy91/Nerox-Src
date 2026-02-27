import os from "os";
import express from "express";
import { log } from "../../logger.js";
import {
  getAllEntries,
  getAllKeys,
  getCount,
  safeGet,
  safeHas,
} from "../utils/dbUtils.js";

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

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
 * Read-only collections that cannot be modified via API.
 */
const READ_ONLY_COLLECTIONS = ["config", "stats/songsPlayed", "stats/commandsUsed", "stats/friends"];

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Map a collection name to the correct Josh instance on client.db.
 * Nested paths use slash notation (e.g. "stats/songsPlayed" → client.db.stats.songsPlayed).
 * @param {object} db - The client.db object.
 * @param {string} name - Collection name (supports slash notation for nested).
 * @returns {object|null} The Josh collection instance or null.
 */
function resolveCollection(db, name) {
  if (!db || !name) return null;
  const parts = name.split("/");
  let ref = db;
  for (const part of parts) {
    if (ref == null || typeof ref !== "object") return null;
    ref = ref[part];
  }
  return ref ?? null;
}

/**
 * Validate that a collection name is allowed.
 * @param {string} name - Collection name to validate.
 * @returns {boolean} Whether the collection is allowed.
 */
function isValidCollection(name) {
  return ALLOWED_COLLECTIONS.includes(name);
}

/**
 * Check if a collection is read-only.
 * @param {string} name - Collection name to check.
 * @returns {boolean} Whether the collection is read-only.
 */
function isReadOnly(name) {
  return READ_ONLY_COLLECTIONS.includes(name);
}

/**
 * Format bytes to human readable string.
 * @param {number} bytes - Bytes to format.
 * @returns {string} Formatted string.
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format milliseconds to human readable duration.
 * @param {number} ms - Milliseconds to format.
 * @returns {string} Formatted string.
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

// ══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * CORS middleware for cross-origin requests.
 */
function corsMiddleware(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-api-key");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
}

/**
 * Request logging middleware.
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    log(`API ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, "debug");
  });
  next();
}

/**
 * Authentication middleware.
 * Accepts the key via the `x-api-key` header (recommended) or the `apiKey` query param.
 * Note: Using query params for API keys is less secure as they may appear in logs.
 * Prefer using the x-api-key header for production use.
 * @param {string} apiKey - The required API key.
 * @returns {Function} Express middleware function.
 */
function authenticate(apiKey) {
  return (req, res, next) => {
    // Prefer header over query param for security (headers don't appear in logs/URLs)
    const provided = req.headers["x-api-key"] || req.query.apiKey;
    if (!provided || provided !== apiKey) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Invalid or missing API key. Provide via x-api-key header (recommended) or apiKey query param.",
      });
    }
    next();
  };
}

/**
 * Simple in-memory rate limiter.
 * @param {number} windowMs - Time window in milliseconds.
 * @param {number} maxRequests - Maximum requests per window.
 * @returns {Function} Express middleware function.
 */
function rateLimiter(windowMs = 60000, maxRequests = 100) {
  const requests = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!requests.has(ip)) {
      requests.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    const record = requests.get(ip);
    if (now > record.resetAt) {
      record.count = 1;
      record.resetAt = now + windowMs;
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: "Too Many Requests",
        message: `Rate limit exceeded. Try again in ${Math.ceil((record.resetAt - now) / 1000)}s.`,
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      });
    }

    record.count++;
    next();
  };
}

/**
 * Error handling middleware.
 */
function errorHandler(err, req, res, _next) {
  log(`API Error: ${err.message}`, "error");
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : "An unexpected error occurred.",
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// API RESPONSE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Create a success response.
 * @param {object} data - Response data.
 * @returns {object} Formatted response.
 */
function successResponse(data) {
  return { success: true, timestamp: new Date().toISOString(), ...data };
}

/**
 * Create an error response.
 * @param {string} error - Error type.
 * @param {string} message - Error message.
 * @returns {object} Formatted response.
 */
function errorResponse(error, message) {
  return { success: false, timestamp: new Date().toISOString(), error, message };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN API SERVER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Start the REST API server that exposes the bot's Josh DB and live KPI data.
 *
 * All endpoints require the API key (x-api-key header or ?apiKey query param).
 *
 * API Endpoints:
 *
 * Health & Info:
 *   GET /api                           → API info and available endpoints
 *   GET /api/health                    → Health check
 *
 * Database:
 *   GET /api/db                        → List available collections
 *   GET /api/db/:collection            → Get all entries in a collection
 *   GET /api/db/:collection/keys       → Get all keys in a collection
 *   GET /api/db/:collection/count      → Get entry count in a collection
 *   GET /api/db/:collection/:key       → Get one entry
 *   GET /api/db/:collection/:key/exists → Check if key exists
 *   POST /api/db/:collection/:key      → Set one entry (body: { value: ... })
 *   DELETE /api/db/:collection/:key    → Delete one entry
 *
 * KPI (Key Performance Indicators):
 *   GET /api/kpi/overview              → Dashboard headline numbers
 *   GET /api/kpi/system                → System/host metrics
 *   GET /api/kpi/shards                → Per-shard statistics
 *   GET /api/kpi/players               → Active music players
 *   GET /api/kpi/guilds                → Server list
 *   GET /api/kpi/stats                 → Aggregated bot statistics
 *   GET /api/kpi/premium               → Premium users and servers
 *   GET /api/kpi/commands              → Command statistics
 *
 * @param {import("../../bot/structures/client.js").ExtendedClient} client
 */
export function startApiServer(client) {
  const port = process.env.API_PORT || 3000;
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    log("API_KEY is not set in environment variables. The REST API will NOT start.", "warn");
    return;
  }

  const app = express();

  // ── Global Middleware ───────────────────────────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(corsMiddleware);
  app.use(requestLogger);
  app.use(rateLimiter(60000, 200)); // 200 requests per minute

  const auth = authenticate(apiKey);

  // ══════════════════════════════════════════════════════════════════════════════
  // HEALTH & INFO ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api
   * API information and available endpoints.
   */
  app.get("/api", (_req, res) => {
    res.json(
      successResponse({
        name: "Nerox Bot API",
        version: "2.1.0",
        authentication: {
          method: "API Key",
          header: "x-api-key (recommended)",
          queryParam: "apiKey (less secure, may appear in logs)",
        },
        endpoints: {
          health: "GET /api/health",
          bot: "GET /api/bot",
          database: {
            list: "GET /api/db",
            getAll: "GET /api/db/:collection",
            getKeys: "GET /api/db/:collection/keys",
            getCount: "GET /api/db/:collection/count",
            getOne: "GET /api/db/:collection/:key",
            exists: "GET /api/db/:collection/:key/exists",
            set: "POST /api/db/:collection/:key",
            delete: "DELETE /api/db/:collection/:key",
          },
          user: {
            getUser: "GET /api/user/:userId (includes mutual servers)",
          },
          guild: {
            getGuild: "GET /api/guild/:guildId",
            getMember: "GET /api/guild/:guildId/member/:userId",
            getChannels: "GET /api/guild/:guildId/channels",
            getRoles: "GET /api/guild/:guildId/roles",
          },
          voice: {
            getConnections: "GET /api/voice",
          },
          lavalink: {
            getNodes: "GET /api/lavalink",
          },
          kpi: {
            overview: "GET /api/kpi/overview",
            system: "GET /api/kpi/system",
            shards: "GET /api/kpi/shards",
            players: "GET /api/kpi/players",
            guilds: "GET /api/kpi/guilds",
            stats: "GET /api/kpi/stats",
            premium: "GET /api/kpi/premium",
            commands: "GET /api/kpi/commands",
          },
        },
      }),
    );
  });

  /**
   * GET /api/health
   * Health check endpoint.
   */
  app.get("/api/health", (_req, res) => {
    const isHealthy = client.isReady() && client.ws.ping > 0;
    res.status(isHealthy ? 200 : 503).json(
      successResponse({
        status: isHealthy ? "healthy" : "unhealthy",
        bot: {
          ready: client.isReady(),
          ping: client.ws.ping,
          uptime: client.uptime ?? 0,
          uptimeFormatted: formatUptime(client.uptime ?? 0),
        },
        database: {
          connected: !!client.db,
          collections: ALLOWED_COLLECTIONS.length,
        },
      }),
    );
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // DATABASE ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/db
   * List all available database collections.
   */
  app.get("/api/db", auth, (_req, res) => {
    res.json(
      successResponse({
        collections: ALLOWED_COLLECTIONS,
        readOnlyCollections: READ_ONLY_COLLECTIONS,
        totalCollections: ALLOWED_COLLECTIONS.length,
      }),
    );
  });

  /**
   * GET /api/db/:collection
   * Get all entries in a collection.
   */
  app.get("/api/db/:collection", auth, async (req, res) => {
    const name = req.params.collection;

    if (!isValidCollection(name)) {
      return res.status(404).json(errorResponse("Not Found", `Collection "${name}" not found.`));
    }

    try {
      const col = resolveCollection(client.db, name);
      if (!col) {
        return res.status(404).json(errorResponse("Not Found", `Collection "${name}" could not be resolved.`));
      }

      const data = await getAllEntries(col);
      const count = Object.keys(data).length;

      res.json(
        successResponse({
          collection: name,
          count,
          data,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/db/${name}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Database Error", "Failed to retrieve collection data."));
    }
  });

  /**
   * GET /api/db/:collection/keys
   * Get all keys in a collection.
   */
  app.get("/api/db/:collection/keys", auth, async (req, res) => {
    const name = req.params.collection;

    if (!isValidCollection(name)) {
      return res.status(404).json(errorResponse("Not Found", `Collection "${name}" not found.`));
    }

    try {
      const col = resolveCollection(client.db, name);
      if (!col) {
        return res.status(404).json(errorResponse("Not Found", `Collection "${name}" could not be resolved.`));
      }

      const keys = await getAllKeys(col);

      res.json(
        successResponse({
          collection: name,
          count: keys.length,
          keys,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/db/${name}/keys: ${err.message}`, "error");
      res.status(500).json(errorResponse("Database Error", "Failed to retrieve collection keys."));
    }
  });

  /**
   * GET /api/db/:collection/count
   * Get entry count in a collection.
   */
  app.get("/api/db/:collection/count", auth, async (req, res) => {
    const name = req.params.collection;

    if (!isValidCollection(name)) {
      return res.status(404).json(errorResponse("Not Found", `Collection "${name}" not found.`));
    }

    try {
      const col = resolveCollection(client.db, name);
      if (!col) {
        return res.status(404).json(errorResponse("Not Found", `Collection "${name}" could not be resolved.`));
      }

      const count = await getCount(col);

      res.json(
        successResponse({
          collection: name,
          count,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/db/${name}/count: ${err.message}`, "error");
      res.status(500).json(errorResponse("Database Error", "Failed to count collection entries."));
    }
  });

  /**
   * GET /api/db/:collection/:key/exists
   * Check if a key exists in a collection.
   */
  app.get("/api/db/:collection/:key/exists", auth, async (req, res) => {
    const { collection: name, key } = req.params;

    if (!isValidCollection(name)) {
      return res.status(404).json(errorResponse("Not Found", `Collection "${name}" not found.`));
    }

    try {
      const col = resolveCollection(client.db, name);
      if (!col) {
        return res.status(404).json(errorResponse("Not Found", `Collection "${name}" could not be resolved.`));
      }

      const exists = await safeHas(col, key);

      res.json(
        successResponse({
          collection: name,
          key,
          exists,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/db/${name}/${key}/exists: ${err.message}`, "error");
      res.status(500).json(errorResponse("Database Error", "Failed to check key existence."));
    }
  });

  /**
   * GET /api/db/:collection/:key
   * Get one entry from a collection.
   */
  app.get("/api/db/:collection/:key", auth, async (req, res) => {
    const { collection: name, key } = req.params;

    if (!isValidCollection(name)) {
      return res.status(404).json(errorResponse("Not Found", `Collection "${name}" not found.`));
    }

    try {
      const col = resolveCollection(client.db, name);
      if (!col) {
        return res.status(404).json(errorResponse("Not Found", `Collection "${name}" could not be resolved.`));
      }

      const value = await safeGet(col, key);
      if (value === null) {
        return res.status(404).json(errorResponse("Not Found", `Key "${key}" not found in collection "${name}".`));
      }

      res.json(
        successResponse({
          collection: name,
          key,
          value,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/db/${name}/${key}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Database Error", "Failed to retrieve entry."));
    }
  });

  /**
   * POST /api/db/:collection/:key
   * Set one entry in a collection.
   */
  app.post("/api/db/:collection/:key", auth, async (req, res) => {
    const { collection: name, key } = req.params;

    if (!isValidCollection(name)) {
      return res.status(404).json(errorResponse("Not Found", `Collection "${name}" not found.`));
    }

    if (isReadOnly(name)) {
      return res.status(403).json(errorResponse("Forbidden", `Collection "${name}" is read-only.`));
    }

    const { value } = req.body ?? {};
    if (value === undefined) {
      return res.status(400).json(errorResponse("Bad Request", 'Request body must contain a "value" field.'));
    }

    try {
      const col = resolveCollection(client.db, name);
      if (!col) {
        return res.status(404).json(errorResponse("Not Found", `Collection "${name}" could not be resolved.`));
      }

      await col.set(key, value);

      res.json(
        successResponse({
          collection: name,
          key,
          value,
          action: "created",
        }),
      );
    } catch (err) {
      log(`API error on POST /api/db/${name}/${key}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Database Error", "Failed to set entry."));
    }
  });

  /**
   * DELETE /api/db/:collection/:key
   * Delete one entry from a collection.
   */
  app.delete("/api/db/:collection/:key", auth, async (req, res) => {
    const { collection: name, key } = req.params;

    if (!isValidCollection(name)) {
      return res.status(404).json(errorResponse("Not Found", `Collection "${name}" not found.`));
    }

    if (isReadOnly(name)) {
      return res.status(403).json(errorResponse("Forbidden", `Collection "${name}" is read-only.`));
    }

    try {
      const col = resolveCollection(client.db, name);
      if (!col) {
        return res.status(404).json(errorResponse("Not Found", `Collection "${name}" could not be resolved.`));
      }

      const exists = await safeHas(col, key);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", `Key "${key}" not found in collection "${name}".`));
      }

      await col.delete(key);

      res.json(
        successResponse({
          collection: name,
          key,
          deleted: true,
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/db/${name}/${key}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Database Error", "Failed to delete entry."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // KPI ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/kpi/overview
   * Main dashboard headline numbers.
   */
  app.get("/api/kpi/overview", auth, async (_req, res) => {
    try {
      const totalUsers = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);
      const totalSongsPlayed = await safeGet(client.db.stats.songsPlayed, "total", 0);
      const totalCommandsUsed = await safeGet(client.db.stats.commandsUsed, "total", 0);

      res.json(
        successResponse({
          guilds: client.guilds.cache.size,
          users: totalUsers,
          channels: client.channels.cache.size,
          activePlayers: client.manager?.players?.size ?? 0,
          commandsLoaded: client.commands.size,
          totalSongsPlayed,
          totalCommandsUsed,
          uptimeMs: client.uptime ?? 0,
          uptimeFormatted: formatUptime(client.uptime ?? 0),
          wsPingMs: client.ws.ping,
          underMaintenance: client.underMaintenance ?? false,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/kpi/overview: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch overview data."));
    }
  });

  /**
   * GET /api/kpi/system
   * Host process / hardware metrics.
   */
  app.get("/api/kpi/system", auth, async (_req, res) => {
    try {
      const cpuUsageModule = (await import("os-utils")).default;
      const cpuPercent = await new Promise((resolve) => cpuUsageModule.cpuUsage(resolve));

      const mem = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      res.json(
        successResponse({
          cpu: {
            percent: parseFloat((cpuPercent * 100).toFixed(2)),
            model: os.cpus()[0]?.model ?? "unknown",
            cores: os.cpus().length,
            loadAverage: os.loadavg(),
          },
          memory: {
            process: {
              heapUsed: mem.heapUsed,
              heapUsedFormatted: formatBytes(mem.heapUsed),
              heapTotal: mem.heapTotal,
              heapTotalFormatted: formatBytes(mem.heapTotal),
              rss: mem.rss,
              rssFormatted: formatBytes(mem.rss),
              external: mem.external,
              externalFormatted: formatBytes(mem.external),
            },
            system: {
              total: totalMem,
              totalFormatted: formatBytes(totalMem),
              free: freeMem,
              freeFormatted: formatBytes(freeMem),
              used: usedMem,
              usedFormatted: formatBytes(usedMem),
              percentUsed: parseFloat(((usedMem / totalMem) * 100).toFixed(2)),
            },
          },
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          pid: process.pid,
          hostname: os.hostname(),
          uptime: os.uptime(),
          uptimeFormatted: formatUptime(os.uptime() * 1000),
        }),
      );
    } catch (err) {
      log(`API error on GET /api/kpi/system: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch system metrics."));
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
        users: c.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0),
        status: c.ws.status,
        uptime: c.uptime,
      }));

      const totalGuilds = shards.reduce((sum, s) => sum + s.guilds, 0);
      const totalUsers = shards.reduce((sum, s) => sum + s.users, 0);
      const avgPing = shards.reduce((sum, s) => sum + s.ping, 0) / shards.length;

      res.json(
        successResponse({
          totalShards: client.options.shardCount ?? 1,
          summary: {
            totalGuilds,
            totalUsers,
            averagePing: Math.round(avgPing),
          },
          shards,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/kpi/shards: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch shard data."));
    }
  });

  /**
   * GET /api/kpi/players
   * List of every active music player with its current track and queue info.
   */
  app.get("/api/kpi/players", auth, (_req, res) => {
    try {
      const players = [];
      const playerMap = client.manager?.players ?? new Map();

      for (const [guildId, player] of playerMap) {
        const current = player.queue?.current;
        const guild = client.guilds.cache.get(guildId);

        players.push({
          guildId,
          guildName: guild?.name ?? null,
          guildIcon: guild?.iconURL({ forceStatic: false }) ?? null,
          state: {
            paused: player.paused,
            playing: player.playing,
            volume: player.volume,
            loop: player.loop,
            positionMs: player.position,
            is247: player.data?.get("247") ?? false,
            autoplay: player.data?.get("autoplayStatus") ?? false,
          },
          queue: {
            length: player.queue?.size ?? 0,
            totalDurationMs: player.queue?.reduce((sum, t) => sum + (t.length || 0), 0) ?? 0,
          },
          currentTrack: current
            ? {
                title: current.title,
                author: current.author,
                uri: current.uri,
                durationMs: current.length,
                thumbnail: current.thumbnail ?? null,
                isStream: current.isStream,
                sourceName: current.sourceName ?? null,
                requester: {
                  id: current.requester?.id ?? null,
                  username: current.requester?.username ?? null,
                },
              }
            : null,
          voiceChannel: {
            id: player.voiceId,
            name: client.channels.cache.get(player.voiceId)?.name ?? null,
          },
          textChannel: {
            id: player.textId,
            name: client.channels.cache.get(player.textId)?.name ?? null,
          },
        });
      }

      res.json(
        successResponse({
          count: players.length,
          totalQueuedTracks: players.reduce((sum, p) => sum + p.queue.length, 0),
          players,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/kpi/players: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch player data."));
    }
  });

  /**
   * GET /api/kpi/guilds
   * Full server list sorted by member count (descending).
   */
  app.get("/api/kpi/guilds", auth, (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      const offset = parseInt(req.query.offset) || 0;
      const sortBy = req.query.sortBy || "memberCount";
      const order = req.query.order === "asc" ? 1 : -1;

      let guilds = [...client.guilds.cache.values()];

      // Sort
      guilds.sort((a, b) => {
        switch (sortBy) {
          case "name":
            return order * a.name.localeCompare(b.name);
          case "joinedAt":
            return order * (a.joinedTimestamp - b.joinedTimestamp);
          case "memberCount":
          default:
            return order * (a.memberCount - b.memberCount);
        }
      });

      const total = guilds.length;
      guilds = guilds.slice(offset, offset + limit);

      const mapped = guilds.map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberCount,
        ownerId: g.ownerId,
        icon: g.iconURL({ forceStatic: false }) ?? null,
        banner: g.bannerURL({ forceStatic: false }) ?? null,
        joinedAt: g.joinedAt,
        createdAt: g.createdAt,
        premiumTier: g.premiumTier,
        premiumSubscriptionCount: g.premiumSubscriptionCount,
      }));

      res.json(
        successResponse({
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
          guilds: mapped,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/kpi/guilds: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch guild data."));
    }
  });

  /**
   * GET /api/kpi/stats
   * Aggregated totals pulled from the Josh DB stats collections.
   */
  app.get("/api/kpi/stats", auth, async (_req, res) => {
    try {
      const [songsPlayed, commandsUsed] = await Promise.all([
        getAllEntries(client.db.stats.songsPlayed),
        getAllEntries(client.db.stats.commandsUsed),
      ]);

      // Get totals
      const totalSongsPlayed = songsPlayed.total ?? 0;
      const totalCommandsUsed = commandsUsed.total ?? 0;

      // Filter out special keys to get per-entity stats
      const specialKeys = ["total"];

      const filterStats = (obj) => {
        const filtered = {};
        for (const [key, value] of Object.entries(obj)) {
          if (!specialKeys.includes(key)) {
            filtered[key] = value;
          }
        }
        return filtered;
      };

      const perEntitySongs = filterStats(songsPlayed);
      const perEntityCommands = filterStats(commandsUsed);

      // Get top 10 for each
      const getTop = (obj, n = 10) =>
        Object.entries(obj)
          .sort(([, a], [, b]) => b - a)
          .slice(0, n)
          .map(([id, count]) => ({ id, count }));

      res.json(
        successResponse({
          totals: {
            songsPlayed: totalSongsPlayed,
            commandsUsed: totalCommandsUsed,
          },
          topSongsPlayed: getTop(perEntitySongs),
          topCommandsUsed: getTop(perEntityCommands),
          breakdown: {
            songsPlayed: perEntitySongs,
            commandsUsed: perEntityCommands,
          },
        }),
      );
    } catch (err) {
      log(`API error on GET /api/kpi/stats: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch statistics."));
    }
  });

  /**
   * GET /api/kpi/premium
   * Premium users and servers information.
   */
  app.get("/api/kpi/premium", auth, async (_req, res) => {
    try {
      const [premiumUsers, premiumServers, noPrefixUsers] = await Promise.all([
        getAllEntries(client.db.botstaff),
        getAllEntries(client.db.serverstaff),
        getAllEntries(client.db.noPrefix),
      ]);

      const now = Date.now();

      const formatPremiumData = (data) => {
        return Object.entries(data).map(([id, info]) => {
          const expires = info?.expires || info?.expiresAt;
          const isExpired = expires ? expires < now : false;
          return {
            id,
            expires,
            expiresFormatted: expires ? new Date(expires).toISOString() : null,
            isExpired,
            isLifetime: !expires,
          };
        });
      };

      res.json(
        successResponse({
          premiumUsers: {
            count: Object.keys(premiumUsers).length,
            users: formatPremiumData(premiumUsers),
          },
          premiumServers: {
            count: Object.keys(premiumServers).length,
            servers: formatPremiumData(premiumServers),
          },
          noPrefixUsers: {
            count: Object.keys(noPrefixUsers).length,
            users: formatPremiumData(noPrefixUsers),
          },
        }),
      );
    } catch (err) {
      log(`API error on GET /api/kpi/premium: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch premium data."));
    }
  });

  /**
   * GET /api/kpi/commands
   * Command statistics and usage information.
   */
  app.get("/api/kpi/commands", auth, (_req, res) => {
    try {
      const commands = [...client.commands.values()];

      const byCategory = {};
      commands.forEach((cmd) => {
        const category = cmd.category || "uncategorized";
        if (!byCategory[category]) {
          byCategory[category] = [];
        }
        byCategory[category].push({
          name: cmd.name,
          aliases: cmd.aliases || [],
          description: cmd.description || "",
          admin: cmd.admin || false,
          owner: cmd.owner || false,
          cooldown: cmd.cooldown || 0,
        });
      });

      res.json(
        successResponse({
          totalCommands: commands.length,
          categories: Object.keys(byCategory).length,
          byCategory,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/kpi/commands: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch command data."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // USER & GUILD INFO ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/user/:userId
   * Get information about a specific user including their mutual servers with the bot.
   */
  app.get("/api/user/:userId", auth, async (req, res) => {
    try {
      const { userId } = req.params;

      if (!userId || !/^\d{17,19}$/.test(userId)) {
        return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
      }

      // Try to fetch the user
      let user;
      try {
        user = await client.users.fetch(userId);
      } catch {
        return res.status(404).json(errorResponse("Not Found", "User not found."));
      }

      // Find mutual servers (servers where both the bot and user are present)
      const mutualGuilds = [];
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
          if (member) {
            mutualGuilds.push({
              id: guildId,
              name: guild.name,
              icon: guild.iconURL({ forceStatic: false }) ?? null,
              memberCount: guild.memberCount,
              ownerId: guild.ownerId,
              isOwner: guild.ownerId === userId,
              joinedAt: member.joinedAt,
              roles: member.roles.cache
                .filter((r) => r.id !== guild.id)
                .map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
              nickname: member.nickname,
              permissions: member.permissions.toArray(),
            });
          }
        } catch {
          // Skip guilds where we can't fetch the member
        }
      }

      res.json(
        successResponse({
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            discriminator: user.discriminator,
            avatar: user.displayAvatarURL({ forceStatic: false }),
            banner: user.bannerURL({ forceStatic: false }) ?? null,
            accentColor: user.accentColor ?? null,
            bot: user.bot,
            system: user.system,
            createdAt: user.createdAt,
          },
          mutualGuilds: {
            count: mutualGuilds.length,
            guilds: mutualGuilds,
          },
        }),
      );
    } catch (err) {
      log(`API error on GET /api/user/${req.params.userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch user data."));
    }
  });

  /**
   * GET /api/guild/:guildId
   * Get detailed information about a specific guild.
   */
  app.get("/api/guild/:guildId", auth, async (req, res) => {
    try {
      const { guildId } = req.params;

      if (!guildId || !/^\d{17,19}$/.test(guildId)) {
        return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json(errorResponse("Not Found", "Guild not found or bot is not a member."));
      }

      // Get owner info
      let owner;
      try {
        owner = await guild.fetchOwner();
      } catch {
        owner = null;
      }

      // Get channel counts by type
      const channels = {
        text: guild.channels.cache.filter((c) => c.type === 0).size,
        voice: guild.channels.cache.filter((c) => c.type === 2).size,
        category: guild.channels.cache.filter((c) => c.type === 4).size,
        announcement: guild.channels.cache.filter((c) => c.type === 5).size,
        stage: guild.channels.cache.filter((c) => c.type === 13).size,
        forum: guild.channels.cache.filter((c) => c.type === 15).size,
        total: guild.channels.cache.size,
      };

      // Get role info
      const roles = guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          position: r.position,
          members: r.members.size,
          mentionable: r.mentionable,
          hoist: r.hoist,
        }));

      // Get emoji info
      const emojis = {
        static: guild.emojis.cache.filter((e) => !e.animated).size,
        animated: guild.emojis.cache.filter((e) => e.animated).size,
        total: guild.emojis.cache.size,
      };

      res.json(
        successResponse({
          id: guild.id,
          name: guild.name,
          description: guild.description,
          icon: guild.iconURL({ forceStatic: false }) ?? null,
          banner: guild.bannerURL({ forceStatic: false }) ?? null,
          splash: guild.splashURL({ forceStatic: false }) ?? null,
          owner: owner
            ? {
                id: owner.id,
                username: owner.user.username,
                displayName: owner.displayName,
                avatar: owner.displayAvatarURL({ forceStatic: false }),
              }
            : { id: guild.ownerId },
          memberCount: guild.memberCount,
          premiumTier: guild.premiumTier,
          premiumSubscriptionCount: guild.premiumSubscriptionCount,
          verificationLevel: guild.verificationLevel,
          explicitContentFilter: guild.explicitContentFilter,
          features: guild.features,
          channels,
          roles: {
            count: roles.length,
            list: roles.slice(0, 50), // Limit to top 50 roles
          },
          emojis,
          createdAt: guild.createdAt,
          joinedAt: guild.joinedAt,
          vanityURLCode: guild.vanityURLCode,
          afkChannelId: guild.afkChannelId,
          afkTimeout: guild.afkTimeout,
          systemChannelId: guild.systemChannelId,
          rulesChannelId: guild.rulesChannelId,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/guild/${req.params.guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch guild data."));
    }
  });

  /**
   * GET /api/guild/:guildId/member/:userId
   * Get detailed information about a member in a specific guild.
   */
  app.get("/api/guild/:guildId/member/:userId", auth, async (req, res) => {
    try {
      const { guildId, userId } = req.params;

      if (!guildId || !/^\d{17,19}$/.test(guildId)) {
        return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
      }
      if (!userId || !/^\d{17,19}$/.test(userId)) {
        return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json(errorResponse("Not Found", "Guild not found."));
      }

      let member;
      try {
        member = guild.members.cache.get(userId) || await guild.members.fetch(userId);
      } catch {
        return res.status(404).json(errorResponse("Not Found", "Member not found in this guild."));
      }

      res.json(
        successResponse({
          user: {
            id: member.user.id,
            username: member.user.username,
            displayName: member.user.displayName,
            avatar: member.user.displayAvatarURL({ forceStatic: false }),
            bot: member.user.bot,
          },
          member: {
            nickname: member.nickname,
            displayName: member.displayName,
            avatar: member.displayAvatarURL({ forceStatic: false }),
            joinedAt: member.joinedAt,
            premiumSince: member.premiumSince,
            communicationDisabledUntil: member.communicationDisabledUntil,
            pending: member.pending,
            roles: member.roles.cache
              .filter((r) => r.id !== guild.id)
              .sort((a, b) => b.position - a.position)
              .map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
            permissions: member.permissions.toArray(),
            voice: member.voice.channelId
              ? {
                  channelId: member.voice.channelId,
                  channelName: member.voice.channel?.name ?? null,
                  deaf: member.voice.deaf,
                  mute: member.voice.mute,
                  selfDeaf: member.voice.selfDeaf,
                  selfMute: member.voice.selfMute,
                  streaming: member.voice.streaming,
                  selfVideo: member.voice.selfVideo,
                }
              : null,
          },
        }),
      );
    } catch (err) {
      log(`API error on GET /api/guild/${req.params.guildId}/member/${req.params.userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch member data."));
    }
  });

  /**
   * GET /api/guild/:guildId/channels
   * Get all channels in a specific guild.
   */
  app.get("/api/guild/:guildId/channels", auth, (req, res) => {
    try {
      const { guildId } = req.params;

      if (!guildId || !/^\d{17,19}$/.test(guildId)) {
        return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json(errorResponse("Not Found", "Guild not found."));
      }

      const channels = guild.channels.cache
        .sort((a, b) => a.position - b.position)
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          position: c.position,
          parentId: c.parentId,
          parentName: c.parent?.name ?? null,
          nsfw: c.nsfw ?? false,
          topic: c.topic ?? null,
          rateLimitPerUser: c.rateLimitPerUser ?? null,
          bitrate: c.bitrate ?? null,
          userLimit: c.userLimit ?? null,
        }));

      res.json(
        successResponse({
          guildId,
          guildName: guild.name,
          count: channels.length,
          channels,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/guild/${req.params.guildId}/channels: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch channel data."));
    }
  });

  /**
   * GET /api/guild/:guildId/roles
   * Get all roles in a specific guild.
   */
  app.get("/api/guild/:guildId/roles", auth, (req, res) => {
    try {
      const { guildId } = req.params;

      if (!guildId || !/^\d{17,19}$/.test(guildId)) {
        return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json(errorResponse("Not Found", "Guild not found."));
      }

      const roles = guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          position: r.position,
          hoist: r.hoist,
          mentionable: r.mentionable,
          managed: r.managed,
          permissions: r.permissions.toArray(),
          members: r.members.size,
          icon: r.iconURL({ forceStatic: false }) ?? null,
        }));

      res.json(
        successResponse({
          guildId,
          guildName: guild.name,
          count: roles.length,
          roles,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/guild/${req.params.guildId}/roles: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch role data."));
    }
  });

  /**
   * GET /api/bot
   * Get bot information including stats and configuration.
   */
  app.get("/api/bot", auth, async (req, res) => {
    try {
      const totalUsers = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);

      res.json(
        successResponse({
          user: {
            id: client.user.id,
            username: client.user.username,
            displayName: client.user.displayName,
            discriminator: client.user.discriminator,
            avatar: client.user.displayAvatarURL({ forceStatic: false }),
            banner: client.user.bannerURL?.({ forceStatic: false }) ?? null,
            bot: client.user.bot,
            verified: client.user.flags?.has("VerifiedBot") ?? false,
            createdAt: client.user.createdAt,
          },
          stats: {
            guilds: client.guilds.cache.size,
            users: totalUsers,
            channels: client.channels.cache.size,
            emojis: client.emojis.cache.size,
            commands: client.commands.size,
            categories: client.categories.length,
            activePlayers: client.manager?.players?.size ?? 0,
          },
          config: {
            prefix: client.prefix,
            underMaintenance: client.underMaintenance ?? false,
          },
          session: {
            uptime: client.uptime ?? 0,
            uptimeFormatted: formatUptime(client.uptime ?? 0),
            wsPing: client.ws.ping,
            shardCount: client.options.shardCount ?? 1,
            ready: client.isReady(),
          },
          links: {
            invite: client.invite.admin(),
            inviteMinimal: client.invite.required(),
            support: client.config?.links?.support ?? null,
          },
        }),
      );
    } catch (err) {
      log(`API error on GET /api/bot: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch bot data."));
    }
  });

  /**
   * GET /api/voice
   * Get all voice connections/players info.
   */
  app.get("/api/voice", auth, (req, res) => {
    try {
      const voiceConnections = [];
      const playerMap = client.manager?.players ?? new Map();

      for (const [guildId, player] of playerMap) {
        const guild = client.guilds.cache.get(guildId);
        const voiceChannel = client.channels.cache.get(player.voiceId);
        const textChannel = client.channels.cache.get(player.textId);

        voiceConnections.push({
          guildId,
          guildName: guild?.name ?? null,
          voiceChannel: voiceChannel
            ? {
                id: voiceChannel.id,
                name: voiceChannel.name,
                members: voiceChannel.members?.size ?? 0,
              }
            : null,
          textChannel: textChannel
            ? {
                id: textChannel.id,
                name: textChannel.name,
              }
            : null,
          state: {
            playing: player.playing,
            paused: player.paused,
            volume: player.volume,
            loop: player.loop,
            is247: player.data?.get("247") ?? false,
            autoplay: player.data?.get("autoplayStatus") ?? false,
          },
          currentTrack: player.queue?.current
            ? {
                title: player.queue.current.title,
                author: player.queue.current.author,
                duration: player.queue.current.length,
                uri: player.queue.current.uri,
              }
            : null,
          queueLength: player.queue?.size ?? 0,
        });
      }

      res.json(
        successResponse({
          count: voiceConnections.length,
          connections: voiceConnections,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/voice: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch voice data."));
    }
  });

  /**
   * GET /api/lavalink
   * Get Lavalink node status and statistics.
   */
  app.get("/api/lavalink", auth, (req, res) => {
    try {
      const nodes = [];
      const nodeMap = client.manager?.shoukaku?.nodes ?? new Map();

      for (const [name, node] of nodeMap) {
        nodes.push({
          name,
          state: node.state,
          stateDescription: ["Disconnected", "Connecting", "Connected", "Disconnecting"][node.state] ?? "Unknown",
          stats: node.stats
            ? {
                players: node.stats.players,
                playingPlayers: node.stats.playingPlayers,
                uptime: node.stats.uptime,
                memory: {
                  free: node.stats.memory?.free ?? 0,
                  used: node.stats.memory?.used ?? 0,
                  allocated: node.stats.memory?.allocated ?? 0,
                  reservable: node.stats.memory?.reservable ?? 0,
                },
                cpu: {
                  cores: node.stats.cpu?.cores ?? 0,
                  systemLoad: node.stats.cpu?.systemLoad ?? 0,
                  lavalinkLoad: node.stats.cpu?.lavalinkLoad ?? 0,
                },
              }
            : null,
        });
      }

      res.json(
        successResponse({
          totalNodes: nodes.length,
          connectedNodes: nodes.filter((n) => n.state === 2).length,
          nodes,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/lavalink: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch Lavalink data."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING & SERVER START
  // ══════════════════════════════════════════════════════════════════════════════

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json(errorResponse("Not Found", "The requested endpoint does not exist."));
  });

  // Error handler
  app.use(errorHandler);

  // Start server
  app.listen(port, () => {
    log(`REST API server listening on port ${port}`, "info");
    log(`API endpoints available at http://localhost:${port}/api`, "info");
  });
}

