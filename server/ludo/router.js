// HTTP routes for Ludo. Every request is authenticated; the body only ever
// carries intents ("roll", "move token 2") — never dice values or positions.
"use strict";

const express = require("express");

// Generous per-player limit that only trips on runaway clients.
const DEFAULT_RATE_LIMIT = { windowMs: 10_000, max: 60 };

function createLudoRouter({ service, requireUser, rateLimit = DEFAULT_RATE_LIMIT }) {
  const router = express.Router();
  const hits = new Map(); // uid -> { count, resetAt }

  const rateLimited = (uid) => {
    const now = Date.now();
    const entry = hits.get(uid);
    if (!entry || entry.resetAt < now) {
      hits.set(uid, { count: 1, resetAt: now + rateLimit.windowMs });
      if (hits.size > 5000) for (const [key, value] of hits) if (value.resetAt < now) hits.delete(key);
      return false;
    }
    entry.count += 1;
    return entry.count > rateLimit.max;
  };

  const handle = (fn) => async (req, res) => {
    if (rateLimited(req.user.uid)) {
      return res.status(429).send({ error: "Too many requests, slow down a little.", code: "RATE_LIMITED", serverTime: Date.now() });
    }
    try {
      const out = await fn(req.user.uid, req.body || {});
      res.status(200).send({ ...out, serverTime: Date.now() });
    } catch (error) {
      if (error && error.name === "LudoError") {
        res.status(error.status).send({ error: error.message, code: error.code, ...error.extra, serverTime: Date.now() });
      } else {
        console.error("Ludo request failed:", error);
        res.status(500).send({ error: "The server hit a problem. Please try again.", code: "SERVER_ERROR", serverTime: Date.now() });
      }
    }
  };

  router.post("/create", requireUser, handle((uid, body) => service.create(uid, body)));
  router.post("/action", requireUser, handle((uid, body) => service.act(uid, body)));
  return router;
}

module.exports = { createLudoRouter };
