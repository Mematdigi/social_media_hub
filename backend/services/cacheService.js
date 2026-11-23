// services/cacheService.js
// ─────────────────────────────────────────────────────────────────────────────
// One cache for the whole backend: Redis when REDIS_URL is set, otherwise memory.
//
//   backend/.env
//     REDIS_URL=redis://127.0.0.1:6379        (install: sudo apt install redis-server)
//     FEED_CACHE_SECONDS=600                   how long live Facebook / Instagram / YouTube / X
//                                              posts and likes are reused (default 10 minutes)
//   npm install ioredis                        (in backend/) — without it the memory cache is used
//
// Why: every Posts page used to re-read Facebook, Instagram, YouTube and X on each open.
// YouTube search costs 100 of your 10,000 daily quota units, and every X read is billed.
// With the cache those reads happen at most once per FEED_CACHE_SECONDS per account.
// Redis keeps the cache when the backend restarts and if you run more than one backend process.
// If Redis is down, everything still works (memory cache) — it never breaks a request.
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const axios  = require('axios');
const logger = require('../utils/logger');

const PREFIX = 'sh:';
const memory = new Map();
let redis = null;
let redisReady = false;

const connect = () => {
  const url = String(process.env.REDIS_URL || '').trim();
  if (!url) return;
  let Redis;
  try {
    Redis = require('ioredis'); // optional dependency
  } catch (_) {
    logger.info('🧠', 'REDIS_URL is set but ioredis is not installed (cd backend && npm install ioredis) — using memory cache');
    return;
  }
  redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
  redis.on('ready', () => { redisReady = true; logger.info('🧠', 'Redis cache connected'); });
  redis.on('end', () => { redisReady = false; });
  redis.on('error', (error) => {
    if (redisReady) logger.error('Redis cache error (falling back to memory)', error.message);
    redisReady = false;
  });
};
connect();

const memGet = (key) => {
  const hit = memory.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) { memory.delete(key); return undefined; }
  return hit.value;
};

const memSet = (key, value, ttlSeconds) => {
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  if (memory.size > 5000) { // keep memory small: drop the oldest entries
    const drop = [...memory.keys()].slice(0, 1000);
    drop.forEach(k => memory.delete(k));
  }
};

const get = async (key) => {
  const k = PREFIX + key;
  if (redisReady) {
    try {
      const raw = await redis.get(k);
      return raw == null ? undefined : JSON.parse(raw);
    } catch (_) { /* fall through to memory */ }
  }
  return memGet(k);
};

const set = async (key, value, ttlSeconds = 600) => {
  const k = PREFIX + key;
  memSet(k, value, ttlSeconds);
  if (redisReady) {
    try { await redis.set(k, JSON.stringify(value), 'EX', Math.max(1, Math.round(ttlSeconds))); } catch (_) { /* memory still has it */ }
  }
  return value;
};

const del = async (key) => {
  const k = PREFIX + key;
  memory.delete(k);
  if (redisReady) { try { await redis.del(k); } catch (_) { /* ignore */ } }
};

// Two requests for the same key at the same time share one loader call
const inFlight = new Map();

// Return the cached value, or run loader() once and cache its result (errors are never cached)
const wrap = async (key, ttlSeconds, loader) => {
  const hit = await get(key);
  if (hit !== undefined) return hit;
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = (async () => {
    try {
      const value = await loader();
      if (value !== undefined) await set(key, value, ttlSeconds);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
};

const hash = (value) => crypto.createHash('sha1').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

const feedTtl = () => Math.max(30, Number(process.env.FEED_CACHE_SECONDS) || 600);

// Drop-in for axios.get(url, config) on read-only social API calls: same { data } shape.
// The key includes the access token (hashed), so every account has its own cache entry.
const cachedGet = async (url, config = {}, ttlSeconds = feedTtl()) => {
  const key = `get:${hash({ url, params: config.params || null, auth: config.headers?.Authorization || null })}`;
  const data = await wrap(key, ttlSeconds, async () => (await axios.get(url, config)).data);
  return { data };
};

const status = () => ({ backend: redisReady ? 'redis' : 'memory', redisConfigured: Boolean(process.env.REDIS_URL) });

module.exports = { get, set, del, wrap, hash, cachedGet, feedTtl, status };
