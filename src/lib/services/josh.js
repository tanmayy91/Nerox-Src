import { Database } from "quickmongo";

// ---------------------------------------------------------------------------
// Singleton parent — one shared MongoDB connection for the whole bot.
// Connection options are tuned for lowest possible latency:
//   • larger pool  → fewer waits for a free socket
//   • minPoolSize  → connections are kept warm, no cold-start on first query
//   • short server-selection timeout → fail fast on bad URI
// ---------------------------------------------------------------------------
let _parent = null;

function getParent() {
  if (!_parent) {
    _parent = new Database(process.env.MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 5000,
    });
  }
  return _parent;
}

// Call once at startup (before Discord login) to open the connection.
export async function connectMongoDB() {
  const db = getParent();
  await db.connect();
  return db;
}

// ---------------------------------------------------------------------------
// QuickMongoTable — drop-in replacement for @joshdb/core instances.
//
// Speed strategy: write-through in-memory cache (Map) per collection.
//   • get / has  → served from RAM after first access, zero network round-trip
//   • set        → updates cache immediately then persists to MongoDB async
//   • delete     → evicts from cache then removes from MongoDB
//   • all()      → full MongoDB scan that also warms the cache
//   • .keys      → derived from all() (keeps cache warm as a side-effect)
//
// API surface is identical to @joshdb/core — no other files need to change.
// ---------------------------------------------------------------------------
class QuickMongoTable {
  constructor(collectionName) {
    this._collectionName = collectionName;
    this._db = null;
    this._cache = new Map(); // in-memory write-through cache
  }

  // Lazily connect the child collection on first use,
  // reusing the parent's already-open connection (no extra TCP handshake).
  async _getDb() {
    if (!this._db) {
      const parent = getParent();
      this._db = new Database(process.env.MONGO_URI, {
        collectionName: this._collectionName,
        child: true,
        parent,
        shareConnectionFromParent: true,
      });
      await this._db.connect();
    }
    return this._db;
  }

  // Awaitable property — mirrors @joshdb/core `.keys` getter.
  // Calls all() so the cache is always fully warmed after this.
  get keys() {
    return this.all().then((entries) => entries.map((e) => e.ID));
  }

  async get(key) {
    // Cache hit → pure RAM, no network
    if (this._cache.has(key)) return this._cache.get(key);
    const value = await (await this._getDb()).get(key);
    if (value !== null && value !== undefined) this._cache.set(key, value);
    return value;
  }

  async set(key, value) {
    this._cache.set(key, value); // update cache first for instant reads
    return (await this._getDb()).set(key, value);
  }

  async has(key) {
    if (this._cache.has(key)) return true;
    return (await this._getDb()).has(key);
  }

  async delete(key) {
    this._cache.delete(key); // evict from cache
    return (await this._getDb()).delete(key);
  }

  // quickmongo returns [{ID, data}] — same shape as @joshdb/core ✓
  // Warm the full cache while we're here.
  async all() {
    const entries = await (await this._getDb()).all();
    for (const entry of entries) this._cache.set(entry.ID, entry.data);
    return entries;
  }
}

// Replace "/" with "_" — MongoDB collection names must not contain slashes.
export const josh = (name) => new QuickMongoTable(name.replace("/", "_"));
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
