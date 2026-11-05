// The Legend of Jak: player accounts, cloud saves, leaderboards and password reset.
// Email + password sign-in; progress is stored per account so a player can pick up their tour on any device.
// Passwords are hashed with scrypt (random salt per account) and never stored or logged in plain text.
// Session tokens are random; only their SHA-256 hash is stored, so a leaked store can't be replayed as logins.
// Password reset links work the same way: the emailed token is random and only its hash is stored, for one hour.
import crypto from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_DAYS = 365;
const MAX_SAVE_BYTES = 64 * 1024;
const MAX_FAILS = 8;               // wrong passwords in a row before a short lockout
const LOCK_MS = 15 * 60 * 1000;
const SIGNUPS_PER_HOUR = 20;       // per network address
const RESET_MINUTES = 60;          // how long an emailed reset link works
const RESETS_PER_HOUR = 3;         // reset emails per account per hour
const BOARD_MAX_AGE_MS = 3 * 60 * 1000; // leaderboards are rebuilt at most this often on demand (and every 10 minutes on a schedule)
const TOP_N = 10;

// Disco Points: everything a player has done on the tour, in one number
const PTS = { gold: 500, boss: 2000, record: 250, part: 1000, quest: 300 };
// sanity caps: anything past these is treated as a tampered save and kept off the boards
const CAP = { resortScore: 400000, gold: 60, boss: 30, records: 80, parts: 20, quests: 60, crew: 400 };

// player names are shown publicly on the leaderboards, so keep them clean
const BAD_ANYWHERE = ["FUCK", "FUK", "SHIT", "CUNT", "NIGG", "NIGA", "FAG", "BITCH", "DICK", "COCK", "PUSSY", "SLUT", "WHORE", "RAPE", "NAZI", "HITLER", "KKK", "PORN", "PENIS", "VAGINA", "TITS", "CUMSHOT", "RETARD", "SPIC", "KIKE", "CHINK", "WANK", "TWAT", "JIZZ", "DILDO"];
const BAD_WORD = ["ASS", "CUM", "SEX", "HOE", "FAGS", "ANUS", "BOOB", "BOOBS"];
export function badName(n) {
  const flat = String(n || "").toUpperCase().replace(/0/g, "O").replace(/1|!/g, "I").replace(/3/g, "E").replace(/4/g, "A").replace(/5/g, "S").replace(/7/g, "T");
  const squash = flat.replace(/[^A-Z]/g, "");
  if (BAD_ANYWHERE.some((w) => squash.includes(w))) return true;
  return flat.split(/[^A-Z]+/).some((w) => BAD_WORD.includes(w));
}

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
const num = (v, max) => { const n = Math.floor(+v); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };

// the week starts Monday at midnight, Missoula time
export function weekKey(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday] || 0;
  const u = new Date(Date.UTC(+p.year, +p.month - 1, +p.day - back));
  return u.toISOString().slice(0, 10);
}

// turn the stats a game client sends into a leaderboard entry (or null if it can't count)
export function makeEntry(name, lb) {
  if (!lb || typeof lb !== "object" || lb.dev) return null;
  const res = {};
  let sum = 0, bad = false;
  for (const [id, v] of Object.entries(lb.res || {}).slice(0, 80)) {
    if (!/^[a-z0-9_]{1,24}$/.test(id)) continue;
    const s = Math.floor(+v);
    if (!Number.isFinite(s) || s <= 0) continue;
    if (s > CAP.resortScore) { bad = true; continue; }
    res[id] = s; sum += s;
  }
  const gold = num(lb.gold, CAP.gold), boss = num(lb.bosses, CAP.boss), records = num(lb.records, CAP.records),
    parts = num(lb.parts, CAP.parts), quests = num(lb.quests, CAP.quests), crew = num(lb.crew, CAP.crew);
  if (+lb.gold > CAP.gold || +lb.records > CAP.records || +lb.crew > CAP.crew) bad = true;
  const pts = sum + gold * PTS.gold + boss * PTS.boss + records * PTS.record + parts * PTS.part + quests * PTS.quest;
  let wk = null;
  if (lb.wk && typeof lb.wk === "object" && /^\d{4}-\d{2}-\d{2}$/.test(lb.wk.k || "")) {
    let w = 0;
    for (const v of Object.values(lb.wk.best || {}).slice(0, 80)) { const s = Math.floor(+v); if (Number.isFinite(s) && s > 0 && s <= CAP.resortScore) w += s; }
    if (w > 0) wk = { k: lb.wk.k, pts: w };
  }
  return { name, pts, res, gold, boss, records, parts, quests, crew, wk, flagged: bad, t: Date.now() };
}

// value of an entry on a given board (0 = not on that board)
function boardValue(e, board, week) {
  if (!e || e.flagged) return 0;
  if (board === "pts") return e.pts || 0;
  if (board === "wk") return e.wk && e.wk.k === week ? e.wk.pts : 0;
  if (board === "crew") return e.crew || 0;
  if (board === "crate") return e.records || 0;
  if (board.startsWith("res:")) return (e.res && e.res[board.slice(4)]) || 0;
  return 0;
}

export function buildBoards(entries, week) {
  const ids = new Set(["pts", "wk", "crew", "crate"]);
  for (const e of entries) for (const id of Object.keys(e.res || {})) ids.add("res:" + id);
  const boards = {};
  for (const b of ids) {
    const rows = entries.map((e) => ({ n: e.name, v: boardValue(e, b, week), t: e.t || 0 })).filter((r) => r.v > 0)
      .sort((a, c) => c.v - a.v || a.t - c.t);
    boards[b] = { top: rows.slice(0, TOP_N).map((r) => ({ n: r.n, v: r.v })), vals: rows.map((r) => r.v) };
  }
  return boards;
}

// where a value would rank on a board: 1 + number of strictly better scores
function rankOf(vals, v) {
  let lo = 0, hi = vals.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] > v) lo = m + 1; else hi = m; }
  return { rank: lo + 1, gap: lo > 0 ? vals[lo - 1] - v : 0 };
}

export async function rebuildBoards(store) {
  const entries = [];
  const { blobs } = await store.list({ prefix: "lb/e/" });
  for (let i = 0; i < blobs.length; i += 40) {
    const got = await Promise.all(blobs.slice(i, i + 40).map((b) => store.get(b.key, { type: "json" }).catch(() => null)));
    for (const e of got) if (e) entries.push(e);
  }
  const week = weekKey();
  const cache = { at: Date.now(), week, players: entries.filter((e) => !e.flagged && e.pts > 0).length, boards: buildBoards(entries, week) };
  await store.setJSON("lb/cache", cache);
  return cache;
}

// ---- email: password reset links go out through MailerSend or Resend, whichever key is set in Netlify ----
export function mailReady(env) { return !!(env.MAILERSEND_API_KEY || env.RESEND_API_KEY); }
async function sendMail(env, to, subject, text, html) {
  const from = env.MAIL_FROM || "game@discocarrot.com", fromName = env.MAIL_FROM_NAME || "Disco Carrot";
  if (env.MAILERSEND_API_KEY) {
    const r = await fetch("https://api.mailersend.com/v1/email", { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + env.MAILERSEND_API_KEY },
      body: JSON.stringify({ from: { email: from, name: fromName }, to: [{ email: to }], subject, text, html }) });
    if (!r.ok) throw new Error("mailersend " + r.status);
    return;
  }
  if (env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", { method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + env.RESEND_API_KEY },
      body: JSON.stringify({ from: `${fromName} <${from}>`, to: [to], subject, text, html }) });
    if (!r.ok) throw new Error("resend " + r.status);
    return;
  }
  throw new Error("no mail provider");
}

// ---- newsletter: every new account joins the MailerLite list (disclosed on the sign-up screen) ----
export async function syncNewsletter(store, env, onlyKey) {
  if (!env.MAILERLITE_API_KEY) return 0;
  const keys = onlyKey ? [onlyKey] : (await store.list({ prefix: "nlq/" })).blobs.map((b) => b.key);
  let done = 0;
  for (const key of keys.slice(0, 200)) {
    const q = await store.get(key, { type: "json" });
    if (!q) continue;
    const body = { email: q.email, fields: { name: q.name }, ...(env.MAILERLITE_GROUP_ID ? { groups: [env.MAILERLITE_GROUP_ID] } : {}) };
    try {
      const r = await fetch("https://connect.mailerlite.com/api/subscribers", { method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer " + env.MAILERLITE_API_KEY },
        body: JSON.stringify(body) });
      if (r.ok || r.status === 422) { await store.delete(key); done++; }
    } catch (e) { console.error("jak-api newsletter", e && e.message); }
  }
  return done;
}

export function makeHandler(getStore, getEnv = () => ({})) {
  async function session(req, store) {
    const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(req.headers.get("authorization") || "");
    if (!m) return null;
    const s = await store.get("s/" + sha(m[1]), { type: "json" });
    if (!s || s.exp < Date.now()) return null;
    const u = await store.get("u/" + s.uid, { type: "json" });
    if (!u || (s.sv || 0) !== (u.sv || 0)) return null; // a password reset signs out every old session
    return { ...s, u, key: "s/" + sha(m[1]) };
  }
  async function newSession(store, uid, sv) {
    const token = crypto.randomBytes(32).toString("base64url");
    await store.setJSON("s/" + sha(token), { uid, sv: sv || 0, exp: Date.now() + SESSION_DAYS * 864e5 });
    return token;
  }
  async function readBody(req) {
    const t = await req.text();
    if (t.length > MAX_SAVE_BYTES + 8192) throw Object.assign(new Error("too big"), { status: 413 });
    try { return JSON.parse(t || "{}"); } catch { throw Object.assign(new Error("bad json"), { status: 400 }); }
  }
  // public names are first come, first served
  async function claimName(store, name, uid) {
    const k = "n/" + name, cur = await store.get(k, { type: "json" });
    if (cur && cur.uid !== uid) return false;
    if (!cur) await store.setJSON(k, { uid });
    return true;
  }
  async function putEntry(store, uid, name, lb) {
    if (!lb) return;
    const e = makeEntry(name, lb);
    if (e) await store.setJSON("lb/e/" + uid, e);
    else if (lb.dev) await store.delete("lb/e/" + uid); // DEV-mode accounts never sit on the boards
  }

  return async function handler(req, context = {}) {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^.*\/api\/jak/, "") || "/";
    const store = getStore(), env = getEnv();
    try {
      if (route === "/health" && req.method === "GET") {
        let storeOk = false;
        try { await store.get("health/ping", { type: "json" }); storeOk = true; } catch (e) { console.error("jak-api store", e && e.message); }
        return json(storeOk ? 200 : 503, { ok: storeOk, store: storeOk, mail: mailReady(env), newsletter: !!env.MAILERLITE_API_KEY });
      }

      if (route === "/signup" && req.method === "POST") {
        const b = await readBody(req);
        const email = cleanEmail(b.email), pw = String(b.password || ""), name = cleanName(b.name) || "PLAYER";
        if (!okEmail(email)) return json(400, { error: "That email doesn't look right." });
        if (pw.length < 8 || pw.length > 200) return json(400, { error: "Use a password with at least 8 characters." });
        if (badName(name)) return json(400, { error: "Pick a different player name. It shows on the leaderboards." });
        const ipKey = "ip/" + sha((context.ip || "?") + "|" + Math.floor(Date.now() / 3.6e6));
        const ipc = (await store.get(ipKey, { type: "json" })) || { n: 0 };
        if (ipc.n >= SIGNUPS_PER_HOUR) return json(429, { error: "Too many new accounts from here. Try again later." });
        const uid = sha(email), ukey = "u/" + uid;
        if (await store.get(ukey, { type: "json" })) return json(409, { error: "There's already an account with that email. Sign in instead." });
        if (!(await claimName(store, name, uid))) return json(409, { error: `${name} is taken. Pick another player name.`, field: "name" });
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = (await scrypt(pw, salt)).toString("hex");
        await store.setJSON(ukey, { email, name, salt, hash, created: Date.now(), fails: 0, lockUntil: 0, sv: 0,
          age13: b.age13 === true, newsletter: { at: Date.now(), via: "signup disclosure" } });
        await store.setJSON(ipKey, { n: ipc.n + 1 });
        await store.setJSON("nlq/" + uid, { email, name, at: Date.now() });
        syncNewsletter(store, env, "nlq/" + uid).catch(() => {});
        let save = null, t = 0;
        if (b.save && typeof b.save === "object") {
          const raw = JSON.stringify(b.save);
          if (raw.length <= MAX_SAVE_BYTES) { t = +b.t || Date.now(); save = b.save; await store.setJSON("save/" + uid, { save, t }); }
        }
        await putEntry(store, uid, name, b.lb);
        const token = await newSession(store, uid, 0);
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
        await claimName(store, u.name, uid).catch(() => {});
        const token = await newSession(store, uid, u.sv);
        const sv = (await store.get("save/" + uid, { type: "json" })) || { save: null, t: 0 };
        return json(200, { token, email: u.email, name: u.name, save: sv.save, t: sv.t });
      }

      if (route === "/forgot" && req.method === "POST") {
        const b = await readBody(req);
        const email = cleanEmail(b.email);
        if (!okEmail(email)) return json(400, { error: "That email doesn't look right." });
        if (!mailReady(env)) return json(503, { error: "Password reset emails aren't switched on yet. Email hello@discocarrot.com from this address and we'll get you back in." });
        const ok = json(200, { ok: true, message: "If there's an account with that email, a reset link is on its way. Check your inbox (and spam). The link works for one hour." });
        const uid = sha(email), u = await store.get("u/" + uid, { type: "json" });
        if (!u) return ok;
        const rk = "rq/" + uid + "|" + Math.floor(Date.now() / 3.6e6), rc = (await store.get(rk, { type: "json" })) || { n: 0 };
        if (rc.n >= RESETS_PER_HOUR) return ok;
        await store.setJSON(rk, { n: rc.n + 1 });
        const token = crypto.randomBytes(32).toString("base64url");
        await store.setJSON("r/" + sha(token), { uid, exp: Date.now() + RESET_MINUTES * 6e4 });
        const link = (env.SITE_URL || "https://www.discocarrot.com") + "/game/?reset=" + token;
        const text = `Hi ${u.name},\n\nSomeone asked to reset the password for your Legend of Jak account. Tap this link to pick a new one (it works for one hour):\n\n${link}\n\nIf that wasn't you, ignore this email and your password stays the same.\n\nDisco Carrot\nMissoula, Montana`;
        const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#140b22"><p>Hi ${u.name},</p><p>Someone asked to reset the password for your <b>Legend of Jak</b> account. Tap the button to pick a new one. It works for one hour.</p><p><a href="${link}" style="display:inline-block;background:#ff5c00;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px">Reset my password</a></p><p style="font-size:13px;color:#555">Or paste this into your browser:<br>${link}</p><p>If that wasn't you, ignore this email and your password stays the same.</p><p>Disco Carrot<br>Missoula, Montana</p></div>`;
        try { await sendMail(env, u.email, "Reset your Legend of Jak password", text, html); }
        catch (e) { console.error("jak-api mail", e && e.message); return json(502, { error: "We couldn't send the email just now. Try again in a few minutes." }); }
        return ok;
      }

      if (route === "/reset" && req.method === "POST") {
        const b = await readBody(req);
        const token = String(b.token || ""), pw = String(b.password || "");
        if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return json(400, { error: "That reset link isn't valid. Ask for a new one." });
        if (pw.length < 8 || pw.length > 200) return json(400, { error: "Use a password with at least 8 characters." });
        const rkey = "r/" + sha(token), r = await store.get(rkey, { type: "json" });
        if (!r || r.exp < Date.now()) return json(400, { error: "That reset link has expired. Ask for a new one." });
        const u = await store.get("u/" + r.uid, { type: "json" });
        if (!u) return json(400, { error: "That account is gone." });
        u.salt = crypto.randomBytes(16).toString("hex");
        u.hash = (await scrypt(pw, u.salt)).toString("hex");
        u.sv = (u.sv || 0) + 1; u.fails = 0; u.lockUntil = 0;
        await store.setJSON("u/" + r.uid, u);
        await store.delete(rkey);
        const tok = await newSession(store, r.uid, u.sv);
        const sv = (await store.get("save/" + r.uid, { type: "json" })) || { save: null, t: 0 };
        return json(200, { token: tok, email: u.email, name: u.name, save: sv.save, t: sv.t });
      }

      if (route === "/save") {
        const s = await session(req, store);
        if (!s) return json(401, { error: "Please sign in again." });
        if (req.method === "GET") {
          const sv = (await store.get("save/" + s.uid, { type: "json" })) || { save: null, t: 0 };
          return json(200, { email: s.u.email, name: s.u.name, save: sv.save, t: sv.t });
        }
        if (req.method === "PUT") {
          const b = await readBody(req);
          if (!b.save || typeof b.save !== "object") return json(400, { error: "Missing save." });
          if (JSON.stringify(b.save).length > MAX_SAVE_BYTES) return json(413, { error: "Save is too big." });
          const t = +b.t || Date.now();
          const cur = await store.get("save/" + s.uid, { type: "json" });
          if (cur && cur.t > t) return json(409, { error: "A newer save is already stored.", t: cur.t, save: cur.save });
          await store.setJSON("save/" + s.uid, { save: b.save, t });
          await putEntry(store, s.uid, s.u.name, b.lb);
          return json(200, { ok: true, t });
        }
      }

      if (route === "/leaderboard" && req.method === "GET") {
        let cache = await store.get("lb/cache", { type: "json" });
        if (!cache || Date.now() - cache.at > BOARD_MAX_AGE_MS || cache.week !== weekKey()) cache = await rebuildBoards(store);
        const s = await session(req, store).catch(() => null);
        let me = null;
        if (s) {
          const e = await store.get("lb/e/" + s.uid, { type: "json" });
          me = { name: s.u.name, on: !!e && !e.flagged, boards: {} };
          if (e && !e.flagged) for (const [b, bd] of Object.entries(cache.boards)) {
            const v = boardValue(e, b, cache.week);
            if (v > 0) {
              const at = bd.vals.indexOf(v), vals = at < 0 ? bd.vals : bd.vals.slice(0, at).concat(bd.vals.slice(at + 1)); // leave out our own row
              me.boards[b] = { v, ...rankOf(vals, v), of: Math.max(bd.vals.length, 1) };
            }
          }
        }
        const boards = {};
        for (const [b, bd] of Object.entries(cache.boards)) boards[b] = { top: bd.top, n: bd.vals.length };
        return json(200, { at: cache.at, week: cache.week, players: cache.players, boards, me });
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
