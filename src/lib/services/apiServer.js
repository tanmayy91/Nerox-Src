import os from "os";
import crypto from "crypto";
import express from "express";
import { createServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { log } from "../../logger.js";
import {
  getAllEntries,
  getAllKeys,
  getCount,
  safeGet,
  safeHas,
} from "../utils/dbUtils.js";

// ══════════════════════════════════════════════════════════════════════════════
// ███╗   ██╗███████╗██████╗  ██████╗ ██╗  ██╗     █████╗ ██████╗ ██╗    ██╗   ██╗ ██████╗
// ████╗  ██║██╔════╝██╔══██╗██╔═══██╗╚██╗██╔╝    ██╔══██╗██╔══██╗██║    ██║   ██║██╔════╝
// ██╔██╗ ██║█████╗  ██████╔╝██║   ██║ ╚███╔╝     ███████║██████╔╝██║    ██║   ██║███████╗
// ██║╚██╗██║██╔══╝  ██╔══██╗██║   ██║ ██╔██╗     ██╔══██║██╔═══╝ ██║    ╚██╗ ██╔╝██╔═══██╗
// ██║ ╚████║███████╗██║  ██║╚██████╔╝██╔╝ ██╗    ██║  ██║██║     ██║     ╚████╔╝ ╚██████╔╝
// ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝     ╚═╝      ╚═══╝   ╚═════╝
// ══════════════════════════════════════════════════════════════════════════════
// ULTRA ADVANCED REST API v6.0.0 - The Most Powerful Bot API Ever Built
// Features: Real-time WebSocket, Webhooks, Analytics, Caching, Rate Limiting,
//           Audit Logging, Health Monitoring, Batch Operations, Search, and more!
// ══════════════════════════════════════════════════════════════════════════════

const API_VERSION = "6.0.0";
const API_BUILD = "2024.12.ULTRA";
const RATE_LIMIT_CLEANUP_BUFFER_MS = 60000;
const CACHE_TTL_MS = 30000; // 30 seconds cache
const MAX_AUDIT_LOG_SIZE = 500;
const ACTIVITY_PER_LEVEL = 50; // Activity points needed per level
const SAFE_URL_PARSE_BASE = "http://internal";

// ══════════════════════════════════════════════════════════════════════════════
// ADVANCED CACHING SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

/**
 * In-memory cache with TTL support for frequently accessed data.
 */
class APICache {
  constructor(defaultTTL = CACHE_TTL_MS) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.hits = 0;
    this.misses = 0;
  }

  set(key, value, ttl = this.defaultTTL) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + "%" : "0%",
    };
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

const apiCache = new APICache();

// Cleanup cache periodically
const cacheCleanupInterval = setInterval(() => apiCache.cleanup(), CACHE_TTL_MS);
cacheCleanupInterval.unref();

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Audit log for tracking API operations.
 */
const auditLog = {
  entries: [],
  add(entry) {
    this.entries.unshift({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      timestampISO: new Date().toISOString(),
      ...entry,
    });
    if (this.entries.length > MAX_AUDIT_LOG_SIZE) {
      this.entries.pop();
    }
  },
  getRecent(count = 50) {
    return this.entries.slice(0, count);
  },
  getByAction(action, count = 50) {
    return this.entries.filter(e => e.action === action).slice(0, count);
  },
  getByEndpoint(endpoint, count = 50) {
    return this.entries.filter(e => e.endpoint?.includes(endpoint)).slice(0, count);
  },
  clear() {
    this.entries = [];
  },
  getStats() {
    const byAction = {};
    const byMethod = {};
    for (const entry of this.entries) {
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
      byMethod[entry.method] = (byMethod[entry.method] || 0) + 1;
    }
    return { total: this.entries.length, byAction, byMethod };
  },
};

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
 * Read-only collections that cannot be modified via generic database API.
 * These collections have dedicated endpoints for management.
 */
const READ_ONLY_COLLECTIONS = ["config", "stats/songsPlayed", "stats/commandsUsed", "stats/friends"];

/**
 * Sensitive collections that require extra validation.
 */
const SENSITIVE_COLLECTIONS = ["blacklist", "botmods", "botstaff", "serverstaff", "bypass"];

/**
 * Valid Discord ID pattern.
 */
const DISCORD_ID_PATTERN = /^\d{17,19}$/;

/**
 * Validate Discord ID format.
 * @param {string} id - The ID to validate.
 * @returns {boolean} Whether the ID is valid.
 */
function isValidDiscordId(id) {
  return DISCORD_ID_PATTERN.test(id);
}

/**
 * Sanitize string input to prevent injection.
 * @param {string} input - The input to sanitize.
 * @param {number} maxLength - Maximum allowed length.
 * @returns {string} Sanitized string.
 */
function sanitizeString(input, maxLength = 500) {
  if (typeof input !== "string") return "";
  return input.slice(0, maxLength).trim();
}

/**
 * Validate URL format.
 * @param {string} url - URL to validate.
 * @returns {boolean} Whether the URL is valid.
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a secure random token.
 * @param {number} length - Token length in bytes.
 * @returns {string} Hex-encoded token.
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Parse pagination parameters with validation.
 * @param {object} query - Request query object.
 * @param {object} defaults - Default values.
 * @returns {object} Parsed pagination parameters.
 */
function parsePagination(query, defaults = { limit: 50, offset: 0, maxLimit: 100 }) {
  const limit = Math.min(Math.max(1, parseInt(query.limit) || defaults.limit), defaults.maxLimit);
  const offset = Math.max(0, parseInt(query.offset) || defaults.offset);
  return { limit, offset };
}

/**
 * Create paginated response data.
 * @param {Array} items - All items.
 * @param {number} limit - Items per page.
 * @param {number} offset - Starting offset.
 * @returns {object} Paginated response data.
 */
function paginateResponse(items, limit, offset) {
  const total = items.length;
  const paginatedItems = items.slice(offset, offset + limit);
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
    hasPrevious: offset > 0,
    nextOffset: offset + limit < total ? offset + limit : null,
    previousOffset: offset > 0 ? Math.max(0, offset - limit) : null,
    items: paginatedItems,
  };
}

/**
 * Deep clone an object safely.
 * @param {object} obj - Object to clone.
 * @returns {object} Cloned object.
 */
function deepClone(obj) {
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(obj);
    } catch {
      // Expected for values unsupported by structuredClone (e.g., functions)
    }
  }
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Mask sensitive data in objects.
 * @param {object} obj - Object with sensitive data.
 * @param {string[]} sensitiveKeys - Keys to mask.
 * @returns {object} Object with masked data.
 */
function maskSensitiveData(obj, sensitiveKeys = ["token", "password", "secret", "apiKey"]) {
  if (!obj || typeof obj !== "object") return obj;
  const result = deepClone(obj);
  for (const key of Object.keys(result)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      result[key] = "***REDACTED***";
    } else if (typeof result[key] === "object") {
      result[key] = maskSensitiveData(result[key], sensitiveKeys);
    }
  }
  return result;
}

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
 * Error handling middleware.
 */
function errorHandler(err, req, res, _next) {
  log(`API Error: ${err.message}`, "error");
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : "An unexpected error occurred.",
    requestId: req.requestId,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ADVANCED MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Request ID middleware for tracking requests.
 */
function requestIdMiddleware(req, _res, next) {
  req.requestId = crypto.randomUUID();
  next();
}

/**
 * Response headers middleware for adding standard headers.
 */
function responseHeaders(req, res, next) {
  res.setHeader("X-Request-ID", req.requestId || "unknown");
  res.setHeader("X-API-Version", API_VERSION);
  res.setHeader("X-API-Build", API_BUILD);
  res.setHeader("X-Powered-By", "Nerox Bot API v6");
  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  next();
}

/**
 * Audit logging middleware for tracking API operations.
 */
function auditMiddleware(req, res, next) {
  // Only log mutating operations
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    res.on("finish", () => {
      auditLog.add({
        method: req.method,
        endpoint: req.originalUrl,
        action: `${req.method} ${req.path}`,
        statusCode: res.statusCode,
        ip: req.ip || req.connection?.remoteAddress || "unknown",
        userAgent: req.headers["user-agent"] || "unknown",
        requestId: req.requestId,
        body: maskSensitiveData(req.body),
      });
    });
  }
  next();
}

/**
 * Advanced rate limiter with per-endpoint limits.
 * @param {Map} endpointLimits - Map of endpoint patterns to limits.
 * @returns {Function} Express middleware function.
 */
function advancedRateLimiter(endpointLimits = new Map()) {
  const requests = new Map();
  const defaultLimit = { windowMs: 60000, maxRequests: 100 };

  // Cleanup old entries periodically
  const rateLimitCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of requests) {
      if (now > record.resetAt + RATE_LIMIT_CLEANUP_BUFFER_MS) {
        requests.delete(key);
      }
    }
  }, RATE_LIMIT_CLEANUP_BUFFER_MS);
  rateLimitCleanupInterval.unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress;
    if (!ip) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Unable to determine client IP for rate limiting.",
        requestId: req.requestId,
      });
    }
    const endpoint = req.path;
    const now = Date.now();

    // Find matching endpoint limit
    let limit = defaultLimit;
    for (const [pattern, config] of endpointLimits) {
      if (endpoint.includes(pattern)) {
        limit = config;
        break;
      }
    }

    const key = `${ip}:${endpoint}`;

    if (!requests.has(key)) {
      requests.set(key, { count: 1, resetAt: now + limit.windowMs });
      res.setHeader("X-RateLimit-Limit", limit.maxRequests);
      res.setHeader("X-RateLimit-Remaining", limit.maxRequests - 1);
      res.setHeader("X-RateLimit-Reset", Math.ceil((now + limit.windowMs) / 1000));
      return next();
    }

    const record = requests.get(key);
    if (now > record.resetAt) {
      record.count = 1;
      record.resetAt = now + limit.windowMs;
      res.setHeader("X-RateLimit-Limit", limit.maxRequests);
      res.setHeader("X-RateLimit-Remaining", limit.maxRequests - 1);
      res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetAt / 1000));
      return next();
    }

    res.setHeader("X-RateLimit-Limit", limit.maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, limit.maxRequests - record.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetAt / 1000));

    if (record.count >= limit.maxRequests) {
      return res.status(429).json({
        success: false,
        error: "Too Many Requests",
        message: `Rate limit exceeded for this endpoint. Try again in ${Math.ceil((record.resetAt - now) / 1000)}s.`,
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
        requestId: req.requestId,
      });
    }

    record.count++;
    next();
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// API METRICS TRACKING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * In-memory API metrics storage.
 */
const apiMetrics = {
  requests: {
    total: 0,
    byMethod: {},
    byEndpoint: {},
    byStatus: {},
  },
  latency: {
    total: 0,
    count: 0,
    byEndpoint: {},
  },
  errors: [],
  startTime: Date.now(),
};

/**
 * Metrics tracking middleware.
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const endpoint = req.route?.path || req.path;

    // Count requests
    apiMetrics.requests.total++;
    apiMetrics.requests.byMethod[req.method] = (apiMetrics.requests.byMethod[req.method] || 0) + 1;
    apiMetrics.requests.byEndpoint[endpoint] = (apiMetrics.requests.byEndpoint[endpoint] || 0) + 1;
    apiMetrics.requests.byStatus[res.statusCode] = (apiMetrics.requests.byStatus[res.statusCode] || 0) + 1;

    // Track latency
    apiMetrics.latency.total += duration;
    apiMetrics.latency.count++;
    if (!apiMetrics.latency.byEndpoint[endpoint]) {
      apiMetrics.latency.byEndpoint[endpoint] = { total: 0, count: 0 };
    }
    apiMetrics.latency.byEndpoint[endpoint].total += duration;
    apiMetrics.latency.byEndpoint[endpoint].count++;

    // Track errors
    if (res.statusCode >= 400) {
      apiMetrics.errors.push({
        timestamp: Date.now(),
        method: req.method,
        endpoint,
        status: res.statusCode,
        requestId: req.requestId,
      });
      // Keep only last 100 errors
      if (apiMetrics.errors.length > 100) {
        apiMetrics.errors.shift();
      }
    }
  });

  next();
}

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * In-memory webhook subscriptions.
 */
const webhookSubscriptions = new Map();

/**
 * Send webhook notification.
 * @param {string} event - Event type.
 * @param {object} data - Event data.
 */
async function sendWebhookNotification(event, data) {
  const subscriptions = webhookSubscriptions.get(event) || [];

  for (const sub of subscriptions) {
    try {
      const payload = {
        event,
        timestamp: new Date().toISOString(),
        data,
      };

      // Skip if no secret is configured (required for security)
      if (!sub.secret) {
        log(`Webhook ${sub.url} skipped: missing secret`, "warn");
        continue;
      }

      const signature = crypto
        .createHmac("sha256", sub.secret)
        .update(JSON.stringify(payload))
        .digest("hex");

      await fetch(sub.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": event,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      log(`Webhook delivery failed for ${sub.url}: ${err.message}`, "error");
    }
  }
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
 * @param {object} [data] - Optional additional data payload.
 * @returns {object} Formatted response.
 */
function errorResponse(error, message, data) {
  const response = { success: false, timestamp: new Date().toISOString(), error, message };
  if (data !== undefined) {
    response.data = data;
  }
  return response;
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
 *   GET /api/health/live               → Liveness probe
 *   GET /api/health/ready              → Readiness probe
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
 * Bot:
 *   GET /api/bot/info                  → Bot information (username, avatar, etc.)
 *   GET /api/bot/maintenance           → Get maintenance mode status
 *   POST /api/bot/maintenance          → Toggle maintenance mode
 *
 * Lavalink:
 *   GET /api/lavalink/nodes            → Lavalink nodes status
 *
 * Users:
 *   GET /api/users/:userId             → Look up user by ID
 *
 * Guilds:
 *   GET /api/guilds/:guildId           → Look up guild by ID
 *
 * Blacklist:
 *   GET /api/blacklist                 → Get all blacklisted users
 *   POST /api/blacklist/:userId        → Add user to blacklist
 *   DELETE /api/blacklist/:userId      → Remove user from blacklist
 *
 * Ignore:
 *   GET /api/ignore                    → Get all ignored channels/guilds
 *
 * Bypass:
 *   GET /api/bypass                    → Get all users with bypass permissions
 *
 * Premium Management:
 *   GET /api/premium/users             → Get all premium users
 *   POST /api/premium/users/:userId    → Add premium to user
 *   DELETE /api/premium/users/:userId  → Remove premium from user
 *   GET /api/premium/guilds            → Get all premium guilds
 *   POST /api/premium/guilds/:guildId  → Add premium to guild
 *   DELETE /api/premium/guilds/:guildId → Remove premium from guild
 *
 * No-Prefix:
 *   GET /api/noprefix                  → Get all no-prefix users
 *   POST /api/noprefix/:userId         → Add no-prefix to user
 *   DELETE /api/noprefix/:userId       → Remove no-prefix from user
 *
 * Redeem Codes:
 *   GET /api/redeem                    → Get all redeem codes
 *   POST /api/redeem                   → Generate new redeem code
 *   DELETE /api/redeem/:code           → Delete redeem code
 *
 * 24/7 Players:
 *   GET /api/247                       → Get all 24/7 enabled guilds
 *   DELETE /api/247/:guildId           → Remove 24/7 from guild
 *
 * AFK:
 *   GET /api/afk                       → Get all AFK users
 *   DELETE /api/afk/:userId            → Remove AFK status
 *
 * Player Controls:
 *   GET /api/players/:guildId          → Get detailed player info
 *   POST /api/players/:guildId/pause   → Pause player
 *   POST /api/players/:guildId/resume  → Resume player
 *   POST /api/players/:guildId/skip    → Skip track
 *   POST /api/players/:guildId/stop    → Stop player
 *   POST /api/players/:guildId/volume  → Set volume
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

  // ── Advanced Rate Limiter Configuration ─────────────────────────────────────
  const endpointLimits = new Map([
    ["/api/search", { windowMs: 60000, maxRequests: 30 }],
    ["/api/batch", { windowMs: 60000, maxRequests: 20 }],
    ["/api/webhooks", { windowMs: 60000, maxRequests: 50 }],
    ["/api/kpi", { windowMs: 60000, maxRequests: 60 }],
    ["/api/players", { windowMs: 60000, maxRequests: 100 }],
  ]);

  // ── Global Middleware ───────────────────────────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(requestIdMiddleware);
  app.use(responseHeaders);
  app.use(corsMiddleware);
  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use(auditMiddleware);
  app.use(advancedRateLimiter(endpointLimits));

  const auth = authenticate(apiKey);

  // ══════════════════════════════════════════════════════════════════════════════
  // HEALTH & INFO ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api
   * API information and available endpoints.
   */
  app.get("/api", (req, res) => {
    res.json(
      successResponse({
        name: "Nerox Bot API",
        version: API_VERSION,
        build: API_BUILD,
        description: "Ultra Advanced Discord Bot REST API - The Most Powerful Bot API Ever Built",
        requestId: req.requestId,
        serverTime: new Date().toISOString(),
        authentication: {
          method: "API Key",
          header: "x-api-key (recommended)",
          queryParam: "apiKey (less secure, may appear in logs)",
          note: "All endpoints except GET /api require authentication",
        },
        features: {
          rateLimit: "Per-endpoint intelligent rate limiting with X-RateLimit headers",
          requestId: "Unique UUID request tracking for debugging",
          websocket: "Real-time updates via WebSocket at /api/ws",
          webhooks: "Event notifications to external URLs with HMAC signatures",
          metrics: "Comprehensive API usage analytics and performance monitoring",
          caching: "In-memory caching with TTL for frequently accessed data",
          auditLog: "Full audit trail of all mutating operations",
          batchOperations: "Bulk operations support for mass updates",
          search: "Advanced search with filters and pagination",
          security: "HTTPS, security headers, input sanitization, and more",
        },
        endpoints: {
          info: {
            root: "GET /api",
            health: "GET /api/health",
            healthLive: "GET /api/health/live",
            healthReady: "GET /api/health/ready",
            metrics: "GET /api/metrics",
            cache: "GET /api/cache",
            audit: "GET /api/audit",
          },
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
          bot: {
            info: "GET /api/bot/info",
            getMaintenance: "GET /api/bot/maintenance",
            setMaintenance: "POST /api/bot/maintenance",
          },
          lavalink: {
            nodes: "GET /api/lavalink/nodes",
          },
          users: {
            lookup: "GET /api/users/:userId",
            mutualGuilds: "GET /api/users/:userId/mutual-guilds",
          },
          guilds: {
            lookup: "GET /api/guilds/:guildId",
          },
          search: {
            guilds: "GET /api/search/guilds",
            users: "GET /api/search/users",
          },
          batch: {
            blacklist: "POST /api/batch/blacklist",
            premium: "POST /api/batch/premium",
          },
          webhooks: {
            list: "GET /api/webhooks",
            create: "POST /api/webhooks",
            delete: "DELETE /api/webhooks/:webhookId",
          },
          blacklist: {
            list: "GET /api/blacklist",
            add: "POST /api/blacklist/:userId",
            remove: "DELETE /api/blacklist/:userId",
          },
          ignore: {
            list: "GET /api/ignore",
            add: "POST /api/ignore/:id",
            remove: "DELETE /api/ignore/:id",
          },
          bypass: {
            list: "GET /api/bypass",
            add: "POST /api/bypass/:userId",
            remove: "DELETE /api/bypass/:userId",
          },
          premium: {
            users: {
              list: "GET /api/premium/users",
              add: "POST /api/premium/users/:userId",
              remove: "DELETE /api/premium/users/:userId",
            },
            guilds: {
              list: "GET /api/premium/guilds",
              add: "POST /api/premium/guilds/:guildId",
              remove: "DELETE /api/premium/guilds/:guildId",
            },
          },
          noprefix: {
            list: "GET /api/noprefix",
            add: "POST /api/noprefix/:userId",
            remove: "DELETE /api/noprefix/:userId",
          },
          redeem: {
            list: "GET /api/redeem",
            create: "POST /api/redeem",
            delete: "DELETE /api/redeem/:code",
          },
          twoFourSeven: {
            list: "GET /api/247",
            enable: "POST /api/247/:guildId",
            remove: "DELETE /api/247/:guildId",
          },
          afk: {
            list: "GET /api/afk",
            get: "GET /api/afk/:userId",
            set: "POST /api/afk/:userId",
            remove: "DELETE /api/afk/:userId",
          },
          players: {
            list: "GET /api/players",
            get: "GET /api/players/:guildId",
            nowplaying: "GET /api/players/:guildId/nowplaying",
            pause: "POST /api/players/:guildId/pause",
            resume: "POST /api/players/:guildId/resume",
            skip: "POST /api/players/:guildId/skip",
            stop: "POST /api/players/:guildId/stop",
            volume: "POST /api/players/:guildId/volume",
            seek: "POST /api/players/:guildId/seek",
            shuffle: "POST /api/players/:guildId/shuffle",
            loop: "POST /api/players/:guildId/loop",
            autoplay: "POST /api/players/:guildId/autoplay",
            previous: "POST /api/players/:guildId/previous",
            play: "POST /api/players/:guildId/play",
            filters: {
              get: "GET /api/players/:guildId/filters",
              set: "POST /api/players/:guildId/filters",
            },
          },
          queue: {
            get: "GET /api/players/:guildId/queue",
            add: "POST /api/players/:guildId/queue",
            remove: "DELETE /api/players/:guildId/queue/:index",
            clear: "DELETE /api/players/:guildId/queue",
            move: "POST /api/players/:guildId/queue/move",
          },
          userPreferences: {
            get: "GET /api/preferences/:userId",
            set: "POST /api/preferences/:userId",
            delete: "DELETE /api/preferences/:userId",
          },
          likedSongs: {
            list: "GET /api/liked/:userId",
            add: "POST /api/liked/:userId",
            remove: "DELETE /api/liked/:userId/:songId",
            clear: "DELETE /api/liked/:userId",
          },
          friends: {
            list: "GET /api/friends/:userId",
            add: "POST /api/friends/:userId/:friendId",
            remove: "DELETE /api/friends/:userId/:friendId",
          },
          stats: {
            user: "GET /api/stats/user/:userId",
            guild: "GET /api/stats/guild/:guildId",
          },
          botmods: {
            list: "GET /api/botmods",
            add: "POST /api/botmods/:userId",
            remove: "DELETE /api/botmods/:userId",
          },
          prefix: {
            get: "GET /api/prefix/:guildId",
            set: "POST /api/prefix/:guildId",
            reset: "DELETE /api/prefix/:guildId",
          },
          websocket: {
            connect: "WS /api/ws?apiKey=YOUR_API_KEY",
            events: ["player.start", "player.end", "player.pause", "player.resume", "guild.join", "guild.leave", "track.add", "queue.clear"],
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
        cache: apiCache.getStats(),
        api: {
          version: API_VERSION,
          build: API_BUILD,
        },
      }),
    );
  });

  /**
   * GET /api/health/live
   * Lightweight liveness probe endpoint.
   */
  app.get("/api/health/live", (_req, res) => {
    res.json(
      successResponse({
        status: "alive",
        service: "nerox-api",
        version: API_VERSION,
      }),
    );
  });

  /**
   * GET /api/health/ready
   * Readiness probe endpoint.
   */
  app.get("/api/health/ready", (_req, res) => {
    const botReady = client.isReady();
    const databaseConnected = !!client.db;
    const isReady = botReady && databaseConnected;
    const payload = {
      status: isReady ? "ready" : "not_ready",
      botReady,
      databaseConnected,
    };
    res.status(isReady ? 200 : 503).json(
      isReady
        ? successResponse(payload)
        : errorResponse(
            "service_unavailable",
            "Service not ready to serve traffic. Verify database connectivity and wait for the bot ready event.",
            payload,
          ),
    );
  });

  /**
   * GET /api/cache
   * Get cache statistics and optionally clear cache.
   */
  app.get("/api/cache", auth, (_req, res) => {
    res.json(
      successResponse({
        cache: apiCache.getStats(),
        ttlMs: CACHE_TTL_MS,
      }),
    );
  });

  /**
   * DELETE /api/cache
   * Clear the API cache.
   */
  app.delete("/api/cache", auth, (_req, res) => {
    const previousSize = apiCache.cache.size;
    apiCache.clear();
    res.json(
      successResponse({
        action: "cache_cleared",
        previousSize,
        currentSize: 0,
      }),
    );
  });

  /**
   * GET /api/audit
   * Get audit log entries.
   */
  app.get("/api/audit", auth, (req, res) => {
    const { limit = 50, action, endpoint } = req.query;
    const limitNum = Math.min(parseInt(limit) || 50, MAX_AUDIT_LOG_SIZE);

    let entries;
    if (action) {
      entries = auditLog.getByAction(action, limitNum);
    } else if (endpoint) {
      entries = auditLog.getByEndpoint(endpoint, limitNum);
    } else {
      entries = auditLog.getRecent(limitNum);
    }

    res.json(
      successResponse({
        total: auditLog.entries.length,
        returned: entries.length,
        stats: auditLog.getStats(),
        entries,
      }),
    );
  });

  /**
   * DELETE /api/audit
   * Clear the audit log.
   */
  app.delete("/api/audit", auth, (_req, res) => {
    const previousCount = auditLog.entries.length;
    auditLog.clear();
    res.json(
      successResponse({
        action: "audit_cleared",
        previousCount,
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
  // BOT INFO ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/bot/info
   * Bot information (username, avatar, id, etc.)
   */
  app.get("/api/bot/info", auth, (_req, res) => {
    try {
      const user = client.user;
      res.json(
        successResponse({
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          tag: user.tag,
          avatar: user.displayAvatarURL({ forceStatic: false, size: 1024 }),
          banner: user.bannerURL({ forceStatic: false, size: 1024 }),
          createdAt: user.createdAt,
          createdTimestamp: user.createdTimestamp,
          verified: user.verified,
          bot: user.bot,
          presence: {
            status: client.presence?.status || "online",
            activities: client.presence?.activities?.map((a) => ({
              name: a.name,
              type: a.type,
              state: a.state,
            })) || [],
          },
          inviteLinks: {
            admin: client.invite.admin(),
            required: client.invite.required(),
          },
          supportServer: client.config.links?.support || null,
          prefix: client.prefix,
          owners: client.owners || [],
          admins: client.admins || [],
        }),
      );
    } catch (err) {
      log(`API error on GET /api/bot/info: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch bot info."));
    }
  });

  /**
   * GET /api/bot/maintenance
   * Get maintenance mode status.
   */
  app.get("/api/bot/maintenance", auth, (_req, res) => {
    res.json(
      successResponse({
        underMaintenance: client.underMaintenance ?? false,
      }),
    );
  });

  /**
   * POST /api/bot/maintenance
   * Toggle maintenance mode.
   */
  app.post("/api/bot/maintenance", auth, (req, res) => {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json(errorResponse("Bad Request", 'Request body must contain a boolean "enabled" field.'));
    }
    client.underMaintenance = enabled;
    res.json(
      successResponse({
        underMaintenance: client.underMaintenance,
        message: enabled ? "Maintenance mode enabled." : "Maintenance mode disabled.",
      }),
    );
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // LAVALINK ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/lavalink/nodes
   * Get status of all Lavalink nodes.
   */
  app.get("/api/lavalink/nodes", auth, (_req, res) => {
    try {
      const nodes = [];
      const nodeMap = client.manager?.shoukaku?.nodes ?? new Map();

      for (const [name, node] of nodeMap) {
        const stateNames = { 0: "CONNECTING", 1: "CONNECTED", 2: "READY", 3: "DISCONNECTING", 4: "DISCONNECTED" };
        nodes.push({
          name,
          state: node.state,
          stateLabel: stateNames[node.state] || "UNKNOWN",
          stats: node.stats ? {
            players: node.stats.players,
            playingPlayers: node.stats.playingPlayers,
            uptime: node.stats.uptime,
            cpu: {
              cores: node.stats.cpu?.cores,
              systemLoad: node.stats.cpu?.systemLoad,
              lavalinkLoad: node.stats.cpu?.lavalinkLoad,
            },
            memory: {
              used: node.stats.memory?.used,
              free: node.stats.memory?.free,
              allocated: node.stats.memory?.allocated,
              reservable: node.stats.memory?.reservable,
            },
          } : null,
        });
      }

      const readyNodes = nodes.filter((n) => n.state === 2).length;

      res.json(
        successResponse({
          totalNodes: nodes.length,
          readyNodes,
          disconnectedNodes: nodes.length - readyNodes,
          nodes,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/lavalink/nodes: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch lavalink nodes."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // USER & GUILD LOOKUP ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/users/:userId
   * Look up a Discord user by ID.
   */
  app.get("/api/users/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!/^\d{17,19}$/.test(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) {
        return res.status(404).json(errorResponse("Not Found", `User ${userId} not found.`));
      }

      // Check user status in various databases
      // Note: botstaff = premium users, botmods = bot moderators
      const [isBlacklisted, isNoPrefix, hasPremium, isBotMod] = await Promise.all([
        safeHas(client.db.blacklist, userId),
        safeHas(client.db.noPrefix, userId),
        safeHas(client.db.botstaff, userId),
        safeHas(client.db.botmods, userId),
      ]);

      res.json(
        successResponse({
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          tag: user.tag,
          avatar: user.displayAvatarURL({ forceStatic: false, size: 512 }),
          banner: user.bannerURL({ forceStatic: false, size: 512 }),
          createdAt: user.createdAt,
          createdTimestamp: user.createdTimestamp,
          bot: user.bot,
          system: user.system,
          status: {
            isOwner: client.owners?.includes(userId) || false,
            isAdmin: client.admins?.includes(userId) || false,
            isBotMod,
            hasPremium,
            isNoPrefix,
            isBlacklisted,
          },
        }),
      );
    } catch (err) {
      log(`API error on GET /api/users/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch user."));
    }
  });

  /**
   * GET /api/users/:userId/mutual-guilds
   * Get all mutual servers between a user and the bot, including admin permission check.
   */
  app.get("/api/users/:userId/mutual-guilds", auth, async (req, res) => {
    const { userId } = req.params;

    if (!/^\d{17,19}$/.test(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) {
        return res.status(404).json(errorResponse("Not Found", `User ${userId} not found.`));
      }

      const mutualGuilds = [];
      const adminGuilds = [];
      const manageGuilds = [];

      // Iterate through all guilds the bot is in
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          // Try to get the member from cache first, then fetch if needed
          let member = guild.members.cache.get(userId);
          if (!member) {
            member = await guild.members.fetch(userId).catch(() => null);
          }

          if (member) {
            const permissions = member.permissions;
            const isOwner = guild.ownerId === userId;
            const isAdmin = isOwner || permissions.has("Administrator");
            const canManageGuild = isOwner || permissions.has("ManageGuild");
            const canManageChannels = permissions.has("ManageChannels");
            const canManageRoles = permissions.has("ManageRoles");
            const canKickMembers = permissions.has("KickMembers");
            const canBanMembers = permissions.has("BanMembers");

            // Check guild premium status
            const [isPremiumGuild, is247Enabled] = await Promise.all([
              safeHas(client.db.serverstaff, guildId),
              safeHas(client.db.twoFourSeven, guildId),
            ]);

            const guildData = {
              id: guild.id,
              name: guild.name,
              icon: guild.iconURL({ forceStatic: false, size: 128 }),
              memberCount: guild.memberCount,
              ownerId: guild.ownerId,
              isOwner,
              permissions: {
                administrator: isAdmin,
                manageGuild: canManageGuild,
                manageChannels: canManageChannels,
                manageRoles: canManageRoles,
                kickMembers: canKickMembers,
                banMembers: canBanMembers,
              },
              userRoles: member.roles.cache
                .filter((r) => r.id !== guild.id) // Filter out @everyone
                .sort((a, b) => b.position - a.position)
                .first(5)
                ?.map((r) => ({ id: r.id, name: r.name, color: r.hexColor })) ?? [],
              highestRole: {
                id: member.roles.highest.id,
                name: member.roles.highest.name,
                color: member.roles.highest.hexColor,
                position: member.roles.highest.position,
              },
              joinedAt: member.joinedAt,
              nickname: member.nickname,
              botStatus: {
                isPremium: isPremiumGuild,
                is247Enabled,
                hasActivePlayer: !!client.manager?.players?.get(guildId),
              },
            };

            mutualGuilds.push(guildData);

            if (isAdmin) {
              adminGuilds.push(guildData);
            }

            if (canManageGuild) {
              manageGuilds.push(guildData);
            }
          }
        } catch {
          // Skip guilds where we can't fetch member info
          continue;
        }
      }

      // Sort by member count descending
      mutualGuilds.sort((a, b) => b.memberCount - a.memberCount);
      adminGuilds.sort((a, b) => b.memberCount - a.memberCount);
      manageGuilds.sort((a, b) => b.memberCount - a.memberCount);

      res.json(
        successResponse({
          userId,
          username: user.username,
          avatar: user.displayAvatarURL({ forceStatic: false, size: 256 }),
          summary: {
            totalMutualGuilds: mutualGuilds.length,
            adminGuildsCount: adminGuilds.length,
            manageGuildsCount: manageGuilds.length,
          },
          mutualGuilds,
          adminGuilds,
          manageGuilds,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/users/${userId}/mutual-guilds: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch mutual guilds."));
    }
  });

  /**
   * GET /api/guilds/:guildId
   * Look up a specific guild by ID.
   */
  app.get("/api/guilds/:guildId", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!/^\d{17,19}$/.test(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json(errorResponse("Not Found", `Guild ${guildId} not found or bot is not a member.`));
      }

      // Check guild status in various databases
      const [is247, isIgnored, isPremium, hasCustomPrefix] = await Promise.all([
        safeHas(client.db.twoFourSeven, guildId),
        safeHas(client.db.ignore, guildId),
        safeHas(client.db.serverstaff, guildId),
        safeGet(client.db.prefix, guildId),
      ]);

      const player = client.manager?.players?.get(guildId);

      res.json(
        successResponse({
          id: guild.id,
          name: guild.name,
          description: guild.description,
          memberCount: guild.memberCount,
          ownerId: guild.ownerId,
          icon: guild.iconURL({ forceStatic: false, size: 512 }),
          banner: guild.bannerURL({ forceStatic: false, size: 512 }),
          splash: guild.splashURL({ forceStatic: false, size: 512 }),
          joinedAt: guild.joinedAt,
          createdAt: guild.createdAt,
          premiumTier: guild.premiumTier,
          premiumSubscriptionCount: guild.premiumSubscriptionCount,
          vanityURLCode: guild.vanityURLCode,
          verified: guild.verified,
          partnered: guild.partnered,
          channels: {
            total: guild.channels.cache.size,
            text: guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread()).size,
            voice: guild.channels.cache.filter((c) => c.isVoiceBased()).size,
          },
          roles: guild.roles.cache.size,
          emojis: guild.emojis.cache.size,
          status: {
            isPremium,
            is247,
            isIgnored,
            customPrefix: hasCustomPrefix || null,
            hasActivePlayer: !!player,
          },
          player: player ? {
            playing: player.playing,
            paused: player.paused,
            volume: player.volume,
            queueSize: player.queue?.size ?? 0,
            currentTrack: player.queue?.current?.title ?? null,
          } : null,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/guilds/${guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch guild."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // BLACKLIST MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/blacklist
   * Get all blacklisted users.
   */
  app.get("/api/blacklist", auth, async (_req, res) => {
    try {
      const blacklist = await getAllEntries(client.db.blacklist);
      const entries = await Promise.all(
        Object.entries(blacklist).map(async ([id, data]) => {
          const user = await client.users.fetch(id).catch(() => null);
          return {
            id,
            username: user?.username ?? null,
            tag: user?.tag ?? null,
            reason: data?.reason ?? "No reason provided",
            blacklistedAt: data?.at ?? null,
            blacklistedBy: data?.by ?? null,
          };
        }),
      );

      res.json(
        successResponse({
          count: entries.length,
          entries,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/blacklist: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch blacklist."));
    }
  });

  /**
   * POST /api/blacklist/:userId
   * Add a user to the blacklist.
   */
  app.post("/api/blacklist/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!/^\d{17,19}$/.test(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    // Prevent blacklisting owners
    if (client.owners?.includes(userId)) {
      return res.status(403).json(errorResponse("Forbidden", "Cannot blacklist bot owners."));
    }

    try {
      // Store as true to match bot command format
      await client.db.blacklist.set(userId, true);

      res.json(
        successResponse({
          userId,
          action: "blacklisted",
        }),
      );
    } catch (err) {
      log(`API error on POST /api/blacklist/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to blacklist user."));
    }
  });

  /**
   * DELETE /api/blacklist/:userId
   * Remove a user from the blacklist.
   */
  app.delete("/api/blacklist/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!/^\d{17,19}$/.test(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const exists = await safeHas(client.db.blacklist, userId);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", `User ${userId} is not blacklisted.`));
      }

      await client.db.blacklist.delete(userId);

      res.json(
        successResponse({
          userId,
          action: "unblacklisted",
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/blacklist/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to unblacklist user."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // IGNORE (CHANNEL/GUILD) MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/ignore
   * Get all ignored channels/guilds.
   */
  app.get("/api/ignore", auth, async (_req, res) => {
    try {
      const ignored = await getAllEntries(client.db.ignore);
      res.json(
        successResponse({
          count: Object.keys(ignored).length,
          entries: ignored,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/ignore: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch ignored list."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // BYPASS MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/bypass
   * Get all users with bypass permissions.
   */
  app.get("/api/bypass", auth, async (_req, res) => {
    try {
      const bypassed = await getAllEntries(client.db.bypass);
      res.json(
        successResponse({
          count: Object.keys(bypassed).length,
          entries: bypassed,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/bypass: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch bypass list."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PREMIUM MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/premium/users
   * Get all premium users with details.
   */
  app.get("/api/premium/users", auth, async (_req, res) => {
    try {
      const premiumUsers = await getAllEntries(client.db.botstaff);
      const now = Date.now();

      const users = await Promise.all(
        Object.entries(premiumUsers).map(async ([id, data]) => {
          const user = await client.users.fetch(id).catch(() => null);
          const expiresAt = data?.expiresAt || data?.expires;
          const isExpired = expiresAt ? expiresAt < now : false;
          const daysLeft = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 86400000)) : null;

          return {
            id,
            username: user?.username ?? null,
            tag: user?.tag ?? null,
            avatar: user?.displayAvatarURL({ forceStatic: false, size: 128 }) ?? null,
            expiresAt,
            expiresFormatted: expiresAt ? new Date(expiresAt).toISOString() : null,
            daysLeft,
            isExpired,
            isPermanent: data?.permanent || !expiresAt,
            addedBy: data?.addedBy ?? null,
            redeemedAt: data?.redeemedAt ?? null,
          };
        }),
      );

      res.json(
        successResponse({
          count: users.length,
          activeCount: users.filter((u) => !u.isExpired).length,
          expiredCount: users.filter((u) => u.isExpired).length,
          users,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/premium/users: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch premium users."));
    }
  });

  /**
   * POST /api/premium/users/:userId
   * Add premium to a user.
   */
  app.post("/api/premium/users/:userId", auth, async (req, res) => {
    const { userId } = req.params;
    const { days, permanent } = req.body ?? {};

    if (!/^\d{17,19}$/.test(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    if (!permanent && (!days || typeof days !== "number" || days < 1 || days > 365)) {
      return res.status(400).json(errorResponse("Bad Request", "Duration must be between 1 and 365 days, or set permanent: true."));
    }

    try {
      const existing = await safeGet(client.db.botstaff, userId);
      if (existing) {
        return res.status(409).json(errorResponse("Conflict", "User already has premium."));
      }

      const data = {
        redeemedAt: Date.now(),
        addedBy: "API",
      };

      if (permanent) {
        data.permanent = true;
      } else {
        data.expiresAt = Date.now() + days * 86400000;
      }

      await client.db.botstaff.set(userId, data);

      res.json(
        successResponse({
          userId,
          action: "premium_added",
          days: permanent ? "permanent" : days,
          expiresAt: data.expiresAt ?? null,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/premium/users/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to add premium."));
    }
  });

  /**
   * DELETE /api/premium/users/:userId
   * Remove premium from a user.
   */
  app.delete("/api/premium/users/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!/^\d{17,19}$/.test(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const exists = await safeHas(client.db.botstaff, userId);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", "User does not have premium."));
      }

      await client.db.botstaff.delete(userId);

      res.json(
        successResponse({
          userId,
          action: "premium_removed",
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/premium/users/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove premium."));
    }
  });

  /**
   * GET /api/premium/guilds
   * Get all premium guilds with details.
   */
  app.get("/api/premium/guilds", auth, async (_req, res) => {
    try {
      const premiumGuilds = await getAllEntries(client.db.serverstaff);
      const now = Date.now();

      const guilds = Object.entries(premiumGuilds).map(([id, data]) => {
        const guild = client.guilds.cache.get(id);
        const expiresAt = data?.expiresAt || data?.expires;
        const isExpired = expiresAt ? expiresAt < now : false;
        const daysLeft = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 86400000)) : null;

        return {
          id,
          name: guild?.name ?? null,
          memberCount: guild?.memberCount ?? null,
          icon: guild?.iconURL({ forceStatic: false, size: 128 }) ?? null,
          inBot: !!guild,
          expiresAt,
          expiresFormatted: expiresAt ? new Date(expiresAt).toISOString() : null,
          daysLeft,
          isExpired,
          isPermanent: data?.permanent || !expiresAt,
          addedBy: data?.addedBy ?? null,
        };
      });

      res.json(
        successResponse({
          count: guilds.length,
          activeCount: guilds.filter((g) => !g.isExpired).length,
          expiredCount: guilds.filter((g) => g.isExpired).length,
          guilds,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/premium/guilds: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch premium guilds."));
    }
  });

  /**
   * POST /api/premium/guilds/:guildId
   * Add premium to a guild.
   */
  app.post("/api/premium/guilds/:guildId", auth, async (req, res) => {
    const { guildId } = req.params;
    const { days, permanent } = req.body ?? {};

    if (!/^\d{17,19}$/.test(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    if (!permanent && (!days || typeof days !== "number" || days < 1 || days > 365)) {
      return res.status(400).json(errorResponse("Bad Request", "Duration must be between 1 and 365 days, or set permanent: true."));
    }

    try {
      const existing = await safeGet(client.db.serverstaff, guildId);
      if (existing) {
        return res.status(409).json(errorResponse("Conflict", "Guild already has premium."));
      }

      const data = {
        redeemedAt: Date.now(),
        addedBy: "API",
      };

      if (permanent) {
        data.permanent = true;
      } else {
        data.expiresAt = Date.now() + days * 86400000;
      }

      await client.db.serverstaff.set(guildId, data);

      res.json(
        successResponse({
          guildId,
          action: "premium_added",
          days: permanent ? "permanent" : days,
          expiresAt: data.expiresAt ?? null,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/premium/guilds/${guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to add guild premium."));
    }
  });

  /**
   * DELETE /api/premium/guilds/:guildId
   * Remove premium from a guild.
   */
  app.delete("/api/premium/guilds/:guildId", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!/^\d{17,19}$/.test(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const exists = await safeHas(client.db.serverstaff, guildId);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", "Guild does not have premium."));
      }

      await client.db.serverstaff.delete(guildId);

      res.json(
        successResponse({
          guildId,
          action: "premium_removed",
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/premium/guilds/${guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove guild premium."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // NO-PREFIX MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/noprefix
   * Get all users with no-prefix privilege.
   */
  app.get("/api/noprefix", auth, async (_req, res) => {
    try {
      const noPrefixUsers = await getAllEntries(client.db.noPrefix);

      const users = await Promise.all(
        Object.entries(noPrefixUsers).map(async ([id, _data]) => {
          const user = await client.users.fetch(id).catch(() => null);
          return {
            id,
            username: user?.username ?? null,
            tag: user?.tag ?? null,
          };
        }),
      );

      res.json(
        successResponse({
          count: users.length,
          users,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/noprefix: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch no-prefix users."));
    }
  });

  /**
   * POST /api/noprefix/:userId
   * Add no-prefix privilege to a user.
   */
  app.post("/api/noprefix/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!/^\d{17,19}$/.test(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const existing = await safeHas(client.db.noPrefix, userId);
      if (existing) {
        return res.status(409).json(errorResponse("Conflict", "User already has no-prefix."));
      }

      // Store as true to match bot command format
      await client.db.noPrefix.set(userId, true);

      res.json(
        successResponse({
          userId,
          action: "noprefix_added",
        }),
      );
    } catch (err) {
      log(`API error on POST /api/noprefix/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to add no-prefix."));
    }
  });

  /**
   * DELETE /api/noprefix/:userId
   * Remove no-prefix privilege from a user.
   */
  app.delete("/api/noprefix/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!/^\d{17,19}$/.test(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const exists = await safeHas(client.db.noPrefix, userId);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", "User does not have no-prefix."));
      }

      await client.db.noPrefix.delete(userId);

      res.json(
        successResponse({
          userId,
          action: "noprefix_removed",
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/noprefix/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove no-prefix."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // REDEEM CODE MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/redeem
   * Get all redeem codes.
   */
  app.get("/api/redeem", auth, async (_req, res) => {
    try {
      const codes = await getAllEntries(client.db.redeemCode);

      const formatted = Object.entries(codes).map(([code, data]) => ({
        code,
        type: data?.type ?? "unknown",
        duration: data?.duration ?? null,
        expiresAt: data?.expiresAt ?? null,
        expiresFormatted: data?.expiresAt ? new Date(data.expiresAt).toISOString() : null,
        redeemed: data?.redeemed ?? false,
        redeemedBy: data?.redeemedBy ?? null,
        redeemedAt: data?.redeemedAt ?? null,
        generatedBy: data?.generatedBy ?? null,
        generatedAt: data?.generatedAt ?? null,
      }));

      res.json(
        successResponse({
          count: formatted.length,
          unusedCount: formatted.filter((c) => !c.redeemed).length,
          usedCount: formatted.filter((c) => c.redeemed).length,
          codes: formatted,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/redeem: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch redeem codes."));
    }
  });

  /**
   * POST /api/redeem
   * Generate a new redeem code.
   */
  app.post("/api/redeem", auth, async (req, res) => {
    const { type, days } = req.body ?? {};

    if (!["user", "guild"].includes(type)) {
      return res.status(400).json(errorResponse("Bad Request", "Type must be 'user' or 'guild'."));
    }

    if (!days || typeof days !== "number" || days < 1 || days > 365) {
      return res.status(400).json(errorResponse("Bad Request", "Duration must be between 1 and 365 days."));
    }

    try {
      const crypto = await import("crypto");
      const code = crypto.randomBytes(5).toString("hex").toUpperCase();
      const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;

      await client.db.redeemCode.set(code, {
        type,
        duration: days,
        expiresAt,
        redeemed: false,
        generatedAt: Date.now(),
        generatedBy: "API",
      });

      res.json(
        successResponse({
          code,
          type,
          duration: days,
          expiresAt,
          expiresFormatted: new Date(expiresAt).toISOString(),
        }),
      );
    } catch (err) {
      log(`API error on POST /api/redeem: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to generate redeem code."));
    }
  });

  /**
   * DELETE /api/redeem/:code
   * Delete a redeem code.
   */
  app.delete("/api/redeem/:code", auth, async (req, res) => {
    const { code } = req.params;

    try {
      const exists = await safeHas(client.db.redeemCode, code);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", "Redeem code not found."));
      }

      await client.db.redeemCode.delete(code);

      res.json(
        successResponse({
          code,
          action: "deleted",
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/redeem/${code}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to delete redeem code."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // 24/7 PLAYERS MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/247
   * Get all guilds with 24/7 players enabled.
   */
  app.get("/api/247", auth, async (_req, res) => {
    try {
      const twoFourSeven = await getAllEntries(client.db.twoFourSeven);

      const guilds = Object.entries(twoFourSeven).map(([guildId, data]) => {
        const guild = client.guilds.cache.get(guildId);
        const voiceChannel = data?.voiceId ? client.channels.cache.get(data.voiceId) : null;
        const textChannel = data?.textId ? client.channels.cache.get(data.textId) : null;
        const player = client.manager?.players?.get(guildId);

        return {
          guildId,
          guildName: guild?.name ?? null,
          memberCount: guild?.memberCount ?? null,
          inBot: !!guild,
          voiceChannel: {
            id: data?.voiceId ?? null,
            name: voiceChannel?.name ?? null,
          },
          textChannel: {
            id: data?.textId ?? null,
            name: textChannel?.name ?? null,
          },
          hasActivePlayer: !!player,
          playerStatus: player ? {
            playing: player.playing,
            paused: player.paused,
            queueSize: player.queue?.size ?? 0,
          } : null,
        };
      });

      res.json(
        successResponse({
          count: guilds.length,
          activeCount: guilds.filter((g) => g.hasActivePlayer).length,
          guilds,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/247: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch 24/7 players."));
    }
  });

  /**
   * POST /api/247/:guildId
   * Enable 24/7 mode for a guild.
   */
  app.post("/api/247/:guildId", auth, async (req, res) => {
    const { guildId } = req.params;
    const { voiceChannelId, textChannelId } = req.body ?? {};

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    if (!voiceChannelId || !isValidDiscordId(voiceChannelId)) {
      return res.status(400).json(errorResponse("Bad Request", "Valid voice channel ID is required."));
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json(errorResponse("Not Found", "Guild not found or bot is not a member."));
      }

      const voiceChannel = guild.channels.cache.get(voiceChannelId);
      if (!voiceChannel || !voiceChannel.isVoiceBased()) {
        return res.status(400).json(errorResponse("Bad Request", "Invalid voice channel."));
      }

      const exists = await safeHas(client.db.twoFourSeven, guildId);
      if (exists) {
        return res.status(409).json(errorResponse("Conflict", "24/7 is already enabled for this guild."));
      }

      // Store data in same format as bot command: { textId, voiceId }
      const data = {
        textId: textChannelId || null,
        voiceId: voiceChannelId || null,
      };

      await client.db.twoFourSeven.set(guildId, data);

      res.json(
        successResponse({
          guildId,
          guildName: guild.name,
          action: "247_enabled",
          voiceChannel: {
            id: voiceChannelId,
            name: voiceChannel.name,
          },
        }),
      );
    } catch (err) {
      log(`API error on POST /api/247/${guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to enable 24/7."));
    }
  });

  /**
   * DELETE /api/247/:guildId
   * Remove 24/7 from a guild.
   */
  app.delete("/api/247/:guildId", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const exists = await safeHas(client.db.twoFourSeven, guildId);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", "Guild does not have 24/7 enabled."));
      }

      await client.db.twoFourSeven.delete(guildId);

      // Also destroy the player if exists
      const player = client.manager?.players?.get(guildId);
      if (player) {
        await player.destroy();
      }

      res.json(
        successResponse({
          guildId,
          action: "247_removed",
          playerDestroyed: !!player,
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/247/${guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove 24/7."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // AFK USERS ENDPOINT
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/afk
   * Get all AFK users.
   */
  app.get("/api/afk", auth, async (_req, res) => {
    try {
      const afkUsers = await getAllEntries(client.db.afk);

      const users = await Promise.all(
        Object.entries(afkUsers).map(async ([id, data]) => {
          const user = await client.users.fetch(id).catch(() => null);
          const ts = data?.timestamp ?? data?.since ?? null;
          return {
            id,
            username: user?.username ?? null,
            tag: user?.tag ?? null,
            reason: data?.reason ?? "No reason",
            timestamp: ts,
            timestampFormatted: ts ? new Date(ts).toISOString() : null,
          };
        }),
      );

      res.json(
        successResponse({
          count: users.length,
          users,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/afk: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch AFK users."));
    }
  });

  /**
   * DELETE /api/afk/:userId
   * Remove AFK status from a user.
   */
  app.delete("/api/afk/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const exists = await safeHas(client.db.afk, userId);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", "User is not AFK."));
      }

      await client.db.afk.delete(userId);

      res.json(
        successResponse({
          userId,
          action: "afk_removed",
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/afk/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove AFK status."));
    }
  });

  /**
   * GET /api/afk/:userId
   * Get AFK status for a specific user.
   */
  app.get("/api/afk/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const afkData = await safeGet(client.db.afk, userId);
      if (!afkData) {
        return res.status(404).json(errorResponse("Not Found", "User is not AFK."));
      }

      const user = await client.users.fetch(userId).catch(() => null);
      const ts = afkData.timestamp ?? afkData.since ?? null;
      const duration = ts ? Date.now() - ts : null;

      res.json(
        successResponse({
          id: userId,
          username: user?.username ?? null,
          tag: user?.tag ?? null,
          avatar: user?.displayAvatarURL({ forceStatic: false, size: 256 }) ?? null,
          reason: afkData.reason ?? "No reason provided",
          timestamp: ts,
          timestampFormatted: ts ? new Date(ts).toISOString() : null,
          durationMs: duration,
          durationFormatted: duration ? formatUptime(duration) : null,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/afk/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch AFK status."));
    }
  });

  /**
   * POST /api/afk/:userId
   * Set AFK status for a user.
   */
  app.post("/api/afk/:userId", auth, async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body ?? {};

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const existing = await safeHas(client.db.afk, userId);
      const sanitizedReason = sanitizeString(reason, 200) || "AFK (set via API)";

      const afkData = {
        reason: sanitizedReason,
        timestamp: Date.now(),
      };

      await client.db.afk.set(userId, afkData);

      const user = await client.users.fetch(userId).catch(() => null);

      res.json(
        successResponse({
          userId,
          username: user?.username ?? null,
          action: existing ? "afk_updated" : "afk_set",
          reason: sanitizedReason,
          timestamp: afkData.timestamp,
          timestampFormatted: new Date(afkData.timestamp).toISOString(),
        }),
      );
    } catch (err) {
      log(`API error on POST /api/afk/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to set AFK status."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PLAYER CONTROL ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/players
   * Get all active players across all guilds.
   */
  app.get("/api/players", auth, (_req, res) => {
    try {
      const players = client.manager?.players;
      if (!players || players.size === 0) {
        return res.json(
          successResponse({
            count: 0,
            players: [],
          }),
        );
      }

      const playersList = [];
      for (const [guildId, player] of players) {
        const guild = client.guilds.cache.get(guildId);
        const current = player.queue?.current;
        playersList.push({
          guildId,
          guildName: guild?.name ?? null,
          playing: player.playing,
          paused: player.paused,
          volume: player.volume,
          queueSize: player.queue?.size ?? 0,
          currentTrack: current ? {
            title: current.title,
            author: current.author,
            durationMs: current.length,
          } : null,
          voiceChannelId: player.voiceId,
          textChannelId: player.textId,
        });
      }

      res.json(
        successResponse({
          count: playersList.length,
          players: playersList,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/players: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch players."));
    }
  });

  /**
   * GET /api/players/:guildId/nowplaying
   * Get the currently playing track in a guild.
   */
  app.get("/api/players/:guildId/nowplaying", auth, (req, res) => {
    const { guildId } = req.params;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const current = player.queue?.current;
      if (!current) {
        return res.status(404).json(errorResponse("Not Found", "No track is currently playing."));
      }

      const guild = client.guilds.cache.get(guildId);

      res.json(
        successResponse({
          guildId,
          guildName: guild?.name ?? null,
          playing: player.playing,
          paused: player.paused,
          track: {
            title: current.title,
            author: current.author,
            uri: current.uri,
            durationMs: current.length,
            durationFormatted: client.formatDuration(current.length),
            positionMs: player.position,
            positionFormatted: client.formatDuration(player.position),
            progressPercent: current.length > 0 ? Math.round((player.position / current.length) * 100) : 0,
            thumbnail: current.thumbnail ?? null,
            isStream: current.isStream,
            sourceName: current.sourceName ?? null,
            requester: {
              id: current.requester?.id ?? null,
              username: current.requester?.username ?? null,
            },
          },
          volume: player.volume,
          loop: player.loop,
          autoplay: player.data?.get("autoplayStatus") ?? false,
          queueSize: player.queue?.size ?? 0,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/players/${guildId}/nowplaying: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch now playing."));
    }
  });

  /**
   * POST /api/players/:guildId/pause
   * Pause the player in a guild.
   */
  app.post("/api/players/:guildId/pause", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!/^\d{17,19}$/.test(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      if (player.paused) {
        return res.status(400).json(errorResponse("Bad Request", "Player is already paused."));
      }

      player.pause(true);

      res.json(
        successResponse({
          guildId,
          action: "paused",
          currentTrack: player.queue?.current?.title ?? null,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/pause: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to pause player."));
    }
  });

  /**
   * POST /api/players/:guildId/resume
   * Resume the player in a guild.
   */
  app.post("/api/players/:guildId/resume", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!/^\d{17,19}$/.test(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      if (!player.paused) {
        return res.status(400).json(errorResponse("Bad Request", "Player is not paused."));
      }

      player.pause(false);

      res.json(
        successResponse({
          guildId,
          action: "resumed",
          currentTrack: player.queue?.current?.title ?? null,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/resume: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to resume player."));
    }
  });

  /**
   * POST /api/players/:guildId/skip
   * Skip the current track in a guild.
   */
  app.post("/api/players/:guildId/skip", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!/^\d{17,19}$/.test(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const skippedTrack = player.queue?.current?.title ?? null;
      player.skip();

      res.json(
        successResponse({
          guildId,
          action: "skipped",
          skippedTrack,
          nextTrack: player.queue?.current?.title ?? null,
          queueSize: player.queue?.size ?? 0,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/skip: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to skip track."));
    }
  });

  /**
   * POST /api/players/:guildId/stop
   * Stop and destroy the player in a guild.
   */
  app.post("/api/players/:guildId/stop", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!/^\d{17,19}$/.test(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      await player.destroy();

      res.json(
        successResponse({
          guildId,
          action: "stopped",
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/stop: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to stop player."));
    }
  });

  /**
   * POST /api/players/:guildId/volume
   * Set volume for the player in a guild.
   */
  app.post("/api/players/:guildId/volume", auth, async (req, res) => {
    const { guildId } = req.params;
    const { volume } = req.body ?? {};

    if (!/^\d{17,19}$/.test(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    if (typeof volume !== "number" || volume < 0 || volume > 200) {
      return res.status(400).json(errorResponse("Bad Request", "Volume must be a number between 0 and 200."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const previousVolume = player.volume;
      player.setVolume(volume);

      res.json(
        successResponse({
          guildId,
          action: "volume_set",
          previousVolume,
          newVolume: volume,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/volume: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to set volume."));
    }
  });

  /**
   * GET /api/players/:guildId
   * Get detailed player information for a guild.
   */
  app.get("/api/players/:guildId", auth, (req, res) => {
    const { guildId } = req.params;

    if (!/^\d{17,19}$/.test(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const guild = client.guilds.cache.get(guildId);
      const current = player.queue?.current;

      res.json(
        successResponse({
          guildId,
          guildName: guild?.name ?? null,
          state: {
            playing: player.playing,
            paused: player.paused,
            volume: player.volume,
            loop: player.loop,
            positionMs: player.position,
            positionFormatted: client.formatDuration(player.position),
            is247: player.data?.get("247") ?? false,
            autoplay: player.data?.get("autoplayStatus") ?? false,
          },
          currentTrack: current ? {
            title: current.title,
            author: current.author,
            uri: current.uri,
            durationMs: current.length,
            durationFormatted: client.formatDuration(current.length),
            thumbnail: current.thumbnail ?? null,
            isStream: current.isStream,
            sourceName: current.sourceName ?? null,
            requester: {
              id: current.requester?.id ?? null,
              username: current.requester?.username ?? null,
            },
          } : null,
          queue: {
            size: player.queue?.size ?? 0,
            totalDurationMs: player.queue?.reduce((sum, t) => sum + (t.length || 0), 0) ?? 0,
            tracks: (player.queue?.slice(0, 10) ?? []).map((t) => ({
              title: t.title,
              author: t.author,
              durationMs: t.length,
            })),
          },
          voiceChannel: {
            id: player.voiceId,
            name: client.channels.cache.get(player.voiceId)?.name ?? null,
          },
          textChannel: {
            id: player.textId,
            name: client.channels.cache.get(player.textId)?.name ?? null,
          },
        }),
      );
    } catch (err) {
      log(`API error on GET /api/players/${guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch player info."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // ADVANCED: PLAYER CONTROLS (SEEK, SHUFFLE, LOOP, PREVIOUS, PLAY)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/players/:guildId/seek
   * Seek to a specific position in the current track.
   */
  app.post("/api/players/:guildId/seek", auth, async (req, res) => {
    const { guildId } = req.params;
    const { position } = req.body ?? {};

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    if (typeof position !== "number" || position < 0) {
      return res.status(400).json(errorResponse("Bad Request", "Position must be a positive number in milliseconds."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const current = player.queue?.current;
      if (!current) {
        return res.status(400).json(errorResponse("Bad Request", "No track is currently playing."));
      }

      if (current.isStream) {
        return res.status(400).json(errorResponse("Bad Request", "Cannot seek in a stream."));
      }

      if (position > current.length) {
        return res.status(400).json(errorResponse("Bad Request", `Position exceeds track duration (${current.length}ms).`));
      }

      const previousPosition = player.position;
      player.seek(position);

      res.json(
        successResponse({
          guildId,
          action: "seeked",
          previousPositionMs: previousPosition,
          newPositionMs: position,
          trackDurationMs: current.length,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/seek: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to seek."));
    }
  });

  /**
   * POST /api/players/:guildId/shuffle
   * Shuffle the queue.
   */
  app.post("/api/players/:guildId/shuffle", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      if (!player.queue || player.queue.size < 2) {
        return res.status(400).json(errorResponse("Bad Request", "Not enough tracks in queue to shuffle."));
      }

      player.queue.shuffle();

      res.json(
        successResponse({
          guildId,
          action: "shuffled",
          queueSize: player.queue.size,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/shuffle: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to shuffle queue."));
    }
  });

  /**
   * POST /api/players/:guildId/loop
   * Set loop mode for the player.
   */
  app.post("/api/players/:guildId/loop", auth, async (req, res) => {
    const { guildId } = req.params;
    const { mode } = req.body ?? {};

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    const validModes = ["none", "track", "queue"];
    if (!validModes.includes(mode)) {
      return res.status(400).json(errorResponse("Bad Request", `Loop mode must be one of: ${validModes.join(", ")}`));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const previousLoop = player.loop;
      player.setLoop(mode);

      res.json(
        successResponse({
          guildId,
          action: "loop_set",
          previousMode: previousLoop,
          newMode: mode,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/loop: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to set loop mode."));
    }
  });

  /**
   * POST /api/players/:guildId/autoplay
   * Toggle autoplay mode for the player.
   */
  app.post("/api/players/:guildId/autoplay", auth, async (req, res) => {
    const { guildId } = req.params;
    const { enabled } = req.body ?? {};

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const currentStatus = player.data?.get("autoplayStatus") ?? false;
      
      // If enabled is provided, use it; otherwise toggle
      const newStatus = typeof enabled === "boolean" ? enabled : !currentStatus;
      
      if (newStatus) {
        player.data.set("autoplayStatus", true);
      } else {
        player.data.delete("autoplayStatus");
      }

      res.json(
        successResponse({
          guildId,
          action: "autoplay_toggled",
          previousStatus: currentStatus,
          newStatus,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/autoplay: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to toggle autoplay."));
    }
  });

  /**
   * POST /api/players/:guildId/previous
   * Play the previous track.
   */
  app.post("/api/players/:guildId/previous", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const removeFromHistory = true;
      const previousTrack = typeof player.getPrevious === "function"
        ? player.getPrevious(removeFromHistory)
        : player.queue?.previous?.[player.queue.previous.length - 1];
      if (!previousTrack) {
        return res.status(400).json(errorResponse("Bad Request", "No previous track available."));
      }

      await player.play(previousTrack);

      res.json(
        successResponse({
          guildId,
          action: "previous",
          track: {
            title: previousTrack.title,
            author: previousTrack.author,
          },
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/previous: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to play previous track."));
    }
  });

  /**
   * POST /api/players/:guildId/play
   * Search and play a track.
   */
  app.post("/api/players/:guildId/play", auth, async (req, res) => {
    const { guildId } = req.params;
    const { query, source } = req.body ?? {};

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    if (!query || typeof query !== "string" || query.length < 2) {
      return res.status(400).json(errorResponse("Bad Request", "Query must be a string with at least 2 characters."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild. Create a player first."));
      }

      const searchSource = source || "youtube";
      const result = await client.manager.search(query, { requester: { id: "API", username: "API" }, engine: searchSource });

      if (!result || !result.tracks || result.tracks.length === 0) {
        return res.status(404).json(errorResponse("Not Found", "No tracks found for the given query."));
      }

      const track = result.tracks[0];
      player.queue.add(track);

      if (!player.playing && !player.paused) {
        player.play();
      }

      res.json(
        successResponse({
          guildId,
          action: "track_added",
          track: {
            title: track.title,
            author: track.author,
            uri: track.uri,
            durationMs: track.length,
            thumbnail: track.thumbnail ?? null,
          },
          queuePosition: player.queue.size,
          isPlaying: player.playing,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/play: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to play track."));
    }
  });

  /**
   * POST /api/players/:guildId/filters
   * Set audio filters for the player.
   */
  app.post("/api/players/:guildId/filters", auth, async (req, res) => {
    const { guildId } = req.params;
    const filters = req.body ?? {};

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const availableFilters = {
        bassboost: { equalizer: [{ band: 0, gain: 0.6 }, { band: 1, gain: 0.7 }, { band: 2, gain: 0.8 }] },
        nightcore: { timescale: { speed: 1.3, pitch: 1.3, rate: 1.0 } },
        vaporwave: { timescale: { speed: 0.85, pitch: 0.9, rate: 1.0 } },
        pop: { equalizer: [{ band: 0, gain: -0.1 }, { band: 5, gain: 0.15 }, { band: 6, gain: 0.2 }] },
        soft: { equalizer: [{ band: 0, gain: -0.2 }, { band: 1, gain: -0.1 }, { band: 8, gain: 0.1 }] },
        treblebass: { equalizer: [{ band: 0, gain: 0.6 }, { band: 1, gain: 0.67 }, { band: 8, gain: 0.25 }, { band: 9, gain: 0.33 }] },
        "8d": { rotation: { rotationHz: 0.2 } },
        karaoke: { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220, filterWidth: 100 } },
        vibrato: { vibrato: { frequency: 4, depth: 0.75 } },
        tremolo: { tremolo: { frequency: 4, depth: 0.75 } },
        reset: null,
      };

      const { preset, custom } = filters;

      if (preset && !Object.prototype.hasOwnProperty.call(availableFilters, preset)) {
        return res.status(400).json(errorResponse("Bad Request", `Unknown filter preset. Available: ${Object.keys(availableFilters).join(", ")}`));
      }

      let appliedFilter;
      if (preset === "reset") {
        player.shoukaku.clearFilters();
        appliedFilter = "reset";
      } else if (preset) {
        const filterConfig = availableFilters[preset];
        await player.shoukaku.setFilters(filterConfig);
        appliedFilter = preset;
      } else if (custom) {
        await player.shoukaku.setFilters(custom);
        appliedFilter = "custom";
      } else {
        return res.status(400).json(errorResponse("Bad Request", "Provide either 'preset' or 'custom' filter configuration."));
      }

      res.json(
        successResponse({
          guildId,
          action: "filters_applied",
          filter: appliedFilter,
          availablePresets: Object.keys(availableFilters),
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/filters: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to apply filters."));
    }
  });

  /**
   * GET /api/players/:guildId/filters
   * Get available audio filters and current filter state.
   */
  app.get("/api/players/:guildId/filters", auth, (req, res) => {
    const { guildId } = req.params;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const availablePresets = [
        { name: "bassboost", description: "Enhance bass frequencies" },
        { name: "nightcore", description: "Speed up with higher pitch" },
        { name: "vaporwave", description: "Slow down with lower pitch" },
        { name: "pop", description: "Optimize for pop music" },
        { name: "soft", description: "Softer, mellower sound" },
        { name: "treblebass", description: "Enhance both treble and bass" },
        { name: "8d", description: "8D audio rotation effect" },
        { name: "karaoke", description: "Remove vocals (works on some tracks)" },
        { name: "vibrato", description: "Vibrating effect" },
        { name: "tremolo", description: "Wavering volume effect" },
        { name: "reset", description: "Remove all filters" },
      ];

      res.json(
        successResponse({
          guildId,
          currentFilters: player.shoukaku?.filters ?? null,
          availablePresets,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/players/${guildId}/filters: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch filter info."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // QUEUE MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/players/:guildId/queue
   * Get the full queue for a player.
   */
  app.get("/api/players/:guildId/queue", auth, (req, res) => {
    const { guildId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const current = player.queue?.current;
      const queue = player.queue ?? [];
      const total = queue.size ?? 0;
      const limitNum = Math.min(parseInt(limit) || 50, 100);
      const offsetNum = parseInt(offset) || 0;

      const tracks = [...queue].slice(offsetNum, offsetNum + limitNum).map((t, i) => ({
        position: offsetNum + i + 1,
        title: t.title,
        author: t.author,
        uri: t.uri,
        durationMs: t.length,
        thumbnail: t.thumbnail ?? null,
        requester: {
          id: t.requester?.id ?? null,
          username: t.requester?.username ?? null,
        },
      }));

      res.json(
        successResponse({
          guildId,
          currentTrack: current ? {
            title: current.title,
            author: current.author,
            uri: current.uri,
            durationMs: current.length,
            positionMs: player.position,
          } : null,
          queue: {
            total,
            limit: limitNum,
            offset: offsetNum,
            hasMore: offsetNum + limitNum < total,
            totalDurationMs: queue.reduce((sum, t) => sum + (t.length || 0), 0),
            tracks,
          },
        }),
      );
    } catch (err) {
      log(`API error on GET /api/players/${guildId}/queue: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch queue."));
    }
  });

  /**
   * POST /api/players/:guildId/queue
   * Add a track to the queue.
   */
  app.post("/api/players/:guildId/queue", auth, async (req, res) => {
    const { guildId } = req.params;
    const { query, source, position } = req.body ?? {};

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    if (!query || typeof query !== "string" || query.length < 2) {
      return res.status(400).json(errorResponse("Bad Request", "Query must be a string with at least 2 characters."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const searchSource = source || "youtube";
      const result = await client.manager.search(query, { requester: { id: "API", username: "API" }, engine: searchSource });

      if (!result || !result.tracks || result.tracks.length === 0) {
        return res.status(404).json(errorResponse("Not Found", "No tracks found for the given query."));
      }

      const track = result.tracks[0];
      
      if (typeof position === "number" && position >= 0 && position < player.queue.size) {
        player.queue.splice(position, 0, track);
      } else {
        player.queue.add(track);
      }

      res.json(
        successResponse({
          guildId,
          action: "track_queued",
          track: {
            title: track.title,
            author: track.author,
            uri: track.uri,
            durationMs: track.length,
          },
          queuePosition: typeof position === "number" ? position + 1 : player.queue.size,
          totalQueueSize: player.queue.size,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/queue: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to add track to queue."));
    }
  });

  /**
   * DELETE /api/players/:guildId/queue/:index
   * Remove a track from the queue by index.
   */
  app.delete("/api/players/:guildId/queue/:index", auth, (req, res) => {
    const { guildId, index } = req.params;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    const trackIndex = parseInt(index);
    if (isNaN(trackIndex) || trackIndex < 0) {
      return res.status(400).json(errorResponse("Bad Request", "Index must be a non-negative integer."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      if (trackIndex >= player.queue.size) {
        return res.status(404).json(errorResponse("Not Found", `Track at index ${trackIndex} not found. Queue size: ${player.queue.size}`));
      }

      const removed = player.queue.splice(trackIndex, 1)[0];

      res.json(
        successResponse({
          guildId,
          action: "track_removed",
          removedTrack: {
            title: removed?.title ?? null,
            author: removed?.author ?? null,
          },
          index: trackIndex,
          remainingQueueSize: player.queue.size,
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/players/${guildId}/queue/${index}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove track from queue."));
    }
  });

  /**
   * DELETE /api/players/:guildId/queue
   * Clear the entire queue.
   */
  app.delete("/api/players/:guildId/queue", auth, (req, res) => {
    const { guildId } = req.params;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      const previousSize = player.queue.size;
      player.queue.clear();

      res.json(
        successResponse({
          guildId,
          action: "queue_cleared",
          removedTracks: previousSize,
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/players/${guildId}/queue: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to clear queue."));
    }
  });

  /**
   * POST /api/players/:guildId/queue/move
   * Move a track from one position to another in the queue.
   */
  app.post("/api/players/:guildId/queue/move", auth, (req, res) => {
    const { guildId } = req.params;
    const { from, to } = req.body ?? {};

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    if (typeof from !== "number" || typeof to !== "number" || from < 0 || to < 0) {
      return res.status(400).json(errorResponse("Bad Request", "Both 'from' and 'to' must be non-negative integers."));
    }

    try {
      const player = client.manager?.players?.get(guildId);
      if (!player) {
        return res.status(404).json(errorResponse("Not Found", "No active player in this guild."));
      }

      if (from >= player.queue.size || to >= player.queue.size) {
        return res.status(400).json(errorResponse("Bad Request", `Invalid positions. Queue size: ${player.queue.size}`));
      }

      const track = player.queue.splice(from, 1)[0];
      player.queue.splice(to, 0, track);

      res.json(
        successResponse({
          guildId,
          action: "track_moved",
          track: {
            title: track?.title ?? null,
            author: track?.author ?? null,
          },
          from,
          to,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/players/${guildId}/queue/move: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to move track."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // USER PREFERENCES ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/preferences/:userId
   * Get user preferences.
   */
  app.get("/api/preferences/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const preferences = await safeGet(client.db.userPreferences, userId);
      const user = await client.users.fetch(userId).catch(() => null);

      res.json(
        successResponse({
          userId,
          username: user?.username ?? null,
          preferences: preferences ?? {
            searchEngine: "youtube",
            autoplay: false,
            volume: 100,
            announceNowPlaying: true,
          },
        }),
      );
    } catch (err) {
      log(`API error on GET /api/preferences/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch preferences."));
    }
  });

  /**
   * POST /api/preferences/:userId
   * Set user preferences.
   */
  app.post("/api/preferences/:userId", auth, async (req, res) => {
    const { userId } = req.params;
    const preferences = req.body ?? {};

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const existing = await safeGet(client.db.userPreferences, userId) || {};
      
      const allowedKeys = ["searchEngine", "autoplay", "volume", "announceNowPlaying", "theme", "language"];
      const validEngines = ["youtube", "spotify", "soundcloud", "deezer", "apple"];
      
      const updatedPrefs = { ...existing };
      
      for (const key of allowedKeys) {
        if (preferences[key] !== undefined) {
          if (key === "searchEngine" && !validEngines.includes(preferences[key])) {
            return res.status(400).json(errorResponse("Bad Request", `Invalid search engine. Must be one of: ${validEngines.join(", ")}`));
          }
          if (key === "volume" && (typeof preferences[key] !== "number" || preferences[key] < 0 || preferences[key] > 200)) {
            return res.status(400).json(errorResponse("Bad Request", "Volume must be between 0 and 200."));
          }
          updatedPrefs[key] = preferences[key];
        }
      }

      updatedPrefs.updatedAt = Date.now();
      await client.db.userPreferences.set(userId, updatedPrefs);

      res.json(
        successResponse({
          userId,
          action: "preferences_updated",
          preferences: updatedPrefs,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/preferences/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to update preferences."));
    }
  });

  /**
   * DELETE /api/preferences/:userId
   * Reset user preferences to defaults.
   */
  app.delete("/api/preferences/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      await client.db.userPreferences.delete(userId);

      res.json(
        successResponse({
          userId,
          action: "preferences_reset",
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/preferences/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to reset preferences."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // LIKED SONGS ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/liked/:userId
   * Get user's liked songs.
   */
  app.get("/api/liked/:userId", auth, async (req, res) => {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const likedSongs = await safeGet(client.db.likedSongs, userId) || [];
      const user = await client.users.fetch(userId).catch(() => null);

      const total = likedSongs.length;
      const limitNum = Math.min(parseInt(limit) || 50, 100);
      const offsetNum = parseInt(offset) || 0;

      const songs = likedSongs.slice(offsetNum, offsetNum + limitNum).map((song) => ({
        ...song,
        id: song.id ?? song.uri ?? `${song.title ?? "liked-song"}-${song.likedAt ?? song.addedAt ?? 0}`,
      }));

      res.json(
        successResponse({
          userId,
          username: user?.username ?? null,
          total,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < total,
          songs,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/liked/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch liked songs."));
    }
  });

  /**
   * POST /api/liked/:userId
   * Add a song to user's liked songs.
   */
  app.post("/api/liked/:userId", auth, async (req, res) => {
    const { userId } = req.params;
    const { title, author, uri, thumbnail, durationMs } = req.body ?? {};

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    if (!title || !uri) {
      return res.status(400).json(errorResponse("Bad Request", "Title and URI are required."));
    }

    try {
      const likedSongs = await safeGet(client.db.likedSongs, userId) || [];

      // Check if song already exists
      if (likedSongs.some(s => s.uri === uri)) {
        return res.status(409).json(errorResponse("Conflict", "Song is already in liked songs."));
      }

      const song = {
        id: crypto.randomUUID(),
        title: sanitizeString(title, 200),
        author: sanitizeString(author, 100) || "Unknown",
        uri,
        thumbnail: thumbnail || null,
        durationMs: durationMs || 0,
        length: durationMs || 0,
        addedAt: Date.now(),
        likedAt: Date.now(),
      };

      likedSongs.unshift(song);
      await client.db.likedSongs.set(userId, likedSongs);

      res.json(
        successResponse({
          userId,
          action: "song_liked",
          song,
          totalLikedSongs: likedSongs.length,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/liked/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to add liked song."));
    }
  });

  /**
   * DELETE /api/liked/:userId/:songId
   * Remove a song from user's liked songs.
   */
  app.delete("/api/liked/:userId/:songId", auth, async (req, res) => {
    const { userId, songId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const likedSongs = await safeGet(client.db.likedSongs, userId) || [];
      const index = likedSongs.findIndex(s => s.id === songId || s.uri === songId);

      if (index === -1) {
        return res.status(404).json(errorResponse("Not Found", "Song not found in liked songs."));
      }

      const removed = likedSongs.splice(index, 1)[0];
      await client.db.likedSongs.set(userId, likedSongs);

      res.json(
        successResponse({
          userId,
          action: "song_unliked",
          removedSong: removed,
          remainingLikedSongs: likedSongs.length,
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/liked/${userId}/${songId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove liked song."));
    }
  });

  /**
   * DELETE /api/liked/:userId
   * Clear all liked songs for a user.
   */
  app.delete("/api/liked/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const likedSongs = await safeGet(client.db.likedSongs, userId) || [];
      const count = likedSongs.length;

      await client.db.likedSongs.delete(userId);

      res.json(
        successResponse({
          userId,
          action: "liked_songs_cleared",
          removedCount: count,
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/liked/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to clear liked songs."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // FRIENDS ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/friends/:userId
   * Get user's friends list.
   */
  app.get("/api/friends/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const friends = await safeGet(client.db.stats.friends, userId) || [];
      const user = await client.users.fetch(userId).catch(() => null);

      const friendsWithDetails = await Promise.all(
        friends.map(async (f) => {
          const friendUser = await client.users.fetch(f.id).catch(() => null);
          return {
            id: f.id,
            username: friendUser?.username ?? null,
            avatar: friendUser?.displayAvatarURL({ forceStatic: false, size: 128 }) ?? null,
            addedAt: f.addedAt,
          };
        }),
      );

      res.json(
        successResponse({
          userId,
          username: user?.username ?? null,
          friendsCount: friendsWithDetails.length,
          friends: friendsWithDetails,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/friends/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch friends."));
    }
  });

  /**
   * POST /api/friends/:userId/:friendId
   * Add a friend.
   */
  app.post("/api/friends/:userId/:friendId", auth, async (req, res) => {
    const { userId, friendId } = req.params;

    if (!isValidDiscordId(userId) || !isValidDiscordId(friendId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    if (userId === friendId) {
      return res.status(400).json(errorResponse("Bad Request", "Cannot add yourself as a friend."));
    }

    try {
      const friends = await safeGet(client.db.stats.friends, userId) || [];

      if (friends.some(f => f.id === friendId)) {
        return res.status(409).json(errorResponse("Conflict", "User is already a friend."));
      }

      const friendUser = await client.users.fetch(friendId).catch(() => null);
      if (!friendUser) {
        return res.status(404).json(errorResponse("Not Found", "Friend user not found."));
      }

      friends.push({
        id: friendId,
        addedAt: Date.now(),
      });

      await client.db.stats.friends.set(userId, friends);

      res.json(
        successResponse({
          userId,
          action: "friend_added",
          friend: {
            id: friendId,
            username: friendUser.username,
          },
          totalFriends: friends.length,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/friends/${userId}/${friendId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to add friend."));
    }
  });

  /**
   * DELETE /api/friends/:userId/:friendId
   * Remove a friend.
   */
  app.delete("/api/friends/:userId/:friendId", auth, async (req, res) => {
    const { userId, friendId } = req.params;

    if (!isValidDiscordId(userId) || !isValidDiscordId(friendId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const friends = await safeGet(client.db.stats.friends, userId) || [];
      const index = friends.findIndex(f => f.id === friendId);

      if (index === -1) {
        return res.status(404).json(errorResponse("Not Found", "Friend not found."));
      }

      friends.splice(index, 1);
      await client.db.stats.friends.set(userId, friends);

      res.json(
        successResponse({
          userId,
          action: "friend_removed",
          friendId,
          remainingFriends: friends.length,
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/friends/${userId}/${friendId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove friend."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // USER STATS ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/stats/user/:userId
   * Get user statistics (commands used, songs played, etc.)
   */
  app.get("/api/stats/user/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const [commandsUsed, songsPlayed, likedSongs, friends, premiumData] = await Promise.all([
        safeGet(client.db.stats.commandsUsed, userId),
        safeGet(client.db.stats.songsPlayed, userId),
        safeGet(client.db.likedSongs, userId),
        safeGet(client.db.stats.friends, userId),
        safeGet(client.db.botstaff, userId),
      ]);

      const user = await client.users.fetch(userId).catch(() => null);

      // Calculate level based on activity
      const totalActivity = (commandsUsed ?? 0) + (songsPlayed ?? 0);
      const level = Math.floor(totalActivity / ACTIVITY_PER_LEVEL) + 1;

      res.json(
        successResponse({
          userId,
          username: user?.username ?? null,
          avatar: user?.displayAvatarURL({ forceStatic: false, size: 256 }) ?? null,
          stats: {
            commandsUsed: commandsUsed ?? 0,
            songsPlayed: songsPlayed ?? 0,
            likedSongsCount: Array.isArray(likedSongs) ? likedSongs.length : 0,
            friendsCount: Array.isArray(friends) ? friends.length : 0,
            level,
            totalActivity,
          },
          premium: premiumData ? {
            active: true,
            expiresAt: premiumData.expiresAt ?? null,
            permanent: premiumData.permanent ?? false,
          } : null,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/stats/user/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch user stats."));
    }
  });

  /**
   * GET /api/stats/guild/:guildId
   * Get guild statistics (commands used, songs played, etc.)
   */
  app.get("/api/stats/guild/:guildId", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const [commandsUsed, songsPlayed, premiumData, prefix, is247] = await Promise.all([
        safeGet(client.db.stats.commandsUsed, guildId),
        safeGet(client.db.stats.songsPlayed, guildId),
        safeGet(client.db.serverstaff, guildId),
        safeGet(client.db.prefix, guildId),
        safeHas(client.db.twoFourSeven, guildId),
      ]);

      const guild = client.guilds.cache.get(guildId);

      res.json(
        successResponse({
          guildId,
          guildName: guild?.name ?? null,
          icon: guild?.iconURL({ forceStatic: false, size: 256 }) ?? null,
          memberCount: guild?.memberCount ?? null,
          stats: {
            commandsUsed: commandsUsed ?? 0,
            songsPlayed: songsPlayed ?? 0,
          },
          settings: {
            prefix: prefix ?? client.prefix,
            is247,
          },
          premium: premiumData ? {
            active: true,
            expiresAt: premiumData.expiresAt ?? premiumData.expires ?? null,
            permanent: premiumData.permanent ?? false,
          } : null,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/stats/guild/${guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch guild stats."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // BOT MODS MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/botmods
   * Get all bot moderators.
   */
  app.get("/api/botmods", auth, async (_req, res) => {
    try {
      const botmods = await getAllEntries(client.db.botmods);

      const mods = await Promise.all(
        Object.entries(botmods).map(async ([id, data]) => {
          const user = await client.users.fetch(id).catch(() => null);
          return {
            id,
            username: user?.username ?? null,
            tag: user?.tag ?? null,
            avatar: user?.displayAvatarURL({ forceStatic: false, size: 128 }) ?? null,
            addedAt: data?.addedAt ?? null,
            addedBy: data?.addedBy ?? null,
          };
        }),
      );

      res.json(
        successResponse({
          count: mods.length,
          mods,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/botmods: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch bot mods."));
    }
  });

  /**
   * POST /api/botmods/:userId
   * Add a bot moderator.
   */
  app.post("/api/botmods/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const exists = await safeHas(client.db.botmods, userId);
      if (exists) {
        return res.status(409).json(errorResponse("Conflict", "User is already a bot moderator."));
      }

      await client.db.botmods.set(userId, {
        addedAt: Date.now(),
        addedBy: "API",
      });

      const user = await client.users.fetch(userId).catch(() => null);

      res.json(
        successResponse({
          userId,
          username: user?.username ?? null,
          action: "botmod_added",
        }),
      );
    } catch (err) {
      log(`API error on POST /api/botmods/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to add bot mod."));
    }
  });

  /**
   * DELETE /api/botmods/:userId
   * Remove a bot moderator.
   */
  app.delete("/api/botmods/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const exists = await safeHas(client.db.botmods, userId);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", "User is not a bot moderator."));
      }

      await client.db.botmods.delete(userId);

      res.json(
        successResponse({
          userId,
          action: "botmod_removed",
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/botmods/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove bot mod."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // IGNORE MANAGEMENT ENDPOINTS (ADD/REMOVE)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/ignore/:id
   * Add a channel or guild to the ignore list.
   */
  app.post("/api/ignore/:id", auth, async (req, res) => {
    const { id } = req.params;

    if (!isValidDiscordId(id)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid ID format."));
    }

    try {
      const exists = await safeHas(client.db.ignore, id);
      if (exists) {
        return res.status(409).json(errorResponse("Conflict", "ID is already in the ignore list."));
      }

      // Store as true to match bot command format
      await client.db.ignore.set(id, true);

      res.json(
        successResponse({
          id,
          action: "ignored",
        }),
      );
    } catch (err) {
      log(`API error on POST /api/ignore/${id}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to add to ignore list."));
    }
  });

  /**
   * DELETE /api/ignore/:id
   * Remove a channel or guild from the ignore list.
   */
  app.delete("/api/ignore/:id", auth, async (req, res) => {
    const { id } = req.params;

    if (!isValidDiscordId(id)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid ID format."));
    }

    try {
      const exists = await safeHas(client.db.ignore, id);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", "ID is not in the ignore list."));
      }

      await client.db.ignore.delete(id);

      res.json(
        successResponse({
          id,
          action: "unignored",
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/ignore/${id}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove from ignore list."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // BYPASS MANAGEMENT ENDPOINTS (ADD/REMOVE)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/bypass/:userId
   * Add a user to the bypass list.
   */
  app.post("/api/bypass/:userId", auth, async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body ?? {};

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const exists = await safeHas(client.db.bypass, userId);
      if (exists) {
        return res.status(409).json(errorResponse("Conflict", "User already has bypass."));
      }

      await client.db.bypass.set(userId, {
        reason: sanitizeString(reason, 200) || "Bypass added via API",
        addedAt: Date.now(),
        addedBy: "API",
      });

      const user = await client.users.fetch(userId).catch(() => null);

      res.json(
        successResponse({
          userId,
          username: user?.username ?? null,
          action: "bypass_added",
        }),
      );
    } catch (err) {
      log(`API error on POST /api/bypass/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to add bypass."));
    }
  });

  /**
   * DELETE /api/bypass/:userId
   * Remove a user from the bypass list.
   */
  app.delete("/api/bypass/:userId", auth, async (req, res) => {
    const { userId } = req.params;

    if (!isValidDiscordId(userId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid user ID format."));
    }

    try {
      const exists = await safeHas(client.db.bypass, userId);
      if (!exists) {
        return res.status(404).json(errorResponse("Not Found", "User does not have bypass."));
      }

      await client.db.bypass.delete(userId);

      res.json(
        successResponse({
          userId,
          action: "bypass_removed",
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/bypass/${userId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to remove bypass."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PREFIX MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/prefix/:guildId
   * Get guild prefix.
   */
  app.get("/api/prefix/:guildId", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      const customPrefix = await safeGet(client.db.prefix, guildId);

      res.json(
        successResponse({
          guildId,
          guildName: guild?.name ?? null,
          prefix: customPrefix || client.prefix,
          isCustom: !!customPrefix,
          defaultPrefix: client.prefix,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/prefix/${guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch prefix."));
    }
  });

  /**
   * POST /api/prefix/:guildId
   * Set guild prefix.
   */
  app.post("/api/prefix/:guildId", auth, async (req, res) => {
    const { guildId } = req.params;
    const { prefix } = req.body ?? {};

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    if (!prefix || typeof prefix !== "string" || prefix.length > 10) {
      return res.status(400).json(errorResponse("Bad Request", "Prefix must be a string with max 10 characters."));
    }

    try {
      const previousPrefix = await safeGet(client.db.prefix, guildId) || client.prefix;
      await client.db.prefix.set(guildId, prefix);

      res.json(
        successResponse({
          guildId,
          action: "prefix_set",
          previousPrefix,
          newPrefix: prefix,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/prefix/${guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to set prefix."));
    }
  });

  /**
   * DELETE /api/prefix/:guildId
   * Reset guild prefix to default.
   */
  app.delete("/api/prefix/:guildId", auth, async (req, res) => {
    const { guildId } = req.params;

    if (!isValidDiscordId(guildId)) {
      return res.status(400).json(errorResponse("Bad Request", "Invalid guild ID format."));
    }

    try {
      const previousPrefix = await safeGet(client.db.prefix, guildId);
      if (!previousPrefix) {
        return res.status(404).json(errorResponse("Not Found", "Guild has no custom prefix."));
      }

      await client.db.prefix.delete(guildId);

      res.json(
        successResponse({
          guildId,
          action: "prefix_reset",
          previousPrefix,
          currentPrefix: client.prefix,
        }),
      );
    } catch (err) {
      log(`API error on DELETE /api/prefix/${guildId}: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to reset prefix."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // ADVANCED: API METRICS ENDPOINT
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/metrics
   * Get API usage metrics and analytics.
   */
  app.get("/api/metrics", auth, (_req, res) => {
    try {
      const uptimeMs = Date.now() - apiMetrics.startTime;
      const avgLatency = apiMetrics.latency.count > 0
        ? Math.round(apiMetrics.latency.total / apiMetrics.latency.count)
        : 0;

      // Calculate latency per endpoint
      const endpointLatency = {};
      for (const [endpoint, data] of Object.entries(apiMetrics.latency.byEndpoint)) {
        endpointLatency[endpoint] = {
          averageMs: Math.round(data.total / data.count),
          totalRequests: data.count,
        };
      }

      // Get top 10 endpoints by request count
      const topEndpoints = Object.entries(apiMetrics.requests.byEndpoint)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([endpoint, count]) => ({ endpoint, count }));

      // Calculate success rate
      const successCodes = Object.entries(apiMetrics.requests.byStatus)
        .filter(([code]) => parseInt(code) < 400)
        .reduce((sum, [, count]) => sum + count, 0);
      const successRate = apiMetrics.requests.total > 0
        ? ((successCodes / apiMetrics.requests.total) * 100).toFixed(2)
        : 100;

      res.json(
        successResponse({
          uptime: {
            ms: uptimeMs,
            formatted: formatUptime(uptimeMs),
          },
          requests: {
            total: apiMetrics.requests.total,
            byMethod: apiMetrics.requests.byMethod,
            byStatus: apiMetrics.requests.byStatus,
            topEndpoints,
          },
          performance: {
            averageLatencyMs: avgLatency,
            byEndpoint: endpointLatency,
          },
          health: {
            successRate: `${successRate}%`,
            recentErrors: apiMetrics.errors.slice(-10),
          },
        }),
      );
    } catch (err) {
      log(`API error on GET /api/metrics: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to fetch metrics."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // ADVANCED: SEARCH ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/search/guilds
   * Search guilds by name with filters.
   */
  app.get("/api/search/guilds", auth, async (req, res) => {
    try {
      const {
        query = "",
        minMembers,
        maxMembers,
        hasPlayer,
        isPremium,
        limit = 25,
        offset = 0,
      } = req.query;

      let guilds = [...client.guilds.cache.values()];

      // Apply filters
      if (query) {
        const searchQuery = query.toLowerCase();
        guilds = guilds.filter((g) =>
          g.name.toLowerCase().includes(searchQuery) ||
          g.id.includes(searchQuery)
        );
      }

      if (minMembers) {
        guilds = guilds.filter((g) => g.memberCount >= parseInt(minMembers));
      }

      if (maxMembers) {
        guilds = guilds.filter((g) => g.memberCount <= parseInt(maxMembers));
      }

      if (hasPlayer === "true") {
        guilds = guilds.filter((g) => client.manager?.players?.has(g.id));
      } else if (hasPlayer === "false") {
        guilds = guilds.filter((g) => !client.manager?.players?.has(g.id));
      }

      // Premium filter requires async check
      if (isPremium === "true" || isPremium === "false") {
        const premiumGuilds = await getAllEntries(client.db.serverstaff);
        const premiumIds = new Set(Object.keys(premiumGuilds));
        if (isPremium === "true") {
          guilds = guilds.filter((g) => premiumIds.has(g.id));
        } else {
          guilds = guilds.filter((g) => !premiumIds.has(g.id));
        }
      }

      const total = guilds.length;
      const limitNum = Math.min(parseInt(limit) || 25, 100);
      const offsetNum = parseInt(offset) || 0;

      guilds = guilds.slice(offsetNum, offsetNum + limitNum);

      const mapped = guilds.map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberCount,
        icon: g.iconURL({ forceStatic: false, size: 128 }),
        hasPlayer: !!client.manager?.players?.get(g.id),
      }));

      res.json(
        successResponse({
          query,
          total,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < total,
          results: mapped,
        }),
      );
    } catch (err) {
      log(`API error on GET /api/search/guilds: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to search guilds."));
    }
  });

  /**
   * GET /api/search/users
   * Search users across all guilds by username or ID.
   */
  app.get("/api/search/users", auth, async (req, res) => {
    try {
      const { query = "", limit = 25, offset = 0 } = req.query;

      if (!query || query.length < 2) {
        return res.status(400).json(errorResponse("Bad Request", "Query must be at least 2 characters."));
      }

      const searchQuery = query.toLowerCase();
      const results = [];
      const seen = new Set();

      // Search through all guild members
      for (const guild of client.guilds.cache.values()) {
        for (const member of guild.members.cache.values()) {
          if (seen.has(member.user.id)) continue;

          const matches =
            member.user.username.toLowerCase().includes(searchQuery) ||
            member.user.id.includes(searchQuery) ||
            (member.nickname && member.nickname.toLowerCase().includes(searchQuery));

          if (matches) {
            seen.add(member.user.id);
            results.push({
              id: member.user.id,
              username: member.user.username,
              avatar: member.user.displayAvatarURL({ forceStatic: false, size: 128 }),
              bot: member.user.bot,
              mutualGuilds: client.guilds.cache.filter((g) => g.members.cache.has(member.user.id)).size,
            });
          }
        }
      }

      const total = results.length;
      const limitNum = Math.min(parseInt(limit) || 25, 100);
      const offsetNum = parseInt(offset) || 0;

      res.json(
        successResponse({
          query,
          total,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < total,
          results: results.slice(offsetNum, offsetNum + limitNum),
        }),
      );
    } catch (err) {
      log(`API error on GET /api/search/users: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to search users."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // ADVANCED: BATCH OPERATIONS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/batch/blacklist
   * Batch add/remove users from blacklist.
   */
  app.post("/api/batch/blacklist", auth, async (req, res) => {
    const { action, userIds, reason } = req.body ?? {};

    if (!["add", "remove"].includes(action)) {
      return res.status(400).json(errorResponse("Bad Request", "Action must be 'add' or 'remove'."));
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json(errorResponse("Bad Request", "userIds must be a non-empty array."));
    }

    if (userIds.length > 50) {
      return res.status(400).json(errorResponse("Bad Request", "Maximum 50 users per batch operation."));
    }

    try {
      const results = { success: [], failed: [] };

      for (const userId of userIds) {
        if (!/^\d{17,19}$/.test(userId)) {
          results.failed.push({ userId, error: "Invalid user ID format." });
          continue;
        }

        if (action === "add" && client.owners?.includes(userId)) {
          results.failed.push({ userId, error: "Cannot blacklist bot owners." });
          continue;
        }

        try {
          if (action === "add") {
            await client.db.blacklist.set(userId, {
              reason: reason || "Batch blacklisted via API",
              at: Date.now(),
              by: "API",
            });
          } else {
            await client.db.blacklist.delete(userId);
          }
          results.success.push(userId);
        } catch (err) {
          results.failed.push({ userId, error: err.message });
        }
      }

      res.json(
        successResponse({
          action,
          total: userIds.length,
          successCount: results.success.length,
          failedCount: results.failed.length,
          results,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/batch/blacklist: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to process batch blacklist."));
    }
  });

  /**
   * POST /api/batch/premium
   * Batch add/remove premium from users.
   */
  app.post("/api/batch/premium", auth, async (req, res) => {
    const { action, userIds, days, permanent } = req.body ?? {};

    if (!["add", "remove"].includes(action)) {
      return res.status(400).json(errorResponse("Bad Request", "Action must be 'add' or 'remove'."));
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json(errorResponse("Bad Request", "userIds must be a non-empty array."));
    }

    if (userIds.length > 50) {
      return res.status(400).json(errorResponse("Bad Request", "Maximum 50 users per batch operation."));
    }

    if (action === "add" && !permanent && (!days || typeof days !== "number" || days < 1 || days > 365)) {
      return res.status(400).json(errorResponse("Bad Request", "Days must be between 1 and 365 for non-permanent premium."));
    }

    try {
      const results = { success: [], failed: [] };

      for (const userId of userIds) {
        if (!/^\d{17,19}$/.test(userId)) {
          results.failed.push({ userId, error: "Invalid user ID format." });
          continue;
        }

        try {
          if (action === "add") {
            const data = {
              redeemedAt: Date.now(),
              addedBy: "API (Batch)",
            };

            if (permanent) {
              data.permanent = true;
            } else {
              data.expiresAt = Date.now() + days * 86400000;
            }

            await client.db.botstaff.set(userId, data);
          } else {
            await client.db.botstaff.delete(userId);
          }
          results.success.push(userId);
        } catch (err) {
          results.failed.push({ userId, error: err.message });
        }
      }

      res.json(
        successResponse({
          action,
          total: userIds.length,
          successCount: results.success.length,
          failedCount: results.failed.length,
          results,
        }),
      );
    } catch (err) {
      log(`API error on POST /api/batch/premium: ${err.message}`, "error");
      res.status(500).json(errorResponse("Server Error", "Failed to process batch premium."));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // ADVANCED: WEBHOOK MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/webhooks
   * Get all webhook subscriptions.
   */
  app.get("/api/webhooks", auth, (_req, res) => {
    const subscriptions = [];
    for (const [event, subs] of webhookSubscriptions) {
      for (const sub of subs) {
        subscriptions.push({
          id: sub.id,
          event,
          url: sub.url,
          createdAt: sub.createdAt,
        });
      }
    }

    res.json(
      successResponse({
        count: subscriptions.length,
        availableEvents: ["player.start", "player.end", "player.pause", "player.resume", "guild.join", "guild.leave"],
        subscriptions,
      }),
    );
  });

  /**
   * POST /api/webhooks
   * Create a new webhook subscription.
   */
  app.post("/api/webhooks", auth, (req, res) => {
    const { event, url, secret } = req.body ?? {};

    const validEvents = ["player.start", "player.end", "player.pause", "player.resume", "guild.join", "guild.leave"];

    if (!validEvents.includes(event)) {
      return res.status(400).json(errorResponse("Bad Request", `Event must be one of: ${validEvents.join(", ")}`));
    }

    if (!url || !/^https?:\/\/.+/.test(url)) {
      return res.status(400).json(errorResponse("Bad Request", "Valid URL is required."));
    }

    const id = crypto.randomUUID();
    const subscription = {
      id,
      url,
      secret: secret || crypto.randomBytes(16).toString("hex"),
      createdAt: Date.now(),
    };

    if (!webhookSubscriptions.has(event)) {
      webhookSubscriptions.set(event, []);
    }
    webhookSubscriptions.get(event).push(subscription);

    res.status(201).json(
      successResponse({
        id,
        event,
        url,
        secret: subscription.secret,
        message: "Webhook subscription created. Keep the secret safe for signature verification.",
      }),
    );
  });

  /**
   * DELETE /api/webhooks/:webhookId
   * Delete a webhook subscription.
   */
  app.delete("/api/webhooks/:webhookId", auth, (req, res) => {
    const { webhookId } = req.params;

    for (const [event, subs] of webhookSubscriptions) {
      const index = subs.findIndex((s) => s.id === webhookId);
      if (index !== -1) {
        subs.splice(index, 1);
        return res.json(
          successResponse({
            webhookId,
            event,
            action: "deleted",
          }),
        );
      }
    }

    res.status(404).json(errorResponse("Not Found", "Webhook subscription not found."));
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // ADVANCED: WEBSOCKET SUPPORT FOR REAL-TIME UPDATES
  // ══════════════════════════════════════════════════════════════════════════════

  // WebSocket clients store
  const wsClients = new Set();

  /**
   * Broadcast message to all connected WebSocket clients.
   * @param {string} type - Message type.
   * @param {object} data - Message data.
   */
  function broadcastToWebSocket(type, data) {
    const message = JSON.stringify({
      type,
      timestamp: new Date().toISOString(),
      data,
    });

    for (const wsClient of wsClients) {
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(message);
      }
    }

    // Also send webhook notification
    sendWebhookNotification(type, data);
  }

  // Store broadcast function on client for use by player events
  client.apiBroadcast = broadcastToWebSocket;

  // ══════════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING & SERVER START
  // ══════════════════════════════════════════════════════════════════════════════

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json(errorResponse("Not Found", "The requested endpoint does not exist."));
  });

  // Error handler
  app.use(errorHandler);

  // Create HTTP server and WebSocket server
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/api/ws" });

  // WebSocket connection handler
  wss.on("connection", (ws, req) => {
    // Authenticate WebSocket connection
    let url;
    try {
      // Use a fixed parse base to avoid trusting user-controlled Host headers.
      url = new URL(req.url, SAFE_URL_PARSE_BASE);
    } catch {
      ws.close(1002, "Invalid WebSocket URL format. Expected /api/ws?apiKey=<key>");
      return;
    }
    if (url.pathname !== "/api/ws") {
      ws.close(1008, "Invalid WebSocket path");
      return;
    }
    const providedKey = url.searchParams.get("apiKey") || req.headers["x-api-key"];

    if (!providedKey || providedKey !== apiKey) {
      ws.close(1008, "Unauthorized: Invalid or missing API key");
      return;
    }

    log("WebSocket client connected", "debug");
    wsClients.add(ws);

    // Send welcome message
    ws.send(JSON.stringify({
      type: "connection",
      timestamp: new Date().toISOString(),
      data: {
        message: "Connected to Nerox Bot WebSocket API",
        version: API_VERSION,
        availableEvents: ["player.start", "player.end", "player.pause", "player.resume", "guild.join", "guild.leave"],
      },
    }));

    ws.on("close", () => {
      log("WebSocket client disconnected", "debug");
      wsClients.delete(ws);
    });

    ws.on("error", (err) => {
      log(`WebSocket error: ${err.message}`, "error");
      wsClients.delete(ws);
    });

    // Handle incoming messages (for ping/pong or subscriptions)
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
        }
      } catch {
        // Ignore invalid messages
      }
    });
  });

  // Start server with WebSocket support
  server.listen(port, () => {
    log(`REST API server listening on port ${port}`, "info");
    log(`API endpoints available at http://localhost:${port}/api`, "info");
    log(`WebSocket endpoint available at ws://localhost:${port}/api/ws`, "info");
    log(`API Version: ${API_VERSION}`, "info");
  }).on("error", (err) => {
    log(`Failed to start REST API server on port ${port}: ${err.message}`, "error");
  });
}
