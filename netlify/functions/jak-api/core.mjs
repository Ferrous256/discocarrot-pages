// The Legend of Jak: player accounts and cloud saves.
// Email + password sign-in; progress is stored per account so a player can pick up their tour on any device.
// Passwords are hashed with scrypt (random salt per account) and never stored or logged in plain text.
// Session tokens are random; only their SHA-256 hash is stored, so a leaked store can't be replayed as logins.
import crypto from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_DAYS = 365;
const MAX_SAVE_BYTES = 64 * 1024;
const MAX_FAILS = 8;               // wrong passwords in a row before a short lockout
const LOCK_MS = 15 * 60 * 1000;
const SIGNUPS_PER_HOUR = 20;       // per network address

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const scrypt = (pw, salt) =>
  new Promise((res, rej) => crypto.scrypt(pw, salt, 64, SCRYPT, (e, k) => (e ? rej(e) : res(k))));
const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
const cleanEmail = (v) => String(v || "").trim().toLowerCase();
const okEmail = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const cleanName = (v) =>
  String(v || "").toUpperCase().replace(/[^A-Z0-9 .!\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 10);

export function makeHandler(getStore) {
  async function session(req, store) {
    const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(req.headers.get("authorization") || "");
    if (!m) return null;
    const s = await store.get("s/" + sha(m[1]), { type: "json" });
    if (!s || s.exp < Date.now()) return null;
    return { ...s, key: "s/" + sha(m[1]) };
  }
  async function newSession(store, uid) {
    const token = crypto.randomBytes(32).toString("base64url");
    await store.setJSON("s/" + sha(token), { uid, exp: Date.now() + SESSION_DAYS * 864e5 });
    return token;
  }
  async function readBody(req) {
    const t = await req.text();
    if (t.length > MAX_SAVE_BYTES + 4096) throw Object.assign(new Error("too big"), { status: 413 });
    try { return JSON.parse(t || "{}"); } catch { throw Object.assign(new Error("bad json"), { status: 400 }); }
  }

  return async function handler(req, context = {}) {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^.*\/api\/jak/, "") || "/";
    const store = getStore();
    try {
      if (route === "/health" && req.method === "GET") return json(200, { ok: true });

      if (route === "/signup" && req.method === "POST") {
        const b = await readBody(req);
        const email = cleanEmail(b.email), pw = String(b.password || ""), name = cleanName(b.name) || "PLAYER";
        if (!okEmail(email)) return json(400, { error: "That email doesn't look right." });
        if (pw.length < 8 || pw.length > 200) return json(400, { error: "Use a password with at least 8 characters." });
        const ipKey = "ip/" + sha((context.ip || "?") + "|" + Math.floor(Date.now() / 3.6e6));
        const ipc = (await store.get(ipKey, { type: "json" })) || { n: 0 };
        if (ipc.n >= SIGNUPS_PER_HOUR) return json(429, { error: "Too many new accounts from here. Try again later." });
        const uid = sha(email), ukey = "u/" + uid;
        if (await store.get(ukey, { type: "json" })) return json(409, { error: "There's already an account with that email. Sign in instead." });
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = (await scrypt(pw, salt)).toString("hex");
        await store.setJSON(ukey, { email, name, salt, hash, created: Date.now(), fails: 0, lockUntil: 0 });
        await store.setJSON(ipKey, { n: ipc.n + 1 });
        let save = null, t = 0;
        if (b.save && typeof b.save === "object") {
          const raw = JSON.stringify(b.save);
          if (raw.length <= MAX_SAVE_BYTES) { t = +b.t || Date.now(); save = b.save; await store.setJSON("save/" + uid, { save, t }); }
        }
        const token = await newSession(store, uid);
        return json(201, { token, email, name, save, t });
      }

      if (route === "/login" && req.method === "POST") {
        const b = await readBody(req);
        const email = cleanEmail(b.email), pw = String(b.password || "");
        const uid = sha(email), ukey = "u/" + uid;
        const u = okEmail(email) ? await store.get(ukey, { type: "json" }) : null;
        const fail = () => json(401, { error: "Wrong email or password." });
        if (!u) { await scrypt(pw, "0000000000000000"); return fail(); } // same work either way
        if (u.lockUntil > Date.now()) return json(429, { error: "Too many tries. Wait 15 minutes and try again." });
        const got = await scrypt(pw, u.salt), want = Buffer.from(u.hash, "hex");
        if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
          u.fails = (u.fails || 0) + 1;
          if (u.fails >= MAX_FAILS) { u.fails = 0; u.lockUntil = Date.now() + LOCK_MS; }
          await store.setJSON(ukey, u);
          return fail();
        }
        if (u.fails || u.lockUntil) { u.fails = 0; u.lockUntil = 0; await store.setJSON(ukey, u); }
        const token = await newSession(store, uid);
        const sv = (await store.get("save/" + uid, { type: "json" })) || { save: null, t: 0 };
        return json(200, { token, email: u.email, name: u.name, save: sv.save, t: sv.t });
      }

      if (route === "/save") {
        const s = await session(req, store);
        if (!s) return json(401, { error: "Please sign in again." });
        if (req.method === "GET") {
          const u = (await store.get("u/" + s.uid, { type: "json" })) || {};
          const sv = (await store.get("save/" + s.uid, { type: "json" })) || { save: null, t: 0 };
          return json(200, { email: u.email, name: u.name, save: sv.save, t: sv.t });
        }
        if (req.method === "PUT") {
          const b = await readBody(req);
          if (!b.save || typeof b.save !== "object") return json(400, { error: "Missing save." });
          if (JSON.stringify(b.save).length > MAX_SAVE_BYTES) return json(413, { error: "Save is too big." });
          const t = +b.t || Date.now();
          const cur = await store.get("save/" + s.uid, { type: "json" });
          if (cur && cur.t > t) return json(409, { error: "A newer save is already stored.", t: cur.t, save: cur.save });
          await store.setJSON("save/" + s.uid, { save: b.save, t });
          return json(200, { ok: true, t });
        }
      }

      if (route === "/logout" && req.method === "POST") {
        const s = await session(req, store);
        if (s) await store.delete(s.key);
        return json(200, { ok: true });
      }

      return json(404, { error: "Not found." });
    } catch (e) {
      if (e && e.status) return json(e.status, { error: e.status === 413 ? "Too big." : "Bad request." });
      console.error("jak-api", e && e.message);
      return json(500, { error: "Something went wrong on our side. Your progress is still saved on this device." });
    }
  };
}
