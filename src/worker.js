// Lisio — serveur : comptes, préférences, progression, notes, livres (fichiers dans le stockage local R2 de wrangler).
// Tourne sur ton PC avec « wrangler dev » : les données restent dans le dossier data/. La transcription passe par Whisper (whisper/server.py).
const DAY = 86400;
const WHISPER = "http://127.0.0.1:8765"; // whisper/server.py
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const bad = (msg, status = 400) => json({ error: msg }, status);

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function hashPass(password, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  // 100 000 = maximum accepté par Workers
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return `${b64(salt)}:${b64(bits)}`;
}
function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// « Se souvenir de moi » : 60 jours ; sinon cookie de session (fermé avec le navigateur) et 1 jour max côté serveur
const ipOf = (req) => req.headers.get("cf-connecting-ip") || "";
const uaOf = (req) => (req.headers.get("user-agent") || "").slice(0, 300);
// admin : cookie « aid », 30 jours si « se souvenir de cet appareil », sinon 12 h
async function newSession(env, userId, remember, req, kind = "user") {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "");
  const life = kind === "admin" ? (remember ? 30 * DAY : DAY / 2) : remember ? 60 * DAY : DAY;
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires, ip, ua, seen, kind) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(token, userId, Math.floor(Date.now() / 1000) + life, ipOf(req), uaOf(req), Date.now(), kind).run();
  // Secure seulement en https (tunnel) : sur le réseau local en http, le téléphone refuserait sinon le cookie
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${kind === "admin" ? "aid" : "sid"}=${token}; Path=/; HttpOnly${secure}; SameSite=Lax${remember ? `; Max-Age=${life}` : ""}`;
}
const tokenOf = (req, name) => (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([A-Za-z0-9]+)`))?.[1];
async function currentUser(req, env, kind = "user") {
  const token = tokenOf(req, kind === "admin" ? "aid" : "sid");
  if (!token) return null;
  const u = await env.DB.prepare("SELECT u.id, u.email, u.name, u.prefs, u.status, s.seen, s.token FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.kind = ? AND s.expires > ?")
    .bind(token, kind, Math.floor(Date.now() / 1000)).first();
  if (!u || u.status === "suspended") return null;
  if (Date.now() - u.seen > 60_000) { // activité notée au plus une fois par minute
    await env.DB.batch([
      env.DB.prepare("UPDATE sessions SET seen = ?, ip = ?, ua = ? WHERE token = ?").bind(Date.now(), ipOf(req), uaOf(req), token),
      env.DB.prepare("UPDATE users SET seen = ?, ip = ? WHERE id = ?").bind(Date.now(), ipOf(req), u.id),
    ]);
  }
  return u;
}
// code de partage : 12 caractères sans 0/O/1/I pour éviter les confusions
const shareCode = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const sha = async (s) => b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

async function body(req) {
  try { return await req.json(); } catch { return null; }
}
const validEmail = (e) => typeof e === "string" && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validId = (s) => typeof s === "string" && /^[a-z0-9_-]{1,64}$/i.test(s);
const int = (n) => Number.isInteger(n) && n >= 0 && n < 1e8;

async function api(req, env, path) {
  const method = req.method;

  if (path === "/api/signup" || path === "/api/login") {
    const b = await body(req);
    const email = b?.email?.trim().toLowerCase();
    if (!validEmail(email) || typeof b.password !== "string" || b.password.length < 6 || b.password.length > 200)
      return bad("Email ou mot de passe invalide (6 caractères minimum).");
    const row = await env.DB.prepare("SELECT id, pass, status FROM users WHERE email = ?").bind(email).first();
    let id;
    if (path === "/api/signup") {
      if (env.SIGNUP === "off") return bad("Les inscriptions sont fermées sur ce serveur.", 403);
      const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : "";
      if (!name) return bad("Choisis un nom ou un pseudo.");
      if (row) return bad("Un compte existe déjà avec cet email.", 409);
      const r = await env.DB.prepare("INSERT INTO users (email, name, pass, created, ip, seen) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(email, name, await hashPass(b.password), Date.now(), ipOf(req), Date.now()).run();
      id = r.meta.last_row_id;
    } else {
      if (!row || !sameHash(await hashPass(b.password, row.pass.split(":")[0]), row.pass))
        return bad("Email ou mot de passe incorrect.", 401);
      if (row.status === "suspended") return bad("Ce compte est suspendu.", 403);
      id = row.id;
    }
    return json({ ok: true }, 200, { "set-cookie": await newSession(env, id, b.remember !== false, req) });
  }

  // Partage vers un autre PC Lisio : infos publiques d'un livre par son code (ses fichiers sont servis dans /books/<id>/)
  const sm = path.match(/^\/api\/share\/([A-Z0-9]{12})$/);
  if (sm && method === "GET") {
    const bk = await env.DB.prepare("SELECT id, title, author, year, colors, duration FROM books WHERE share = ? AND r2 = 1 AND status = 'ready'").bind(sm[1]).first();
    return bk ? json({ ...bk, colors: JSON.parse(bk.colors) }, 200, { "access-control-allow-origin": "*" }) : json({ error: "Code inconnu." }, 404, { "access-control-allow-origin": "*" });
  }

  // ---------- PC relié : un site en ligne sans stockage envoie les fichiers au PC de son hébergeur, qui transcrit et les garde ----------
  if (path === "/api/health") return json({ ok: true });
  // stockage de ce PC, utilisé par le site en ligne relié (clé QUEUE_KEY)
  const st = path.match(/^\/api\/store\/([a-z0-9-]{1,64}\/(?:book\.pdf|book\.json|pdf\.json|job\.json|audio\/\d{3}\.mp3))$/);
  if (st) {
    if (!env.QUEUE_KEY || !env.R2 || env.R2.remote || req.headers.get("x-queue-key") !== env.QUEUE_KEY) return bad("Interdit.", 403);
    if (method === "PUT") return r2Put(req, env, st[1], req.headers.get("content-type") || "application/octet-stream", 200e6);
    return (await env.R2.head(st[1])) ? json({ ok: true }) : bad("Introuvable.", 404);
  }
  // scripts/link.mjs : le PC donne sa clé avec le code affiché dans les Paramètres du site en ligne
  if (path === "/api/pc/link" && method === "POST") {
    const b = await body(req), pc = await pcRow(env);
    if (!pc?.pair_code || pc.pair_exp < Date.now() || String(b?.code || "").toUpperCase() !== pc.pair_code || !/^\w{32,128}$/.test(b?.key || "")) return bad("Code invalide ou expiré.", 403);
    await env.DB.prepare("UPDATE pc SET key = ?, owner = pair_owner, url = NULL, pair_code = NULL WHERE id = 1").bind(b.key).run();
    return json({ ok: true });
  }
  // scripts/tunnel.mjs : adresse publique actuelle du PC (tunnel Cloudflare gratuit, elle change à chaque lancement)
  if (path === "/api/pc/url" && method === "POST") {
    const b = await body(req), pc = await pcRow(env), k = req.headers.get("x-queue-key");
    const self = env.R2 && !env.R2.remote && env.QUEUE_KEY && k === env.QUEUE_KEY; // ce PC : adresse pour le téléphone
    if (!(self || (pc?.key && k === pc.key)) || !/^https:\/\/[a-z0-9.-]+$/i.test(b?.url || "")) return bad("Interdit.", 403);
    await env.DB.prepare("INSERT INTO pc (id, url, updated) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET url = ?1, updated = ?2").bind(b.url, Date.now()).run();
    return json({ ok: true });
  }

  // File d'attente : scripts/queue.mjs (sur le PC, clé QUEUE_KEY de .dev.vars) transcrit et synchronise les livres envoyés
  if (path.startsWith("/api/queue")) {
    const qk = env.QUEUE_KEY || (env.R2?.remote && (await pcRow(env))?.key);
    if (!qk || !env.R2 || req.headers.get("x-queue-key") !== qk) return bad("Interdit.", 403);
    if (path === "/api/queue" && method === "GET")
      return json((await env.DB.prepare("SELECT id, title, author FROM books WHERE status = 'queued' AND r2 = 1 ORDER BY created").all()).results);
    const q = path.match(/^\/api\/queue\/([a-z0-9-]{1,64})\/(book\.json|progress|done|fail)$/);
    const bk = q && await env.DB.prepare("SELECT status FROM books WHERE id = ? AND r2 = 1").bind(q[1]).first();
    if (bk?.status !== "queued") return bad("Livre introuvable.", 404);
    if (q[2] === "book.json" && method === "PUT") return r2Put(req, env, `${q[1]}/book.json`, "application/json", 100e6);
    const b = await body(req);
    if (q[2] === "progress") {
      await env.DB.prepare("INSERT INTO jobs (book_id, progress, error, updated) VALUES (?, ?, NULL, ?) ON CONFLICT (book_id) DO UPDATE SET progress = excluded.progress, error = NULL, updated = excluded.updated")
        .bind(q[1], Math.min(100, Math.max(0, +b?.progress || 0)), Date.now()).run();
      if (+b?.eta >= 0) await env.DB.prepare("INSERT INTO job_eta (book_id, ends) VALUES (?1, ?2) ON CONFLICT (book_id) DO UPDATE SET ends = ?2").bind(q[1], Date.now() + Math.min(+b.eta, 864000) * 1000).run();
      return json({ ok: true });
    }
    if (q[2] === "done") {
      if (!(b?.duration > 0) || !(await env.R2.head(`${q[1]}/book.json`))) return bad("Livre incomplet.");
      await env.DB.batch([env.DB.prepare("UPDATE books SET status = 'ready', duration = ? WHERE id = ?").bind(b.duration, q[1]), env.DB.prepare("DELETE FROM jobs WHERE book_id = ?").bind(q[1]), env.DB.prepare("DELETE FROM job_eta WHERE book_id = ?").bind(q[1])]);
      return json({ ok: true });
    }
    await env.DB.batch([env.DB.prepare("UPDATE books SET status = 'failed' WHERE id = ?").bind(q[1]), env.DB.prepare("DELETE FROM job_eta WHERE book_id = ?").bind(q[1]),
      env.DB.prepare("INSERT INTO jobs (book_id, progress, error, updated) VALUES (?, 0, ?, ?) ON CONFLICT (book_id) DO UPDATE SET error = excluded.error, updated = excluded.updated").bind(q[1], String(b?.error || "Erreur").slice(0, 500), Date.now())]);
    return json({ ok: true });
  }

  const user = await currentUser(req, env);
  if (!user) return bad("Non connecté.", 401);

  if (path === "/api/logout") {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token = ?")
      .bind(user.id, (req.headers.get("cookie") || "").match(/sid=([A-Za-z0-9]+)/)?.[1] || "").run();
    return json({ ok: true }, 200, { "set-cookie": "sid=; Path=/; Max-Age=0" });
  }
  if (path === "/api/me") {
    const progress = await env.DB.prepare("SELECT book_id, word, time, updated FROM progress WHERE user_id = ?").bind(user.id).all();
    return json({ email: user.email, name: user.name, prefs: JSON.parse(user.prefs), progress: progress.results });
  }
  if (path === "/api/name" && method === "PUT") {
    const name = (await body(req))?.name;
    if (typeof name !== "string" || !name.trim() || name.length > 40) return bad("Nom invalide.");
    await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name.trim(), user.id).run();
    return json({ ok: true });
  }
  if (path === "/api/prefs" && method === "PUT") {
    const txt = await req.text();
    if (txt.length > 1_500_000) return bad("Préférences trop lourdes (image de fond trop grande).", 413);
    try { JSON.parse(txt); } catch { return bad("JSON invalide."); }
    await env.DB.prepare("UPDATE users SET prefs = ? WHERE id = ?").bind(txt, user.id).run();
    return json({ ok: true });
  }

  let m;
  if ((m = path.match(/^\/api\/progress\/([^/]+)$/)) && method === "PUT") {
    const b = await body(req);
    if (!validId(m[1]) || !int(b?.word) || typeof b.time !== "number") return bad("Progression invalide.");
    await env.DB.prepare("INSERT INTO progress (user_id, book_id, word, time, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, book_id) DO UPDATE SET word = excluded.word, time = excluded.time, updated = excluded.updated")
      .bind(user.id, m[1], b.word, b.time, Date.now()).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/notes\/([^/]+)$/)) && method === "GET") {
    const r = await env.DB.prepare("SELECT id, kind, w0, w1, color, title, body, pos, updated FROM notes WHERE user_id = ? AND book_id = ? ORDER BY w0")
      .bind(user.id, m[1]).all();
    return json(r.results.map((n) => ({ ...n, pos: n.pos ? JSON.parse(n.pos) : null })));
  }
  if ((m = path.match(/^\/api\/notes\/([^/]+)\/([^/]+)$/))) {
    const [, book, id] = m;
    if (!validId(book) || !validId(id)) return bad("Identifiant invalide.");
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(id, user.id).run();
      return json({ ok: true });
    }
    if (method === "PUT") {
      const b = await body(req);
      if (!b || !["note", "hl"].includes(b.kind) || !int(b.w0) || !int(b.w1) || typeof b.color !== "string" || b.color.length > 30
        || typeof b.body !== "string" || b.body.length > 20000 || b.w1 < b.w0 || (b.title ?? "").length > 200) return bad("Note invalide.");
      // l'id est choisi par le client (création hors ligne possible) : on refuse d'écraser la note d'un autre compte
      const owner = await env.DB.prepare("SELECT user_id FROM notes WHERE id = ?").bind(id).first();
      if (owner && owner.user_id !== user.id) return bad("Interdit.", 403);
      const pos = b.pos && Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y) ? JSON.stringify({ x: Math.min(1.2, Math.max(-0.2, b.pos.x)), y: Math.min(1, Math.max(0, b.pos.y)) }) : "";
      await env.DB.prepare("INSERT INTO notes (id, user_id, book_id, kind, w0, w1, color, title, body, pos, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, w0 = excluded.w0, w1 = excluded.w1, color = excluded.color, title = excluded.title, body = excluded.body, pos = excluded.pos, updated = excluded.updated")
        .bind(id, user.id, book, b.kind, b.w0, b.w1, b.color, String(b.title ?? ""), b.body, pos, Date.now()).run();
      return json({ ok: true });
    }
  }
  // Bibliothèque personnelle : titre, auteur, année, couverture modifiés, ou livre retiré (hidden)
  if (path === "/api/library" && method === "GET") {
    const r = await env.DB.prepare("SELECT book_id, title, author, year, colors, hidden FROM library WHERE user_id = ?").bind(user.id).all();
    // livres d'un autre compte, pas reçus par un code : invisibles (un livre sans propriétaire reste visible par tous)
    const deny = await env.DB.prepare("SELECT id FROM books WHERE owner_id != 0 AND owner_id != ?1 AND id NOT IN (SELECT book_id FROM library WHERE user_id = ?1 AND added = 1)").bind(user.id).all();
    return json({ rows: r.results.map((x) => ({ ...x, colors: x.colors ? JSON.parse(x.colors) : null })), deny: deny.results.map((x) => x.id) });
  }
  if ((m = path.match(/^\/api\/books\/([^/]+)\/claim$/)) && method === "POST") {
    if (!validId(m[1])) return bad("Livre invalide.");
    await env.DB.prepare("INSERT OR IGNORE INTO books (id, owner_id, created) VALUES (?, ?, ?)").bind(m[1], user.id, Date.now()).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/books\/([^/]+)\/share$/)) && method === "POST") {
    if (!validId(m[1])) return bad("Livre invalide.");
    const bk = await env.DB.prepare("SELECT owner_id, share FROM books WHERE id = ?").bind(m[1]).first();
    const can = !bk || bk.owner_id === 0 || bk.owner_id === user.id || await env.DB.prepare("SELECT 1 FROM library WHERE user_id = ? AND book_id = ? AND added = 1").bind(user.id, m[1]).first();
    if (!can) return bad("Interdit.", 403);
    if (bk?.share) return json({ code: bk.share });
    const code = shareCode();
    if (bk) await env.DB.prepare("UPDATE books SET share = ? WHERE id = ?").bind(code, m[1]).run();
    else await env.DB.prepare("INSERT INTO books (id, owner_id, share, created) VALUES (?, 0, ?, ?)").bind(m[1], code, Date.now()).run(); // livre commun : reste visible par tous
    return json({ code });
  }
  if (path === "/api/share" && method === "POST") {
    const code = String((await body(req))?.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const bk = code.length === 12 && await env.DB.prepare("SELECT id FROM books WHERE share = ?").bind(code).first();
    if (!bk) return bad("Code inconnu.", 404);
    await env.DB.prepare("INSERT INTO library (user_id, book_id, hidden, added) VALUES (?, ?, 0, 1) ON CONFLICT (user_id, book_id) DO UPDATE SET hidden = 0, added = 1").bind(user.id, bk.id).run();
    return json({ id: bk.id });
  }
  if ((m = path.match(/^\/api\/library\/([^/]+)$/)) && method === "PUT") {
    const b = await body(req), s = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : null);
    if (!validId(m[1]) || !b) return bad("Livre invalide.");
    const colors = Array.isArray(b.colors) && b.colors.length === 2 && b.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)) ? JSON.stringify(b.colors) : null;
    await env.DB.prepare("INSERT INTO library (user_id, book_id, title, author, year, colors, hidden) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, book_id) DO UPDATE SET title = excluded.title, author = excluded.author, year = excluded.year, colors = excluded.colors, hidden = excluded.hidden")
      .bind(user.id, m[1], s(b.title, 120), s(b.author, 120), s(b.year, 10), colors, b.hidden ? 1 : 0).run();
    return json({ ok: true });
  }
  // ---------- Ajout de livres : transcription par Whisper sur ce PC (whisper/server.py) ----------
  if (path === "/api/ai/quota" && method === "GET") {
    // site en ligne : PC relié joignable → prêt ; PC relié éteint → 503 (le livre attend sur l'appareil) ; aucun PC relié
    if (!env.R2 || env.R2.remote) {
      if (!env.R2) return (await pcRow(env))?.key ? bad("Le PC ne répond pas.", 503) : json({ storage: false, ready: false, cloud: true });
      return (await fetch(env.R2.remote + "/api/health").then((r) => r.ok).catch(() => false)) ? json({ storage: true, ready: true, cloud: true }) : bad("Le PC ne répond pas.", 503);
    }
    const ok = await fetch(WHISPER + "/health").then((r) => r.ok).catch(() => false);
    return json({ storage: true, ready: ok });
  }
  // Lisio hébergé sur ce PC : adresse publique actuelle (tunnel) pour l'ouvrir sur le téléphone
  if (path === "/api/pc/address" && method === "GET")
    return json({ url: env.R2 && !env.R2.remote ? (await pcRow(env))?.url || null : null });
  if (path === "/api/pc/pair" && method === "POST") {
    const pc = await pcRow(env);
    if (pc?.owner && pc.owner !== user.id) return bad("Un autre compte a déjà relié son PC à ce site.", 403);
    const code = shareCode().slice(0, 8);
    await env.DB.prepare("INSERT INTO pc (id, pair_code, pair_exp, pair_owner) VALUES (1, ?1, ?2, ?3) ON CONFLICT (id) DO UPDATE SET pair_code = ?1, pair_exp = ?2, pair_owner = ?3")
      .bind(code, Date.now() + 15 * 60000, user.id).run();
    return json({ code });
  }
  if (path === "/api/books" && method === "POST") {
    const b = await body(req), s = (v, k) => (typeof v === "string" ? v.trim().slice(0, k) : "");
    const title = s(b?.title, 120); if (!title) return bad("Titre manquant.");
    const colors = Array.isArray(b.colors) && b.colors.length === 2 && b.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)) ? b.colors : ["#7a2e22", "#3d1712"];
    const id = (slug(title) || "livre") + "-" + shareCode().slice(0, 6).toLowerCase(); // suffixe aléatoire : adresse impossible à deviner
    await env.DB.prepare("INSERT INTO books (id, owner_id, created, title, author, year, colors, status, r2) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1)")
      .bind(id, user.id, Date.now(), title, s(b.author, 120), s(b.year, 10), JSON.stringify(colors)).run();
    return json({ id });
  }
  // fichiers d'un livre en cours d'ajout, puis « queue » (le PC transcrit) ou « publish » (livre copié d'un autre PC, déjà synchronisé)
  if ((m = path.match(/^\/api\/books\/([a-z0-9-]{1,64})\/(?:files\/(book\.pdf|book\.json|pdf\.json|job\.json|audio\/\d{3}\.mp3)|(publish|queue|retry))$/))) {
    const bk = await env.DB.prepare("SELECT owner_id, status FROM books WHERE id = ? AND r2 = 1").bind(m[1]).first();
    if (!bk || bk.owner_id !== user.id || bk.status !== (m[3] === "retry" ? "failed" : "draft")) return bad("Interdit.", 403);
    if (m[2] && method === "PUT")
      return r2Put(req, env, `${m[1]}/${m[2]}`, m[2].endsWith(".pdf") ? "application/pdf" : m[2].endsWith(".json") ? "application/json" : "audio/mpeg", m[2] === "book.pdf" ? 200e6 : m[2].endsWith(".json") ? 100e6 : 60e6);
    if ((m[3] === "queue" || m[3] === "retry") && method === "POST") {
      for (const f of ["book.pdf", "pdf.json", "job.json"]) if (!(await env.R2.head(`${m[1]}/${f}`))) return bad("Livre incomplet.");
      await env.DB.batch([env.DB.prepare("UPDATE books SET status = 'queued' WHERE id = ?").bind(m[1]), env.DB.prepare("DELETE FROM jobs WHERE book_id = ?").bind(m[1])]);
      return json({ ok: true });
    }
    if (m[3] && method === "POST") {
      const d = (await body(req))?.duration;
      if (typeof d !== "number" || !(d > 0) || !(await env.R2.head(`${m[1]}/book.json`))) return bad("Livre incomplet.");
      await env.DB.prepare("UPDATE books SET status = 'ready', duration = ? WHERE id = ?").bind(d, m[1]).run();
      return json({ ok: true });
    }
  }
  return bad("Introuvable.", 404);
}

async function r2Put(req, env, key, type, max) {
  const n = +req.headers.get("content-length") || 0;
  if (!n || n > max) return bad("Fichier trop gros.", 413);
  const { readable, writable } = new FixedLengthStream(n);
  req.body.pipeTo(writable).catch(() => {});
  try { await env.R2.put(key, readable, { httpMetadata: { contentType: type, cacheControl: type === "application/json" ? "no-cache" : "public, max-age=604800" } }); }
  catch { return bad("Le PC ne répond pas.", 503); } // PC relié éteint
  return json({ ok: true });
}
const pcRow = (env) => env.DB.prepare("SELECT * FROM pc WHERE id = 1").first().catch(() => null);
// « R2 » d'un site en ligne relié : les fichiers sont envoyés au PC et lus chez lui
function pcStore(pc) {
  const store = (key) => `${pc.url}/api/store/${key}`;
  return {
    remote: pc.url,
    async put(key, body, o) {
      const r = await fetch(store(key), { method: "PUT", headers: { "x-queue-key": pc.key, "content-type": o?.httpMetadata?.contentType || "application/octet-stream" }, body });
      if (!r.ok) throw new Error("PC " + r.status);
    },
    head: (key) => fetch(store(key), { headers: { "x-queue-key": pc.key } }).then((r) => (r.ok ? {} : null)),
  };
}

// Catalogue : livres statiques + livres ajoutés visibles par ce compte (les siens ou reçus par un code) ; ses livres en file d'attente avec leur état
async function catalogJson(req, env) {
  const stat = await env.ASSETS.fetch(new Request(new URL("/books/index.json", req.url))).then((r) => r.json()).catch(() => []);
  const user = await currentUser(req, env);
  const own = user ? (await env.DB.prepare("SELECT b.id, b.title, b.author, b.year, b.duration, b.colors, b.status, j.progress, j.error, MAX(0, (e.ends - ?2) / 1000) AS left FROM books b LEFT JOIN jobs j ON j.book_id = b.id LEFT JOIN job_eta e ON e.book_id = b.id WHERE b.r2 = 1 AND ((b.status = 'ready' AND (b.owner_id = ?1 OR b.id IN (SELECT book_id FROM library WHERE user_id = ?1 AND added = 1))) OR (b.status IN ('queued', 'failed') AND b.owner_id = ?1))").bind(user.id, Date.now()).all()).results : [];
  return json([...stat, ...own.map((b) => ({ ...b, colors: JSON.parse(b.colors) }))], 200, { "cache-control": "no-cache" });
}
// Fichiers d'un livre ajouté en ligne (R2), avec les plages d'octets pour pouvoir sauter dans l'audio
async function r2File(req, env, key) {
  if (env.R2.remote) { // site en ligne relié : seuls les livres ajoutés (r2 = 1) sont chez le PC, pas les livres statiques
    if (!(await env.DB.prepare("SELECT 1 FROM books WHERE id = ? AND r2 = 1").bind(key.split("/")[0]).first())) return null;
    const r = await fetch(`${env.R2.remote}/books/${key.split("/").map(encodeURIComponent).join("/")}`, { headers: req.headers.has("range") ? { range: req.headers.get("range") } : {} }).catch(() => null);
    if (!r) return bad("Le PC ne répond pas.", 503);
    const h = new Headers(r.headers); h.set("access-control-allow-origin", "*");
    return new Response(r.body, { status: r.status, headers: h });
  }
  const obj = await env.R2.get(key, { range: req.headers });
  if (!obj) return null;
  const h = new Headers({ "accept-ranges": "bytes", etag: obj.httpEtag, "access-control-allow-origin": "*" }); // * : copie d'un livre partagé vers un autre PC Lisio
  obj.writeHttpMetadata(h);
  if (req.headers.has("range") && obj.range) {
    const { offset = 0, length = obj.size - offset } = obj.range;
    h.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`); h.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set("content-length", String(obj.size));
  return new Response(obj.body, { headers: h });
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;
    if (!env.R2 && (path.startsWith("/api/") || path.startsWith("/books/"))) { const pc = await pcRow(env); if (pc?.url && pc.key) env = { ...env, R2: pcStore(pc) }; }
    if (path.startsWith("/api/")) {
      try { return await api(req, env, path); }
      catch (e) { console.error(e); return bad("Erreur serveur.", 500); }
    }
    if (path === "/books/index.json") return catalogJson(req, env);
    if (path.startsWith("/books/") && env.R2) { const r = await r2File(req, env, decodeURIComponent(path.slice(7))); if (r) return r; }
    if (path.endsWith(".m4a")) return audioRange(req, env);
    return env.ASSETS.fetch(req);
  },
};

// Les fichiers statiques ne gèrent pas les plages d'octets : sans elles, impossible de sauter dans l'audio
async function audioRange(req, env) {
  const res = await env.ASSETS.fetch(new Request(req.url));
  const range = req.headers.get("range");
  const headers = { "content-type": "audio/mp4", "accept-ranges": "bytes", "cache-control": "public, max-age=604800" };
  if (!res.ok) return res;
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return new Response(buf, { headers: { ...headers, "content-length": String(size) } });
  let start = m[1] ? +m[1] : size - +m[2], end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
}
