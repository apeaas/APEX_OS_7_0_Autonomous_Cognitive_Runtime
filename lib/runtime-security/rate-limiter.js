"use strict";

class SlidingWindowRateLimiter {
  constructor(options = {}) {
    this.windowMs = positive(options.windowMs, 60_000);
    this.maxRequests = positive(options.maxRequests, 120);
    this.maxKeys = positive(options.maxKeys, 1_000);
    this.clock = options.clock || (() => Date.now());
    this.buckets = new Map();
  }

  consume(key) {
    const now = this.clock();
    const normalized = String(key || "anonymous");
    const active = (this.buckets.get(normalized) || []).filter(timestamp => now - timestamp < this.windowMs);
    if (active.length >= this.maxRequests) {
      return {
        ok: false,
        retryAfterMs: Math.max(1, this.windowMs - (now - active[0])),
        remaining: 0,
      };
    }
    active.push(now);
    this.buckets.set(normalized, active);
    if (this.buckets.size > this.maxKeys) this.prune(now);
    return { ok: true, remaining: Math.max(0, this.maxRequests - active.length) };
  }

  prune(now = this.clock()) {
    for (const [key, bucket] of this.buckets) {
      const active = bucket.filter(timestamp => now - timestamp < this.windowMs);
      if (active.length) this.buckets.set(key, active);
      else this.buckets.delete(key);
    }
  }
}

function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = { SlidingWindowRateLimiter };
