import * as pdfjs from "/vendor/pdf.min.mjs";
import { DICT, LANGS } from "/i18n.js";
import { pdfWords, audioChunks, MAX_BYTES, MAX_SEC } from "/build.js";
pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const fmt = (t) => { t = Math.max(0, t | 0); const h = (t / 3600) | 0, m = ((t % 3600) / 60) | 0, s = t % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); };
const uid = () => crypto.getRandomValues(new Uint32Array(2)).reduce((a, n) => a + n.toString(36), "");
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

// ---------- Langue de l'interface ----------
let LANG = "fr";
const t = (s) => DICT[LANG]?.[s] ?? s;
const ORIG = new WeakMap(); // texte français d'origine de chaque nœud
const SKIP = "#pdfFile, #quotaInfo, #confirm, #editCovers, #article, #pdfView, #shelf, #resume, #audioList, #searchRes, #notesList, #codeMsg, #outboxNote, code, #apStages, #apDone, .pin, script, style";
function translateStatic() {
  document.documentElement.lang = LANG;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest(SKIP) || !n.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let n; (n = w.nextNode()); ) {
    if (!ORIG.has(n)) ORIG.set(n, n.nodeValue);
    const fr = ORIG.get(n), key = fr.trim();
    n.nodeValue = fr.replace(key, t(key));
  }
  for (const el of $$("[placeholder], [aria-label], [title]")) {
    if (el.closest(SKIP)) continue;
    if (!ORIG.has(el)) ORIG.set(el, Object.fromEntries(["placeholder", "aria-label", "title"].filter((a) => el.hasAttribute(a)).map((a) => [a, el.getAttribute(a)])));
    for (const [a, fr] of Object.entries(ORIG.get(el))) el.setAttribute(a, t(fr));
  }
}
function setLang(l) { LANG = LANGS.includes(l) ? l : "fr"; store.set("lang", LANG); translateStatic(); }

// ---------- Icônes ----------
const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  notes: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h6"/>', share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  modePdf: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>', modeRead: '<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', done: '<path d="M5 12l5 5 9-10"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>', pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor"/>',
  back10: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">10</text>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', goto: '<path d="M7 17L17 7M9 7h8v8"/>', more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  fwd10: '<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">10</text>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
function paintIcons() {
  $$("[data-act]").forEach((b) => { const n = { closePanel: "close", mode: S.prefs.mode === "pdf" ? "modeRead" : "modePdf", play: S.playing ? "pause" : "play" }[b.dataset.act] || b.dataset.act; if (ICONS[n] && !b.classList.contains("btn")) b.innerHTML = icon(n); });
  $$("#settings .icon-btn").forEach((b) => (b.innerHTML = icon("close")));
}

// ---------- État ----------
const DEFAULT_PREFS = { theme: "light", wordColor: "#ffcf5c", sentColor: "#ffcf5c", hlColor: "#e0a030", searchColor: "#5ec2b7",
  font: "serif", fontSize: 20, autoScroll: true, mode: "pdf", speed: 1, books: {} };
const S = { user: null, prefs: { ...DEFAULT_PREFS }, progress: {}, catalog: [], book: null, notes: [], cur: -1, playing: false, flash: null };

// ---------- API (avec file d'attente hors ligne) ----------
async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "Erreur"), { status: r.status });
  return data;
}
// Écritures : si le réseau tombe, on garde la dernière version et on renvoie plus tard
function send(path, method, body) {
  const q = store.get("queue", {}); q[method + " " + path] = { path, method, body }; store.set("queue", q);
  flush();
}
let flushing = false;
async function flush() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  const q = store.get("queue", {});
  for (const [k, it] of Object.entries(q)) {
    try { await api(it.path, it.method, it.body); const cur = store.get("queue", {}); if (cur[k] === undefined || JSON.stringify(cur[k]) === JSON.stringify(it)) { delete cur[k]; store.set("queue", cur); } }
    catch (e) { if (!e.status) break; const cur = store.get("queue", {}); delete cur[k]; store.set("queue", cur); }
  }
  flushing = false;
}
addEventListener("online", flush);

function toast(msg, ms = 2600) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); }

// ---------- Préférences / thème ----------
function applyPrefs() {
  const p = S.prefs, root = document.documentElement;
  root.dataset.theme = p.theme;
  root.style.setProperty("--word", p.wordColor); root.style.setProperty("--sent", p.sentColor);
  root.style.setProperty("--hl", p.hlColor); root.style.setProperty("--search", p.searchColor);
  root.style.setProperty("--fs", p.fontSize + "px");
  $("#article").classList.toggle("sans", p.font === "sans");
  $('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue("--surface").trim();
  if (S.book) applyBg();
}
const sendPrefs = debounce(() => send("/prefs", "PUT", S.prefs), 800);
const savePrefs = () => { S.prefs.updated = Date.now(); store.set("prefs", S.prefs); sendPrefs(); };

// ---------- Navigation entre vues ----------
function show(id) { $$(".view").forEach((v) => (v.hidden = v.id !== id)); }

async function boot() {
  paintIcons();
  S.prefs = { ...DEFAULT_PREFS, ...store.get("prefs", {}) };
  setLang(S.prefs.lang || store.get("lang", null) || navigator.language.slice(0, 2));
  applyPrefs();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  try {
    const me = await api("/me");
    S.user = me.email; S.name = me.name; store.set("me", me); 
    const local = store.get("prefs", {}), newer = (local.updated || 0) > (me.prefs.updated || 0);
    S.prefs = { ...DEFAULT_PREFS, ...(newer ? local : me.prefs) }; store.set("prefs", S.prefs);
    if (newer) send("/prefs", "PUT", S.prefs); // un réglage n'avait pas eu le temps de partir
    me.progress.forEach((p) => (S.progress[p.book_id] = p));
  } catch (e) {
    const cached = store.get("me", null);
    if (e.status === 401 || !cached) return showAuth();
    S.user = cached.email; S.name = cached.name; cached.progress.forEach((p) => (S.progress[p.book_id] = p)); // hors ligne
  }
  Object.assign(S.progress, store.get("localProgress", {}));
  if (S.prefs.lang) setLang(S.prefs.lang);
  applyPrefs();
  flush();
  const m = location.pathname.match(/^\/livre\/([\w-]+)/);
  const wantAdd = location.pathname === "/ajouter";
  await showLibrary();
  drainOutbox();
  if (m) openBook(m[1]); else if (wantAdd) showAdd();
}

// ---------- Connexion ----------
// modes : login, signup, forgot (demande du code), reset (code + nouveau mot de passe)
let authMode = "login";
const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function setAuthMode(m, info = "") {
  authMode = m;
  const f = $("#authForm");
  $$("[data-m]", f).forEach((el) => (el.hidden = !el.dataset.m.split(" ").includes(m)));
  $("#authH").textContent = t({ login: t("Connexion"), signup: t("Créer un compte"), forgot: t("Mot de passe oublié"), reset: t("Nouveau mot de passe") }[m]);
  $("#authSubmit").textContent = t({ login: t("Se connecter"), signup: t("Créer mon compte"), forgot: t("Recevoir un code"), reset: t("Changer le mot de passe") }[m]);
  $("#authSwitch").textContent = t(m === "login" ? t("Pas encore de compte ? Créer un compte") : m === "signup" ? t("Déjà un compte ? Se connecter") : t("← Retour à la connexion"));
  f.password.autocomplete = m === "login" ? "current-password" : "new-password";
  $("#authInfo").textContent = info || (m === "forgot" ? t("Entre ton e-mail : tu recevras un code à 6 chiffres.") : "");
  $("#authErr").textContent = "";
}
function showAuth() {
  show("auth");
  const f = $("#authForm");
  f.email.value = store.get("lastEmail", ""); // e-mail retenu
  $$(".eye", f).forEach((b) => {
    b.innerHTML = EYE;
    b.onclick = () => { const i = b.previousElementSibling, on = i.type === "password"; i.type = on ? "text" : "password"; b.innerHTML = on ? EYE_OFF : EYE; b.setAttribute("aria-label", t(on ? t("Masquer le mot de passe") : t("Afficher le mot de passe"))); };
  });
  $("#authSwitch").onclick = () => setAuthMode(authMode === "login" ? "signup" : "login");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f)), err = $("#authErr"); err.textContent = "";
    const email = (v.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return (err.textContent = t("Entre une adresse e-mail valide."));
    if (authMode === "signup" && !v.name.trim()) return (err.textContent = t("Choisis un nom ou un pseudo."));
    if (authMode !== "forgot" && v.password.length < 6) return (err.textContent = t("Mot de passe : 6 caractères minimum."));
    if ((authMode === "signup" || authMode === "reset") && v.password !== v.password2) return (err.textContent = t("Les deux mots de passe ne sont pas identiques."));
    if (authMode === "reset" && !/^\d{6}$/.test(v.code)) return (err.textContent = t("Le code fait 6 chiffres."));
    $("#authSubmit").disabled = true;
    try {
      if (authMode === "forgot") { await api("/forgot", "POST", { email }); setAuthMode("reset", t("Si un compte existe pour cet e-mail, un code vient d'être envoyé (regarde aussi les spams).")); }
      else if (authMode === "reset") { await api("/reset", "POST", { email, code: v.code, password: v.password }); f.password.value = f.password2.value = f.code.value = ""; setAuthMode("login", ""); toast(t("Mot de passe changé. Reconnecte-toi.")); }
      else {
        await api(authMode === "signup" ? "/signup" : "/login", "POST", { email, name: v.name, password: v.password, remember: !!v.remember });
        store.set("lastEmail", email); location.reload();
      }
    } catch (ex) { err.textContent = ex.status ? t(ex.message) : t("Pas de connexion internet."); }
    $("#authSubmit").disabled = false;
  };
  setAuthMode("login");
}

// ---------- Bibliothèque ----------
async function showLibrary() {
  history.replaceState(null, "", "/");
  show("library");
  $("#hello").textContent = `${t("Bonjour")}${S.name ? ", " + S.name : ""}`;
  S.catalog = await fetch("/books/index.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => S.catalog.map((b) => b.orig || b));
  const got = await api("/library").then((l) => { store.set("library", l); return l; }).catch(() => store.get("library", { rows: [], deny: [] }));
  const lib = Array.isArray(got) ? { rows: got, deny: [] } : got; // ancien format gardé hors ligne
  S.lib = Object.fromEntries(lib.rows.map((x) => [x.book_id, x])); S.deny = new Set(lib.deny);
  renderLibrary();
}
function renderLibrary() {
  // catalogue commun + réglages personnels (null = valeur du catalogue)
  S.catalog = S.catalog.filter((x) => !S.deny?.has(x.id)).map((x) => { const b = x.orig || x, o = S.lib[b.id]; return o ? { ...b, orig: b, title: o.title || b.title, author: o.author ?? b.author, year: o.year ?? b.year, colors: o.colors || b.colors, hidden: !!o.hidden } : b; });
  const shown = S.catalog.filter((b) => !b.hidden), nHidden = S.catalog.length - shown.length;
  const offline = store.get("offline", {});
  const cover = (b) => `<div class="cover" style="--c1:${b.colors[0]};--c2:${b.colors[1]}"><span class="c-author">${esc(b.author)}</span><span class="c-title">${esc(b.title)}<span class="c-orn" style="display:block"></span></span><span class="c-year">${esc(b.year || "")}</span></div>`;
  const pctOf = (b) => { const p = S.progress[b.id]; return p ? Math.min(100, (p.time / b.duration) * 100) : 0; };
  // Reprendre : le dernier livre ouvert
  const last = shown.filter((b) => S.progress[b.id] && !b.status?.match(/queued|failed/)).sort((a, b) => S.progress[b.id].updated - S.progress[a.id].updated)[0];
  $("#resume").innerHTML = last ? `<div class="resume"><button class="book" data-id="${last.id}" aria-label="Ouvrir ${esc(last.title)}">${cover(last)}</button>
    <div><small>${t("Reprendre la lecture")}</small><h2>${esc(last.title)}</h2><p>${esc(last.author)} · ${Math.round(pctOf(last))} % ${t("lu")} · ${dur(last.duration - S.progress[last.id].time)} ${t("restantes")}</p>
    <div class="bar"><i style="width:${pctOf(last)}%"></i></div><button class="btn accent" data-open="${last.id}">${t("▶ Continuer")}</button></div></div>` : "";
  $("#libCount").textContent = shown.length + " " + t(shown.length > 1 ? "livres" : "livre");
  $("#shelf").innerHTML = (S.showHidden ? S.catalog : shown).map((b) => {
    const pct = pctOf(b), wait = b.status === "queued" || b.status === "failed";
    const meta = b.status === "failed" ? `<span class="warn">${t("Échec de la transcription")}</span>` : b.status === "queued" ? `<span>${b.progress ? `${t("Transcription sur le PC")} ${Math.round(b.progress)} %` : t("En attente du PC")}</span>`
      : `<span>${pct ? Math.round(pct) + " % " + t("lu") : t("Pas commencé")} · ${dur(b.duration)}</span>`;
    return `<div class="book-wrap${b.hidden ? " is-hidden" : ""}${wait ? " is-wait" : ""}"><button class="book" data-id="${b.id}">${cover(b)}
      <div class="book-name">${esc(b.title)}</div>
      <div class="book-meta">${meta}${offline[b.id] ? `<span class="badge">${t("hors ligne")}</span>` : ""}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </button><button class="book-more" data-more="${b.id}" title="${t("Options du livre")}" aria-label="${t("Options du livre")}">${icon("more")}</button></div>`;
  }).join("") + `<button class="add-card" data-act="addBook"><b>+</b>${t("Ajouter un livre")}</button>`
    + (nHidden ? `<div class="shelf-foot"><button class="btn ghost small" data-act="toggleHidden">${S.showHidden ? t("Masquer les livres retirés") : `${t("Afficher les livres retirés")} (${nHidden})`}</button></div>` : "");
  $$("#library [data-id], #library [data-open]").forEach((b) => (b.onclick = () => openOrWait(b.dataset.id || b.dataset.open)));
  $$("#library [data-more]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); bookMenu(b.dataset.more, b); }));
}
// livre pas encore prêt : le PC le transcrit, ou a échoué (on peut relancer)
async function openOrWait(id) {
  const b = S.catalog.find((x) => x.id === id);
  if (b?.status === "queued") return toast(t("Le PC transcrit ce livre : il sera prêt bientôt."));
  if (b?.status !== "failed") return openBook(id);
  if (await confirmBox(t("Échec de la transcription"), b.error || "", t("Réessayer"), false))
    api(`/books/${id}/retry`, "POST").then(showLibrary).catch((e) => toast(e.message));
}
// la bibliothèque se met à jour pendant que le PC transcrit
setInterval(() => { if (!$("#library").hidden && S.catalog?.some((b) => b.status === "queued")) showLibrary(); }, 15000);
function saveLib(b, patch) {
  const cur = S.lib[b.id] || {};
  const o = { title: cur.title ?? null, author: cur.author ?? null, year: cur.year ?? null, colors: cur.colors ?? null, hidden: !!cur.hidden, ...patch };
  S.lib[b.id] = { book_id: b.id, ...o };
  store.set("library", { rows: Object.values(S.lib), deny: [...(S.deny || [])] });
  send(`/library/${b.id}`, "PUT", o);
  renderLibrary();
}
function bookMenu(id, el) {
  const b = S.catalog.find((x) => x.id === id), r = el.getBoundingClientRect();
  menu(Math.max(8, r.right - 220), r.bottom + 4, b.hidden ? [[t("Remettre dans la bibliothèque"), () => saveLib(b, { hidden: false })]] : [
    [t("Modifier"), () => editBook(b)],
    [t("Partager"), () => shareBook(b)],
    [t("Supprimer de la bibliothèque"), async () => {
      if (await confirmBox(`${t("Supprimer « %s » de ta bibliothèque ?").replace("%s", b.title)}`, t("Tes notes et ta progression sont gardées : tu peux le remettre avec « Afficher les livres retirés »."))) { saveLib(b, { hidden: true }); toast(t("Livre retiré")); }
    }],
  ]);
}
async function shareBook(b) {
  let code;
  try { code = (await api(`/books/${b.id}/share`, "POST")).code; } catch (e) { return toast(e.message || t("Pas de connexion internet.")); }
  const nice = code.match(/.{4}/g).join("-");
  // un autre PC Lisio copie le livre depuis cette adresse : inutile si on est sur localhost
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname), link = `${location.origin}/partage/${nice}`;
  const sub = t("Donne ce code : la personne l'entre dans « Ajouter un livre » → « J'ai un code », et le livre arrive dans sa bibliothèque.") + " " +
    (local ? t("Pour l'envoyer vers un autre PC Lisio, ouvre Lisio par ton adresse Wi-Fi ou de tunnel, puis partage à nouveau.") : `${t("Vers un autre PC Lisio, donne ce lien (le livre est copié en entier, transcription comprise) :")} ${link}`);
  if (await confirmBox(`${t("Code de partage")} : ${nice}`, sub, t(local ? "Copier le code" : "Copier le lien"), false))
    navigator.clipboard?.writeText(local ? nice : link).then(() => toast(t(local ? "Code copié" : "Lien copié")));
}
function editBook(b) {
  const d = $("#bookEdit"), E = d.querySelector("form").elements, base = b.orig || b;
  E.title.value = b.title; E.author.value = b.author || ""; E.year.value = b.year || "";
  const opts = COVERS.some((c) => c[0] === base.colors[0]) ? COVERS : [base.colors, ...COVERS];
  let colors = b.colors;
  const paint = () => ($("#editCovers").innerHTML = opts.map((c, k) => `<button type="button" data-k="${k}" style="--c1:${c[0]};--c2:${c[1]}" class="${c[0] === colors[0] ? "on" : ""}" aria-label="${t("Couverture")} ${k + 1}"></button>`).join(""));
  paint();
  $("#editCovers").onclick = (e) => { const x = e.target.closest("[data-k]"); if (x) { colors = opts[+x.dataset.k]; paint(); } };
  d.returnValue = ""; d.showModal();
  d.addEventListener("close", () => {
    if (d.returnValue !== "ok") return;
    const v = (k) => E[k].value.trim(), diff = (k) => (v(k) !== (base[k] || "") ? v(k) : null);
    saveLib(b, { title: v("title") ? diff("title") : null, author: diff("author"), year: diff("year"), colors: colors[0] === base.colors[0] ? null : colors });
  }, { once: true });
}
document.addEventListener("click", (e) => { const c = e.target.closest("[data-close]"); if (c) c.closest("dialog").close(); });
const dur = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };

// ---------- Ouverture d'un livre ----------
let pdfDoc = null;
async function openBook(id) {
  const meta = S.catalog.find((b) => b.id === id);
  if (!meta) return;
  history.pushState(null, "", "/livre/" + id);
  show("reader");
  $("#rBook").textContent = meta.title;
  loading(t("Chargement du livre…"));
  const base = `/books/${id}/`;
  const [book, notes, pdf] = await Promise.all([
    fetch(base + "book.json").then((r) => r.json()),
    api("/notes/" + id).then((n) => { store.set("notes:" + id, n); return n; }).catch(() => store.get("notes:" + id, [])),
    pdfjs.getDocument(base + "book.pdf").promise,
  ]);
  pdfDoc = pdf;
  S.book = prepare(book, id, base);
  Object.assign(S.book, { title: meta.title, author: meta.author });
  S.notes = notes.map((n) => (n.kind === "note" && n.w0 === n.w1 ? { ...n, w0: sentenceOf(n.w0)[0], w1: sentenceOf(n.w0)[1] } : n));
  sortNotes(); S.sel = null;
  S.cur = -1;
  // chapitres
  const opts = S.book.chapters.map((c, i) => `<option value="${i}">${esc(c.title)}${c.coverage < 0.5 ? " ⚠" : ""}</option>`).join("");
  $("#chapterSel").innerHTML = opts;
  $("#searchChap").innerHTML = `<option value="-1">${t("Tout le livre")}</option>` + opts;
  buildPdfPages();
  applyBg();
  setMode(S.prefs.mode, false);
  $("#speed").value = String(S.prefs.speed);
  $("#seek").max = S.book.duration;
  const p = S.progress[id];
  await seekTo(p ? p.time : S.book.t[0], false);
  updateDownloadBtn();
  loading(false);
  scrollToWord(S.cur, false);
}
function loading(msg) { $("#loading").hidden = !msg; if (msg) $("#loadingTxt").textContent = msg; }

function prepare(b, id, base) {
  const N = b.text.length;
  b.id = id; b.base = base; b.N = N;
  b.t = Float64Array.from(b.t);
  b.pageFirst = {}; b.pageLast = {};
  for (let i = 0; i < N; i++) { const p = b.page[i]; if (b.pageFirst[p] === undefined) b.pageFirst[p] = i; b.pageLast[p] = i; }
  b.chapOf = new Uint16Array(N);
  b.chapters.forEach((c, k) => { const end = b.chapters[k + 1]?.word ?? N; for (let i = c.word; i < end; i++) b.chapOf[i] = k; });
  // tokens de recherche (les mots coupés « domes- tique » sont recollés)
  b.tok = []; b.tokWord = [];
  for (let i = 0; i < N; i++) {
    if (b.flags[i] & 6 && i + 1 < N) { b.tok.push(norm(b.text[i] + b.text[i + 1])); b.tokWord.push(i); i++; }
    else { b.tok.push(norm(b.text[i])); b.tokWord.push(i); }
  }
  // « n'est- / ce » : vrai trait d'union composé, à garder à l'affichage
  const CLITIC = /^(ce|ci|là|il|ils|elle|elles|on|je|tu|nous|vous|moi|toi|lui|leur|leurs|y|en|t|même|mêmes|le|la|les)(?![a-zà-ÿ])/i;
  for (let i = 0; i < N - 1; i++) if (b.flags[i] & 2 && CLITIC.test(b.text[i + 1])) b.flags[i] = (b.flags[i] & ~2) | 4;
  b.endsSentence =(i) => /[.!?…»]$/.test(b.text[i]) && !/^(M|Mme|MM|Mlle|St)\.$/.test(b.text[i]);
  return b;
}
function wordAt(t) { // dernier mot dont le début <= t
  const T = S.book.t; let lo = 0, hi = T.length - 1;
  if (t < T[0]) return 0;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (T[mid] <= t) lo = mid; else hi = mid - 1; }
  return lo;
}
function sentenceOf(i) {
  const b = S.book; let a = i, z = i;
  while (a > 0 && !b.endsSentence(a - 1) && i - a < 120) a--;
  while (z < b.N - 1 && !b.endsSentence(z) && z - i < 120) z++;
  return [a, z];
}
const textRange = (a, z) => { const b = S.book; let s = ""; for (let i = a; i <= z; i++) s += b.flags[i] & 2 ? b.text[i].slice(0, -1) : b.flags[i] & 4 ? b.text[i] : b.text[i] + " "; return s.trim(); };

// ---------- Vue PDF ----------
let pageObs;
function buildPdfPages() {
  const b = S.book, view = $("#pdfView");
  view.innerHTML = "";
  pageObs?.disconnect();
  pageObs = new IntersectionObserver((ents) => ents.forEach((e) => (e.isIntersecting ? renderPage(e.target) : unrenderPage(e.target))), { root: view, rootMargin: "1500px 0px" });
  const first = b.page[0], last = b.page[b.N - 1];
  for (let p = first; p <= last; p++) {
    const d = document.createElement("div");
    d.className = "page"; d.dataset.p = p;
    d.innerHTML = `<div class="ov"></div><span class="pno">${p + 1}</span>`;
    view.append(d);
    pageObs.observe(d);
  }
  sizePages();
}
function sizePages() {
  if (!S.book) return;
  const w = Math.min(860, $("#pdfView").clientWidth - (innerWidth < 640 ? 12 : 32));
  $$(".page").forEach((d) => { const [pw, ph] = S.book.pages[d.dataset.p]; d.style.width = w + "px"; d.style.height = (w * ph) / pw + "px"; if (d.dataset.r) { unrenderPage(d); renderPage(d); } });
}
let lastW = 0;
addEventListener("resize", debounce(() => { const w = $("#pdfView").clientWidth; if (w && w !== lastW) { lastW = w; sizePages(); } }, 200));
async function renderPage(d) {
  if (d.dataset.r) return;
  d.dataset.r = "1";
  const page = await pdfDoc.getPage(+d.dataset.p + 1);
  if (!d.dataset.r) return;
  const vp0 = page.getViewport({ scale: 1 }), scale = (d.clientWidth / vp0.width) * Math.min(devicePixelRatio || 1, 2);
  const vp = page.getViewport({ scale });
  const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
  d.prepend(c);
  d._task = page.render({ canvasContext: c.getContext("2d"), viewport: vp });
  d._task.promise.catch(() => {});
  drawOverlay(+d.dataset.p);
}
function unrenderPage(d) {
  if (!d.dataset.r) return;
  delete d.dataset.r; d._task?.cancel();
  d.querySelector("canvas")?.remove();
}
const pageEl = (p) => $(`.page[data-p="${p}"]`);
function rectsFor(a, z, p) { // rectangles fusionnés par ligne, en %
  const b = S.book, out = [];
  const from = Math.max(a, b.pageFirst[p] ?? 1e9), to = Math.min(z, b.pageLast[p] ?? -1);
  for (let i = from; i <= to; i++) {
    const [x0, y0, x1, y1] = b.box[i], last = out[out.length - 1];
    if (last && Math.abs(last[1] - y0) < 40 && x0 >= last[2] - 20) last[2] = x1, last[3] = Math.max(last[3], y1);
    else out.push([x0, y0, x1, y1]);
  }
  return out;
}
const rectStyle = ([x0, y0, x1, y1], pad = 12) => `left:${(x0 - pad) / 100}%;top:${(y0 - pad) / 100}%;width:${(x1 - x0 + 2 * pad) / 100}%;height:${(y1 - y0 + 2 * pad) / 100}%`;
function drawOverlay(p, pins = true) {
  const d = pageEl(p); if (!d) return;
  const ov = d.querySelector(".ov"), b = S.book;
  let html = "";
  for (const n of S.notes) if (n.kind === "hl") for (const r of rectsFor(n.w0, n.w1, p)) html += `<div class="rect hl" style="${rectStyle(r, 6)};--c:${n.color}"></div>`;
  if (S.flash) for (const r of rectsFor(S.flash[0], S.flash[1], p)) html += `<div class="rect flash" style="${rectStyle(r, 8)}"></div>`;
  if (S.sel) html += selRects(S.sel, p);
  html += peekRects(p);
  if (S.cur >= 0 && b.page[S.cur] === p) {
    const [a, z] = sentenceOf(S.cur);
    for (const r of rectsFor(a, z, p)) html += `<div class="rect sent" style="${rectStyle(r, 8)}"></div>`;
    html += `<div class="rect word" style="${rectStyle(b.box[S.cur], 14)}"></div>`;
  }
  // seuls les rectangles sont refaits à chaque mot : les pastilles restent (sinon une note ouverte se ferme pendant la lecture)
  ov.querySelectorAll(":scope > .rect").forEach((x) => x.remove());
  ov.insertAdjacentHTML("afterbegin", html);
  if (pins) placePins(p, ov);
}
function wordFromPoint(p, ev) {
  const b = S.book, r = pageEl(p).getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * 1e4, y = ((ev.clientY - r.top) / r.height) * 1e4;
  let best = -1, bd = Infinity;
  for (let i = b.pageFirst[p]; i <= b.pageLast[p]; i++) {
    const [x0, y0, x1, y1] = b.box[i];
    const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0, dd = dx + dy * 3;
    if (dd < bd) bd = dd, best = i;
  }
  return bd < 600 ? best : -1;
}
// Vue PDF : double-clic = lire à partir du mot, glisser = sélectionner, clic droit = menu
const pdfWordAt = (ev) => { const d = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".page"); return d ? wordFromPoint(+d.dataset.p, ev) : -1; };
const selRects = (r, p) => rectsFor(r[0], r[1], p).map((q) => `<div class="rect sel" style="${rectStyle(q, 6)}"></div>`).join("");
function setSel(r) {
  if (!r && !S.sel) return;
  S.sel = r;
  $$("#pdfView .rect.sel").forEach((x) => x.remove());
  if (r) for (let p = S.book.page[r[0]]; p <= S.book.page[r[1]]; p++) pageEl(p)?.querySelector(".ov")?.insertAdjacentHTML("afterbegin", selRects(r, p));
}
let dragFrom = -1, dragMoved = false;
$("#pdfView").addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.pointerType === "touch" || e.target.closest(".pin")) return;
  setSel(null); dragFrom = pdfWordAt(e); dragMoved = false;
  if (dragFrom >= 0) e.preventDefault();
});
addEventListener("pointermove", (e) => {
  if (dragFrom < 0 || !(e.buttons & 1)) return;
  const i = pdfWordAt(e); if (i < 0 || (i === dragFrom && !dragMoved)) return;
  dragMoved = true; setSel([Math.min(i, dragFrom), Math.max(i, dragFrom)]);
});
addEventListener("pointerup", () => (dragFrom = -1));
$("#pdfView").addEventListener("dblclick", (e) => {
  if (e.target.closest(".pin") || recentTouch()) return;
  const i = pdfWordAt(e); if (i >= 0) { setSel(null); seekToWord(i); }
});
$("#pdfView").addEventListener("contextmenu", (e) => {
  if (recentTouch()) return e.preventDefault();
  if (e.target.closest(".pin")) return;
  if (S.sel) { e.preventDefault(); return selMenu(S.sel[0], S.sel[1], e.clientX, e.clientY); }
  const i = pdfWordAt(e); if (i < 0) return;
  e.preventDefault(); wordMenu(i, e.clientX, e.clientY);
});

// ---------- Vue lecture ----------
let readChap = -1;
function renderChapter(k) {
  const b = S.book, c = b.chapters[k], end = b.chapters[k + 1]?.word ?? b.N;
  readChap = k;
  let html = `<h2>${esc(c.title)}</h2><p>`, first = true;
  for (let i = c.word; i < end; i++) {
    if (i === c.word && /^Chapitre$/.test(b.text[i])) { i++; continue; } // titre déjà affiché
    if (b.flags[i] & 1 && !first) html += "</p><p>";
    first = false;
    const hy = b.flags[i] & 2;
    html += `<span class="w" data-i="${i}">${esc(hy ? b.text[i].slice(0, -1) : b.text[i])}</span>${b.flags[i] & 6 ? "" : " "}`;
  }
  html += "</p>";
  html += `<nav class="chap-nav">${k > 0 ? `<button class="btn small" data-go="${k - 1}">← ${esc(b.chapters[k - 1].title)}</button>` : "<span></span>"}${k + 1 < b.chapters.length ? `<button class="btn small" data-go="${k + 1}">${esc(b.chapters[k + 1].title)} →</button>` : ""}</nav>`;
  $("#article").innerHTML = html;
  paintReadMarks();
}
const span = (i) => $(`#article .w[data-i="${i}"]`);
function paintReadMarks() {
  $$("#article .w.hl, #article .w.flash").forEach((s) => s.classList.remove("hl", "flash"));
  const mark = (a, z, cls, color) => { for (let i = a; i <= z; i++) { const s = span(i); if (s) { s.classList.add(cls); if (color) s.style.setProperty("--c", color); } } };
  for (const n of S.notes) if (n.kind === "hl") mark(n.w0, n.w1, "hl", n.color);
  if (S.flash) mark(S.flash[0], S.flash[1], "flash");
  placePins(null, $("#article"));
  lastSent = null; highlightRead(S.cur);
}
let lastSent = null;
function highlightRead(i) {
  $("#article .w.cur")?.classList.remove("cur");
  if (i < 0) return;
  const s = span(i); if (s) s.classList.add("cur");
  const [a, z] = sentenceOf(i);
  if (!lastSent || lastSent[0] !== a) {
    $$("#article .w.sent").forEach((x) => x.classList.remove("sent"));
    for (let k = a; k <= z; k++) span(k)?.classList.add("sent");
    lastSent = [a, z];
  }
}
$("#article").addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) seekToWord(S.book.chapters[+go.dataset.go].word);
});
$("#article").addEventListener("dblclick", (e) => {
  const w = e.target.closest(".w"); if (!w || e.target.closest(".pin") || recentTouch()) return;
  getSelection().removeAllRanges(); seekToWord(+w.dataset.i);
});
// mots couverts par la sélection native du mode lecture
function readSel() {
  const sel = getSelection(); if (sel.isCollapsed || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0); if (!$("#article").contains(r.commonAncestorContainer)) return null;
  const ws = [...$("#article").querySelectorAll(".w")].filter((w) => r.intersectsNode(w));
  return ws.length ? [+ws[0].dataset.i, +ws.at(-1).dataset.i] : null;
}
$("#article").addEventListener("contextmenu", (e) => {
  if (e.target.closest(".pin") || recentTouch()) return; // téléphone : sélection native
  const s = readSel();
  if (s) { e.preventDefault(); return selMenu(s[0], s[1], e.clientX, e.clientY); }
  const w = e.target.closest(".w"); if (!w) return;
  e.preventDefault(); wordMenu(+w.dataset.i, e.clientX, e.clientY);
});
// sur écran tactile (pas de clic droit) : menu dès qu'une sélection est faite
document.addEventListener("selectionchange", debounce(() => {
  if (!matchMedia("(pointer: coarse)").matches || $("#readView").hidden) return;
  const s = readSel(); if (!s) return;
  const r = getSelection().getRangeAt(0).getBoundingClientRect();
  selMenu(s[0], s[1], r.left, r.bottom + 6);
}, 500));

// ---------- Mode d'affichage ----------
function setMode(m, save = true) {
  S.prefs.mode = m;
  $("#pdfView").hidden = m !== "pdf"; $("#readView").hidden = m !== "read";
  if (m === "read" && S.cur >= 0) renderChapter(S.book.chapOf[S.cur]);
  if (m === "pdf") drawOverlay(S.book.page[S.cur]);
  paintIcons();
  if (save) { savePrefs(); scrollToWord(S.cur, false); }
}
function applyBg() {
  const bg = S.prefs.books[S.book.id]?.bg, st = $("#stage");
  st.classList.toggle("has-bg", !!bg && bg.startsWith("data:"));
  st.style.background = !bg ? "" : bg.startsWith("data:") ? `center/cover no-repeat url(${bg})` : bg;
}

// ---------- Lecture audio ----------
const audio = $("#audio");
let seg = -1;
const segAt = (t) => { const P = S.book.parts; let k = 0; while (k + 1 < P.length && P[k + 1].offset <= t) k++; return k; };
const now = () => (seg < 0 ? 0 : S.book.parts[seg].offset + audio.currentTime);
async function seekTo(t, play = S.playing) {
  const b = S.book; t = Math.max(0, Math.min(t, b.duration - 0.5));
  const k = segAt(t), local = t - b.parts[k].offset;
  if (k !== seg) {
    seg = k;
    audio.src = b.base + b.parts[k].src;
    audio.playbackRate = S.prefs.speed;
    await new Promise((res) => { audio.addEventListener("loadedmetadata", res, { once: true }); audio.addEventListener("error", res, { once: true }); });
  }
  audio.currentTime = local;
  audio.playbackRate = S.prefs.speed;
  tick(true);
  if (play) audio.play().catch(() => {});
}
function seekToWord(i) { follow(true); seekTo(S.book.t[i] + 0.01); }
audio.addEventListener("ended", () => { if (seg + 1 < S.book.parts.length) seekTo(S.book.parts[seg + 1].offset, true); });
audio.addEventListener("play", () => { S.playing = true; paintIcons(); loop(); follow(true); scrollToWord(S.cur, true); }); // Lecture = on suit de nouveau le texte
audio.addEventListener("pause", () => { S.playing = false; paintIcons(); saveProgress(); });
function togglePlay() { if (audio.paused) audio.play().catch(() => toast(t("Lecture impossible : fichier audio introuvable."))); else audio.pause(); }

function loop() { if (!S.playing) return; tick(); requestAnimationFrame(loop); }
let lastSeekPaint = 0;
function tick(force) {
  const b = S.book; if (!b) return;
  const t = now(), i = wordAt(t);
  if (i !== S.cur || force) setCurrent(i);
  if (force || performance.now() - lastSeekPaint > 250) {
    lastSeekPaint = performance.now();
    if (!seeking) $("#seek").value = t;
    $("#tCur").textContent = fmt(t); $("#tTot").textContent = "-" + fmt((b.duration - t) / S.prefs.speed);
  }
  if (performance.now() - lastSave > 15000) saveProgress();
}
function setCurrent(i) {
  const b = S.book, prev = S.cur;
  S.cur = i;
  const k = b.chapOf[i];
  if (+$("#chapterSel").value !== k) $("#chapterSel").value = k;
  if (S.prefs.mode === "pdf") {
    if (prev >= 0 && b.page[prev] !== b.page[i]) drawOverlay(b.page[prev], false);
    drawOverlay(b.page[i], false);
  } else {
    if (k !== readChap) renderChapter(k); else highlightRead(i);
  }
  if (following && S.prefs.autoScroll && !document.activeElement?.closest(".pin")) scrollToWord(i, true); // pas de défilement pendant qu'on écrit une note
}
function scrollToWord(i, smooth) {
  if (i < 0) return;
  const b = S.book;
  if (S.prefs.mode === "pdf") {
    const v = $("#pdfView"), d = pageEl(b.page[i]); if (!d) return;
    const y = d.offsetTop + (b.box[i][1] / 1e4) * d.offsetHeight - v.clientHeight * 0.35;
    if (Math.abs(v.scrollTop - y) > v.clientHeight * 0.25 || !smooth) autoScroll(v, y, smooth);
  } else {
    const v = $("#readView"), s = span(i); if (!s) return;
    const y = s.offsetTop + $("#article").offsetTop - v.clientHeight * 0.35;
    if (Math.abs(v.scrollTop - y) > v.clientHeight * 0.2 || !smooth) autoScroll(v, y, smooth);
  }
}
let following = true, autoScrolling = 0;
function autoScroll(v, y, smooth) { autoScrolling = performance.now(); v.scrollTo({ top: y, behavior: smooth ? "smooth" : "auto" }); }
function follow(on) { following = on; $("#followBtn").hidden = on || !S.playing; }
for (const v of [$("#pdfView"), $("#readView")]) {
  const userScroll = () => { if (performance.now() - autoScrolling > 900) follow(false); };
  v.addEventListener("wheel", userScroll, { passive: true });
  v.addEventListener("touchmove", userScroll, { passive: true });
}
$("#followBtn").onclick = () => { follow(true); scrollToWord(S.cur, true); };

let lastSave = 0;
function saveProgress() {
  if (!S.book || S.cur < 0) return;
  lastSave = performance.now();
  const p = { book_id: S.book.id, word: S.cur, time: +now().toFixed(2), updated: Date.now() };
  S.progress[S.book.id] = p;
  const lp = store.get("localProgress", {}); lp[S.book.id] = p; store.set("localProgress", lp);
  send("/progress/" + S.book.id, "PUT", { word: p.word, time: p.time });
}
addEventListener("visibilitychange", () => document.hidden && saveProgress());

// barre de progression
let seeking = false;
$("#seek").addEventListener("input", () => { seeking = true; $("#tCur").textContent = fmt(+$("#seek").value); });
$("#seek").addEventListener("change", () => { seeking = false; follow(true); seekTo(+$("#seek").value); });
$("#speed").onchange = () => { S.prefs.speed = +$("#speed").value; audio.playbackRate = S.prefs.speed; savePrefs(); };
$("#chapterSel").onchange = () => seekToWord(S.book.chapters[+$("#chapterSel").value].word);

// écran verrouillé / casque
if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => audio.play()); ms.setActionHandler("pause", () => audio.pause());
  ms.setActionHandler("seekbackward", () => seekTo(now() - 10)); ms.setActionHandler("seekforward", () => seekTo(now() + 10));
  audio.addEventListener("play", () => { ms.metadata = new MediaMetadata({ title: S.book.title, artist: S.book.author, album: S.book.chapters[S.book.chapOf[S.cur]]?.title || "", artwork: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }] }); });
}

// ---------- Notes et surlignages ----------
// Palette : tons profonds utilisés en accent (barre, pastille, surlignage translucide) → lisibles en thème clair comme sombre
const NOTE_COLORS = [["Ambre", "#e0a030"], ["Corail", "#e46f55"], ["Framboise", "#d9577f"], ["Orchidée", "#b46cc8"], ["Indigo", "#6f7ee6"], ["Océan", "#3b93d6"],
  ["Lagon", "#22a89c"], ["Sauge", "#5fa86b"], ["Olive", "#9aa23a"], ["Cuivre", "#c07a45"], ["Taupe", "#9a8676"], ["Ardoise", "#6f8396"],
  ["Blanc", "#f1efe9"], ["Gris", "#a3a39e"], ["Graphite", "#55585e"], ["Noir", "#1d1e21"]];
const palColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : NOTE_COLORS[0][1]);
// texte foncé sur une pastille claire (blanc, gris…)
const isLight = (c) => { const n = parseInt(c.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170; };
const sortNotes = () => S.notes.sort((a, b) => a.w0 - b.w0 || a.w1 - b.w1);
const notesPaneOpen = () => $("#panel").classList.contains("open") && !$('[data-pane="notes"]').hidden;
function addNote(kind, w0, w1) {
  if (kind === "note" && w0 === w1) [w0, w1] = sentenceOf(w0); // une note sur un mot cite toute la phrase
  const n = { id: uid(), kind, w0, w1, color: palColor(kind === "hl" ? S.prefs.hlColor : S.prefs.noteColor), title: "", body: "", updated: Date.now(), fresh: kind === "note" };
  S.notes.push(n); sortNotes();
  saveNote(n); redrawMarks();
  if (kind === "note") { S.openPin = n.id; requestAnimationFrame(() => $(`.pin[data-id="${n.id}"] .ne-title`)?.focus()); }
  else toast(t("Passage surligné"));
  if (notesPaneOpen()) renderNotesList();
}
function saveNote(n) {
  n.updated = Date.now();
  store.set("notes:" + S.book.id, S.notes);
  send(`/notes/${S.book.id}/${n.id}`, "PUT", { kind: n.kind, w0: n.w0, w1: n.w1, color: n.color, title: n.title || "", body: n.body || "", pos: n.pos || null });
}
const saveTimers = {};
const saveNoteDebounced = (n) => { clearTimeout(saveTimers[n.id]); saveTimers[n.id] = setTimeout(() => saveNote(n), 600); };
async function deleteNote(id) {
  const n = S.notes.find((x) => x.id === id); if (!n) return;
  if (!(await confirmBox(t(n.kind === "hl" ? "Supprimer ce surlignage ?" : "Supprimer cette note ?"), t("Elle sera effacée sur tous tes appareils.")))) return;
  clearTimeout(saveTimers[id]);
  S.notes = S.notes.filter((x) => x.id !== id);
  store.set("notes:" + S.book.id, S.notes);
  const q = store.get("queue", {}); delete q[`PUT /notes/${S.book.id}/${id}`]; store.set("queue", q);
  send(`/notes/${S.book.id}/${id}`, "DELETE");
  if (S.openPin === id) S.openPin = null;
  redrawMarks(); if (notesPaneOpen()) renderNotesList();
  toast(t("Supprimé"));
}
function redrawMarks() { if (S.prefs.mode === "pdf") $$(".page[data-r]").forEach((d) => drawOverlay(+d.dataset.p)); else paintReadMarks(); }

// Éditeur de note (même interface dans la pastille et dans le panneau Notes)
function noteEd(n, inPanel) {
  const b = S.book;
  return `<div class="ne" data-id="${n.id}" style="--c:${n.color}">
    <div class="ne-head"><span class="ne-kind">${t(n.kind === "hl" ? "Citation" : "Note")} · <span class="ne-page">p. ${b.page[n.w0] + 1}</span></span>
      ${inPanel ? "" : `<span class="ne-btn ne-grip" title="${t("Déplacer")}" aria-hidden="true">⠿</span>`}
      ${inPanel ? `<button class="ne-btn ne-go" title="${t("Aller au passage")}" aria-label="${t("Aller au passage")}">${icon("goto")}</button>` : ""}
      <button class="ne-btn ne-del" title="${t("Supprimer")}" aria-label="${t("Supprimer")}">${icon("trash")}</button></div>
    <input class="ne-title" placeholder="${t("Titre")}" value="${esc(n.title || "")}" maxlength="200" aria-label="${t("Titre")}">
    <blockquote class="ne-quote">« ${esc(textRange(n.w0, n.w1))} »</blockquote>
    <div class="ne-range"><span>${t("Début")}</span><button data-rg="s-1" aria-label="${t("Début")} −">‹</button><button data-rg="s1" aria-label="${t("Début")} +">›</button>
      <span>${t("Fin")}</span><button data-rg="e-1" aria-label="${t("Fin")} −">‹</button><button data-rg="e1" aria-label="${t("Fin")} +">›</button></div>
    <textarea class="ne-body" placeholder="${t("Ta note…")}" rows="3" aria-label="Note">${esc(n.body || "")}</textarea>
    <div class="ne-colors">${NOTE_COLORS.map(([nm, c]) => `<button class="dot${c === n.color ? " on" : ""}" data-c="${c}" style="--d:${c}" title="${nm}" aria-label="${nm}"></button>`).join("")}<label class="dot pick${NOTE_COLORS.some((x) => x[1] === n.color) ? "" : " on"}" style="--d:${n.color}" title="${t("Couleur libre")}"><input type="color" value="${n.color}" aria-label="${t("Couleur libre")}"></label></div>
  </div>`;
}
// met à jour toutes les copies ouvertes d'une note sans tout redessiner (garde le focus)
function syncNote(n, skip) {
  $$(`.ne[data-id="${n.id}"]`).forEach((ed) => {
    ed.style.setProperty("--c", n.color);
    ed.querySelector(".ne-quote").textContent = `« ${textRange(n.w0, n.w1)} »`;
    ed.querySelector(".ne-page").textContent = `p. ${S.book.page[n.w0] + 1}`;
    ed.querySelectorAll(".dot[data-c]").forEach((d) => d.classList.toggle("on", d.dataset.c === n.color));
    const pk = ed.querySelector(".dot.pick"); pk.classList.toggle("on", !NOTE_COLORS.some((x) => x[1] === n.color)); pk.style.setProperty("--d", n.color); if (pk.firstChild.value !== n.color) pk.firstChild.value = n.color;
    for (const f of ["title", "body"]) { const el = ed.querySelector(".ne-" + f); if (el !== skip) el.value = n[f] || ""; }
  });
  $$(`.pin[data-id="${n.id}"]`).forEach((p) => { p.style.setProperty("--c", n.color); p.classList.toggle("light", isLight(n.color)); });
  if (peekId === n.id) redrawPeek();
}
function setColor(n, c) { n.color = c; S.prefs[n.kind === "hl" ? "hlColor" : "noteColor"] = c; savePrefs(); saveNoteDebounced(n); syncNote(n); if (n.kind === "hl") redrawMarks(); }
function pinHtml(n) {
  return `<div class="pin${isLight(n.color) ? " light" : ""}" data-id="${n.id}" style="--c:${n.color}" tabindex="0"><span class="pin-dot">${n.title ? esc(n.title[0].toUpperCase()) : "✎"}</span><div class="pin-card">${noteEd(n, false)}</div></div>`;
}
function placePins(p, host) {
  const b = S.book;
  host.querySelectorAll(":scope > .pin").forEach((x) => x.remove());
  let lastY = -1e9;
  for (const n of S.notes) {
    if (n.kind !== "note") continue;
    let y;
    if (p !== null) { if (b.page[n.w0] !== p) continue; y = (b.box[n.w0][1] / 1e4) * host.clientHeight - 4; }
    else { const s = span(n.w0); if (!s) continue; y = s.offsetTop - 2; }
    const free = p !== null && n.pos; // position choisie à la main : pas d'empilement automatique
    if (!free) { y = Math.max(y, lastY + 34); lastY = y; }
    host.insertAdjacentHTML("beforeend", pinHtml(n));
    const el = host.lastElementChild;
    el.style.top = y + "px"; if (p !== null) el.classList.add("pdf-pin");
    if (free) placeFree(el, n.pos, host);
    if (S.openPin === n.id) el.classList.add("open");
    if (!n.fresh) el.style.animation = "none"; delete n.fresh;
  }
}
// pastille à une position libre (fractions de la page) ; à droite de la page elle s'ouvre vers la gauche
function placeFree(el, pos, page) {
  el.style.top = pos.y * page.clientHeight + "px";
  if (pos.x > 0.5) { el.style.left = "auto"; el.style.right = `calc(${(1 - pos.x) * 100}% - 28px)`; }
  else { el.style.right = "auto"; el.style.left = pos.x * 100 + "%"; }
}
// Déplacer une pastille (mode PDF) : glisser la poignée ⠿, ou appui long sur la pastille fermée
let drag = null, dragT, justDragged = false;
document.addEventListener("pointerdown", (e) => {
  const pin = e.target.closest(".pdf-pin"); if (!pin || e.button > 0) return;
  const grip = e.target.closest(".ne-grip"), dot = !pin.matches(".open, :focus-within") && !e.target.closest(".pin-card");
  if (!grip && !dot) return;
  const r = pin.getBoundingClientRect(), start = () => { drag = { pin, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false }; pin.classList.add("dragging"); pin.setPointerCapture?.(e.pointerId); navigator.vibrate?.(10); };
  if (grip) { e.preventDefault(); start(); } else dragT = setTimeout(start, 400);
});
addEventListener("pointermove", (e) => {
  if (!drag) { clearTimeout(dragT); return; }
  const page = drag.pin.closest(".page"), r = page.getBoundingClientRect();
  drag.pos = { x: Math.min(1.08, Math.max(-0.05, (e.clientX - drag.dx - r.left) / r.width)), y: Math.min(0.97, Math.max(0, (e.clientY - drag.dy - r.top) / r.height)) };
  drag.moved = true;
  Object.assign(drag.pin.style, { right: "auto", left: drag.pos.x * 100 + "%", top: drag.pos.y * page.clientHeight + "px" });
}, { passive: true });
addEventListener("pointerup", () => {
  clearTimeout(dragT); if (!drag) return;
  const { pin, pos, moved } = drag; drag = null; pin.classList.remove("dragging");
  if (!moved) return;
  justDragged = true; setTimeout(() => (justDragged = false), 300);
  const n = S.notes.find((x) => x.id === pin.dataset.id); n.pos = pos; saveNote(n);
  placeFree(pin, pos, pin.closest(".page"));
});
// ouverture / fermeture des pastilles
document.addEventListener("click", (e) => {
  if (justDragged && e.target.closest(".pin")) { e.stopPropagation(); e.preventDefault(); justDragged = false; return; }
  const pin = e.target.closest(".pin");
  if (!pin && e.target.closest("[data-note], #ctxMenu, #confirm")) return; // clic qui crée la note, ou boîte de confirmation
  $$(".pin.open").forEach((x) => x !== pin && x.classList.remove("open"));
  if (!pin) { S.openPin = null; setPeek(null); return; }
  S.openPin = pin.dataset.id; pin.classList.add("open"); setPeek(S.openPin);
}, true);
// passage cité surligné de la couleur de la note tant qu'on est dessus (pastille survolée / ouverte, ou carte du panneau)
let peekId = null;
document.addEventListener("pointerover", (e) => { const x = e.target.closest(".pin, #notesList .ne"); setPeek(x ? x.dataset.id : S.openPin); });
function setPeek(id) { if (peekId !== (id || null)) { peekId = id || null; redrawPeek(); } }
const peekRects = (p) => { const n = peekId && S.notes.find((x) => x.id === peekId); return n ? rectsFor(n.w0, n.w1, p).map((q) => `<div class="rect peek" style="${rectStyle(q, 6)};--c:${n.color}"></div>`).join("") : ""; };
function redrawPeek() {
  if (!S.book) return;
  if (S.prefs.mode === "pdf") { $$(".page[data-r]").forEach((d) => drawOverlay(+d.dataset.p, false)); return; }
  $$("#article .w.peek").forEach((x) => x.classList.remove("peek"));
  const n = peekId && S.notes.find((x) => x.id === peekId); if (!n) return;
  for (let i = n.w0; i <= n.w1; i++) { const sp = span(i); if (sp) { sp.classList.add("peek"); sp.style.setProperty("--pc", n.color); } }
}
// saisie du titre / du texte
document.addEventListener("input", (e) => {
  const ed = e.target.closest(".ne"); if (!ed) return;
  const n = S.notes.find((x) => x.id === ed.dataset.id); if (!n) return;
  if (e.target.type === "color") return setColor(n, e.target.value);
  if (!e.target.matches(".ne-title, .ne-body")) return;
  n[e.target.matches(".ne-title") ? "title" : "body"] = e.target.value;
  saveNoteDebounced(n); syncNote(n, e.target);
});
// boutons de l'éditeur : supprimer, aller au passage, longueur de la citation, couleur
document.addEventListener("click", (e) => {
  const ed = e.target.closest(".ne"); if (!ed) return;
  const n = S.notes.find((x) => x.id === ed.dataset.id); if (!n) return;
  if (e.target.closest(".ne-del")) return deleteNote(n.id);
  if (e.target.closest(".ne-go")) return goToRange(n.w0, n.w1);
  const r = e.target.closest("[data-rg]");
  if (r) {
    const d = +r.dataset.rg.slice(1), MAX = 400; // citation de 400 mots au plus
    if (r.dataset.rg[0] === "s") n.w0 = Math.min(n.w1, Math.max(0, n.w1 - MAX, n.w0 + d));
    else n.w1 = Math.max(n.w0, Math.min(S.book.N - 1, n.w0 + MAX, n.w1 + d));
    sortNotes(); saveNoteDebounced(n); syncNote(n); if (n.kind === "hl") redrawMarks();
    return;
  }
  const dot = e.target.closest(".dot");
  if (dot?.dataset.c) setColor(n, dot.dataset.c);
});

// Boîte de confirmation (remplace confirm())
function confirmBox(msg, sub = "", ok = t("Supprimer"), danger = true) {
  const d = $("#confirm");
  $("#confirmMsg").textContent = msg; $("#confirmSub").textContent = sub; $("#confirmOk").textContent = ok;
  $("#confirmOk").className = "btn " + (danger ? "danger" : "accent");
  d.returnValue = ""; d.showModal();
  return new Promise((res) => d.addEventListener("close", () => res(d.returnValue === "ok"), { once: true }));
}

// ---------- Menus ----------
function menu(x, y, items, onClose) {
  const m = $("#ctxMenu");
  m.innerHTML = items.map(([l], k) => `<button data-k="${k}">${l}</button>`).join("");
  m.hidden = false;
  m.style.left = Math.min(x, innerWidth - m.offsetWidth - 8) + "px"; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 8) + "px";
  m.onclick = (e) => { const b = e.target.closest("button"); if (!b) return; m.hidden = true; items[+b.dataset.k][1](); onClose?.(); };
  setTimeout(() => document.addEventListener("pointerdown", function off(e) { if (!m.contains(e.target)) { m.hidden = true; document.removeEventListener("pointerdown", off); } }), 0);
}
function wordMenu(i, x, y) {
  const [a, z] = sentenceOf(i);
  const hl = S.notes.find((n) => n.kind === "hl" && n.w0 <= i && n.w1 >= i);
  menu(x, y, [
    [t("Écouter à partir d'ici"), () => seekToWord(i)],
    [t("Ajouter une note ici"), () => addNote("note", i, i)],
    hl ? [t("Retirer le surlignage"), () => deleteNote(hl.id)] : [t("Surligner la phrase"), () => addNote("hl", a, z)],
    [t("Copier la phrase"), () => navigator.clipboard?.writeText(textRange(a, z)).then(() => toast(t("Phrase copiée")))],
  ]);
}
function selMenu(i0, i1, x, y) {
  const a = sentenceOf(i0)[0], z = sentenceOf(i1)[1];
  const copy = (txt, msg) => navigator.clipboard?.writeText(txt).then(() => toast(msg));
  menu(x, y, [
    [t("Copier la sélection"), () => copy(textRange(i0, i1), t("Sélection copiée"))],
    [t("Copier la phrase"), () => copy(textRange(a, z), t("Phrase copiée"))],
    [t("Surligner la sélection"), () => addNote("hl", i0, i1)],
    [t("Ajouter une note pour la sélection"), () => addNote("note", i0, i1)],
    [t("Écouter à partir d'ici"), () => seekToWord(i0)],
  ], () => { getSelection().removeAllRanges(); setSel(null); });
}
// Téléphone : double-tap = lire à partir du mot ; appui long sur le PDF = sélection qu'on étire en glissant, puis menu.
// En mode lecture, l'appui long garde la sélection native du téléphone (le menu Lisio s'ouvre quand elle est faite).
let pressT, touchSel = -1, moved = false, sx = 0, sy = 0, lastTouch = 0, lastTap = { t: 0, x: 0, y: 0 };
const recentTouch = () => Date.now() - lastTouch < 1200;
function tapWord(v, x, y) {
  const d = document.elementFromPoint(x, y);
  if (!d || d.closest(".pin")) return -1;
  return v === "#article" ? (d.closest(".w") ? +d.closest(".w").dataset.i : -1) : pdfWordAt({ clientX: x, clientY: y });
}
for (const v of ["#pdfView", "#article"]) {
  const el = $(v);
  el.addEventListener("touchstart", (e) => {
    lastTouch = Date.now(); clearTimeout(pressT);
    if (e.touches.length > 1) return;
    const p = e.touches[0]; sx = p.clientX; sy = p.clientY; moved = false;
    if (v === "#pdfView" && !e.target.closest(".pin")) pressT = setTimeout(() => {
      const i = pdfWordAt(p); if (i < 0) return;
      touchSel = i; setSel([i, i]); navigator.vibrate?.(12);
    }, 450);
  }, { passive: true });
  el.addEventListener("touchmove", (e) => {
    const p = e.touches[0];
    if (touchSel >= 0) { e.preventDefault(); const i = pdfWordAt(p); if (i >= 0) setSel([Math.min(i, touchSel), Math.max(i, touchSel)]); return; }
    if (Math.hypot(p.clientX - sx, p.clientY - sy) > 10) { moved = true; clearTimeout(pressT); }
  }, { passive: false });
  el.addEventListener("touchend", (e) => {
    clearTimeout(pressT); lastTouch = Date.now();
    const p = e.changedTouches[0];
    if (touchSel >= 0) { touchSel = -1; e.preventDefault(); selMenu(S.sel[0], S.sel[1], p.clientX, p.clientY + 16); return; }
    if (moved || e.touches.length || e.target.closest(".pin")) return;
    const now = Date.now();
    if (now - lastTap.t < 350 && Math.hypot(p.clientX - lastTap.x, p.clientY - lastTap.y) < 40) {
      lastTap.t = 0;
      const i = tapWord(v, p.clientX, p.clientY);
      if (i >= 0) { e.preventDefault(); getSelection().removeAllRanges(); setSel(null); seekToWord(i); }
    } else { lastTap = { t: now, x: p.clientX, y: p.clientY }; if (v === "#pdfView") setSel(null); }
  });
}

// ---------- Panneau : recherche & notes ----------
function openPanel(tab) {
  const p = $("#panel"); p.classList.add("open"); p.setAttribute("aria-hidden", "false");
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
  $$(".panel-body").forEach((b) => (b.hidden = b.dataset.pane !== tab));
  if (tab === "search") { $("#searchChap").value = String(S.book.chapOf[S.cur] ?? -1); setTimeout(() => $("#searchInput").focus(), 250); }
  else renderNotesList();
}
function closePanel() { $("#panel").classList.remove("open"); $("#panel").setAttribute("aria-hidden", "true"); if (S.flash) { S.flash = null; redrawMarks(); } }
$$(".tabs button").forEach((b) => (b.onclick = () => openPanel(b.dataset.tab)));

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function search(query, chap) {
  const b = S.book, q = query.split(/\s+/).map(norm).filter(Boolean);
  if (!q.length) return [];
  // mots du livre acceptés pour chaque mot de la recherche (tolère les fautes de frappe)
  b.vocab ??= [...new Set(b.tok)];
  const accept = new Map();
  q.forEach((w, k) => {
    const max = w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0;
    for (const v of b.vocab) if (v === w || (max && lev(v, w, max) <= max)) { if (!accept.has(v)) accept.set(v, new Set()); accept.get(v).add(k); }
  });
  let t0 = 0, t1 = b.tok.length;
  if (chap >= 0) { const w0 = b.chapters[chap].word, w1 = b.chapters[chap + 1]?.word ?? b.N; t0 = b.tokWord.findIndex((w) => w >= w0); t1 = b.tokWord.findIndex((w) => w >= w1); if (t1 < 0) t1 = b.tok.length; }
  const W = q.length + Math.ceil(q.length / 3) + 1, hits = [];
  for (let i = t0; i < t1; i++) {
    if (!accept.has(b.tok[i])) continue;
    const seen = new Set(); let last = i;
    for (let j = i; j < Math.min(t1, i + W); j++) { const s = accept.get(b.tok[j]); if (s) { const before = seen.size; s.forEach((k) => seen.add(k)); if (seen.size > before) last = j; } }
    const score = seen.size / q.length;
    if (score >= Math.min(0.6, (q.length - 1) / q.length || 1)) hits.push({ i, j: last, score });
  }
  hits.sort((x, y) => y.score - x.score || x.i - y.i);
  const out = [];
  for (const h of hits) { if (out.some((o) => Math.abs(o.i - h.i) < W)) continue; out.push(h); if (out.length >= 25) break; }
  return out.map((h) => ({ ...h, w0: b.tokWord[h.i], w1: (b.flags[b.tokWord[h.j]] & 6) ? b.tokWord[h.j] + 1 : b.tokWord[h.j] }));
}
const runSearch = debounce(() => {
  const qv = $("#searchInput").value.trim(), box = $("#searchRes");
  if (qv.length < 2) { box.innerHTML = ""; return; }
  const res = search(qv, +$("#searchChap").value), b = S.book;
  if (!res.length) { box.innerHTML = `<p class="empty">${t("Aucun passage trouvé. Essaie moins de mots ou un autre chapitre.")}</p>`; return; }
  box.innerHTML = res.map((r, k) => `<div class="res" data-k="${k}" role="button" tabindex="0"><small>${esc(b.chapters[b.chapOf[r.w0]].title)} · ${t("page")} ${b.page[r.w0] + 1}${r.score < 1 ? " · " + t("proche") : ""}</small>
    ${esc(textRange(Math.max(0, r.w0 - 8), r.w0 - 1))} <mark>${esc(textRange(r.w0, r.w1))}</mark> ${esc(textRange(r.w1 + 1, Math.min(b.N - 1, r.w1 + 8)))}
    <div class="res-actions"><button class="btn small" data-hl="${k}">${t("Surligner")}</button><button class="btn small" data-note="${k}">${t("+ Note")}</button></div></div>`).join("");
  box.onclick = (e) => {
    const hl = e.target.closest("[data-hl]"), nt = e.target.closest("[data-note]"), it = e.target.closest(".res");
    if (!it) return;
    const r = res[+(hl?.dataset.hl ?? nt?.dataset.note ?? it.dataset.k)];
    if (hl) return addNote("hl", r.w0, r.w1);
    goToRange(r.w0, r.w1);
    if (nt) addNote("note", r.w0, r.w0);
  };
}, 250);
function goToRange(w0, w1) {
  S.flash = [w0, w1];
  const b = S.book;
  seekTo(b.t[w0] + 0.01).then(() => { follow(true); redrawMarks(); scrollToWord(w0, true); });
  if (innerWidth < 640) closePanelKeepFlash();
}
function closePanelKeepFlash() { $("#panel").classList.remove("open"); }
$("#searchInput").addEventListener("input", runSearch);
$("#searchChap").onchange = runSearch;

function renderNotesList() {
  const b = S.book, box = $("#notesList");
  box.onclick = null;
  if (!S.notes.length) { box.innerHTML = `<p class="empty">${t("Aucune note pour l'instant.")}<br>${t("Sélectionne un passage puis clic droit (ou appui long) pour noter ou surligner.")}</p>`; return; }
  sortNotes();
  let html = "", lastP = -1;
  for (const n of S.notes) {
    const p = b.page[n.w0];
    if (p !== lastP) { html += `<p class="chap-h">${t("Page")} ${p + 1} · ${esc(b.chapters[b.chapOf[n.w0]].title)}</p>`; lastP = p; }
    html += noteEd(n, true);
  }
  box.innerHTML = html;
}

// Export du carnet de lecture
function carnet() {
  const b = S.book, groups = [];
  for (const n of sortNotes()) { const c = b.chapOf[n.w0]; (groups[c] ??= []).push(n); }
  return groups.map((ns, c) => ns && { title: b.chapters[c].title, items: ns.map((n) => ({ kind: n.kind, title: n.title || t(n.kind === "hl" ? "Citation" : "Note"), page: b.page[n.w0] + 1, quote: textRange(n.w0, n.w1), body: n.body || "" })) }).filter(Boolean);
}
function download(name, data, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function exportMd() {
  const b = S.book;
  let md = `# ${t("Carnet de lecture")} — ${b.title}\n\n*${b.author}*\n\n`;
  for (const g of carnet()) {
    md += `## ${g.title}\n\n`;
    for (const it of g.items) md += `### ${it.title} (p. ${it.page})\n\n> « ${it.quote} »\n\n${it.body ? it.body + "\n\n" : ""}`;
  }
  download(`Carnet - ${b.title}.md`, md, "text/markdown");
}
function exportWord() {
  const b = S.book;
  let h = `<html><head><meta charset="utf-8"><style>body{font-family:Georgia;line-height:1.5}blockquote{border-left:3px solid #c9a227;margin:8px 0;padding-left:10px;font-style:italic}h1{font-size:22pt}h2{font-size:15pt;margin-top:18pt}</style></head><body><h1>${t("Carnet de lecture")} — ${esc(b.title)}</h1><p><i>${esc(b.author)}</i></p>`;
  for (const g of carnet()) {
    h += `<h2>${esc(g.title)}</h2>`;
    for (const it of g.items) h += `<h3>${esc(it.title)} <small>(p. ${it.page})</small></h3><blockquote>« ${esc(it.quote)} »</blockquote>${it.body ? `<p>${esc(it.body).replace(/\n/g, "<br>")}</p>` : ""}`;
  }
  download(`Carnet - ${b.title}.doc`, h + "</body></html>", "application/msword");
}

// ---------- Hors ligne ----------
async function updateDownloadBtn() { const b = $('.rtools [data-act="download"]'); const on = !!store.get("offline", {})[S.book.id]; b.classList.toggle("on", on); b.innerHTML = icon(on ? "done" : "download"); b.title = on ? t("Disponible hors ligne") : t("Télécharger pour le hors ligne"); }
async function downloadBook() {
  const b = S.book, off = store.get("offline", {});
  if (off[b.id]) { if (!(await confirmBox(t("Retirer ce livre du stockage hors ligne ?"), "", t("Retirer")))) return; await caches.delete("book-" + b.id); delete off[b.id]; store.set("offline", off); updateDownloadBtn(); return; }
  const urls = [b.base + "book.json", b.base + "book.pdf", ...b.parts.map((p) => b.base + p.src)];
  const cache = await caches.open("book-" + b.id);
  try {
    navigator.storage?.persist?.();
    for (let k = 0; k < urls.length; k++) { toast(`${t("Téléchargement hors ligne…")} ${Math.round((k / urls.length) * 100)} %`, 60000); if (!(await cache.match(urls[k]))) await cache.add(urls[k]); }
    off[b.id] = Date.now(); store.set("offline", off); toast(t("Livre disponible hors ligne ✓")); updateDownloadBtn();
  } catch { toast(t("Téléchargement interrompu (connexion ou espace insuffisant).")); }
}

// ---------- Paramètres ----------
const BG_PRESETS = ["", "#efe6d2", "#dfe7df", "#e3e0ee", "#2a2622", "#1d2a2a", "linear-gradient(160deg,#f3d9b1,#d9a77c)", "linear-gradient(160deg,#25313a,#0f1418)"];
function openSettings() {
  const f = $("#settings form"), p = S.prefs;
  // site en ligne (sans stockage) : on peut y relier son PC ; 503 = PC relié mais éteint
  $("#pcCmd").hidden = true;
  api("/ai/quota").then((q) => ($("#pcSection").hidden = !q.cloud), (e) => ($("#pcSection").hidden = e.status !== 503));
  // Lisio hébergé sur ce PC : adresse du tunnel pour le téléphone
  api("/pc/address").then(({ url }) => { $("#phoneSection").hidden = !url; $("#phoneUrl").textContent = url || ""; }, () => ($("#phoneSection").hidden = true));
  f.theme.value = p.theme;
  for (const k of ["wordColor", "sentColor", "hlColor", "searchColor", "font"]) f[k].value = p[k];
  $("#fsOut").value = Math.round((p.fontSize / 20) * 100) + " %";
  f.autoScroll.checked = p.autoScroll;
  f.lang.value = LANG;
  $("#setEmail").textContent = S.user;
  $("#setName").value = S.name || "";
  $("#bgSection").hidden = !S.book || $("#reader").hidden;
  if (S.book) {
    const cur = p.books[S.book.id]?.bg || "";
    $("#bgChoices").innerHTML = BG_PRESETS.map((c, k) => `<button type="button" data-bg="${k}" class="${c === cur ? "on" : ""}" style="background:${c || "var(--bg)"}" aria-label="Fond ${k}">${c ? "" : "∅"}</button>`).join("")
      + (cur.startsWith("data:") ? `<button type="button" class="on" style="background-image:url(${cur})" aria-label="Image actuelle"></button>` : "");
  }
  $("#settings").showModal();
}
$("#settings form").addEventListener("input", (e) => {
  const f = e.currentTarget, el = e.target, p = S.prefs;
  if (!el.name) return;
  p[el.name] = el.type === "checkbox" ? el.checked : el.type === "range" ? +el.value : el.value;
  applyPrefs(); savePrefs();
  if (el.name === "lang") { // re-dessine les parties générées par le code
    setLang(el.value);
    if (!$("#library").hidden) showLibrary();
    if (S.book) { $("#searchChap").options[0].text = t("Tout le livre"); updateDownloadBtn(); }
    if (!$("#add").hidden) { renderAdd(); if (job) renderJob(job); showQuota(); }
  }
});
$("#setName").addEventListener("change", async (e) => {
  const v = e.target.value.trim(); if (!v) return;
  try { await api("/name", "PUT", { name: v }); S.name = v; const me = store.get("me", {}); me.name = v; store.set("me", me); $("#hello").textContent = `${t("Bonjour")}, ${v}`; } catch (ex) { toast(ex.message); }
});
$$("[data-fs]").forEach((b) => (b.onclick = () => {
  S.prefs.fontSize = Math.max(14, Math.min(36, S.prefs.fontSize + 2 * +b.dataset.fs)); // pas de 10 %
  $("#fsOut").value = Math.round((S.prefs.fontSize / 20) * 100) + " %";
  applyPrefs(); savePrefs();
}));
$("#bgChoices").addEventListener("click", (e) => { const b = e.target.closest("[data-bg]"); if (!b) return; setBg(BG_PRESETS[+b.dataset.bg]); });
function setBg(v) { (S.prefs.books[S.book.id] ??= {}).bg = v; applyBg(); savePrefs(); openSettings(); }
$("#bgFile").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  // réduit l'image (≤1600 px, JPEG) pour qu'elle tienne dans les préférences synchronisées
  const img = await createImageBitmap(file), s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s;
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  setBg(c.toDataURL("image/jpeg", 0.72)); e.target.value = "";
});

// ---------- Ajouter un livre : le navigateur lit le PDF et découpe l'audio, Whisper (sur le PC serveur) transcrit, tout est rangé sur le PC ----------
const COVERS = [["#7a2e22", "#3d1712"], ["#2f5d50", "#15302a"], ["#27466b", "#121f33"], ["#5b3a6e", "#2a1836"], ["#8a5a1f", "#4a2c0c"], ["#9b3d55", "#4b1726"], ["#41622f", "#1f3215"], ["#3c3c3c", "#151515"]];
const add = { pdf: null, audio: [], colors: COVERS[0], quota: null };
const isAudio = (f) => /\.mp3$/i.test(f.name); // MP3 seulement : découpé sans décodage, et léger
const byName = (a, b) => a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" });
let job = null; // ajout en cours : il continue tant que la page reste ouverte

async function showQuota() {
  const q = (add.quota = await api("/ai/quota").catch(() => null)), el = $("#quotaInfo");
  el.hidden = false; el.className = "quota-info " + (q?.ready ? "ok" : "off");
  el.querySelector("span").textContent = q && !q.storage ? t("Aucun PC n'est relié à ce site : Paramètres → « Relier mon PC ».") : q?.ready ? t("Le PC est prêt à transcrire") : q ? t("Whisper n'est pas lancé sur le PC : le livre attendra dans la file.") : t("Le PC ne répond pas : le livre sera gardé sur cet appareil et envoyé dès qu'il répond.");
}
function showAdd() {
  if (location.pathname !== "/ajouter") history.pushState(null, "", "/ajouter");
  show("add");
  $("#coverColors").innerHTML = COVERS.map((c, k) => `<button type="button" data-k="${k}" style="--c1:${c[0]};--c2:${c[1]}" class="${c === add.colors ? "on" : ""}" aria-label="Couverture ${k + 1}"></button>`).join("");
  $("#addForm").hidden = !!job; $("#addProgress").hidden = !job;
  if (job) renderJob(job);
  showQuota();
}
$("#coverColors").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; add.colors = COVERS[+b.dataset.k]; $$("#coverColors button").forEach((x) => x.classList.toggle("on", x === b)); });

async function filesFromDrop(dt) {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean), out = [];
  if (!entries.length) return [...dt.files];
  const walk = async (e) => {
    if (e.isFile) out.push(await new Promise((res, rej) => e.file(res, rej)));
    else if (e.isDirectory) { const r = e.createReader(); let batch; do { batch = await new Promise((res, rej) => r.readEntries(res, rej)); for (const x of batch) await walk(x); } while (batch.length); }
  };
  for (const e of entries) await walk(e);
  return out;
}
function takeFiles(files) {
  const pdf = files.find((f) => /\.pdf$/i.test(f.name));
  if (pdf) add.pdf = pdf;
  const aud = files.filter(isAudio).sort(byName);
  $("#addErr").textContent = files.some((f) => !isAudio(f) && /\.(m4a|mp4|wav|ogg|opus|aac|flac|webm|wma)$/i.test(f.name)) ? t("Seuls les fichiers MP3 sont acceptés.") : "";
  if (aud.length) add.audio = [...add.audio.filter((a) => !aud.some((b) => b.name === a.name)), ...aud].sort(byName);
  aud.forEach((f) => { // durée lue par le navigateur, pour l'estimation
    const a = new Audio(); a.preload = "metadata"; a.src = URL.createObjectURL(f);
    a.onloadedmetadata = () => { f._dur = a.duration; URL.revokeObjectURL(a.src); renderAdd(); };
  });
  renderAdd();
}
function renderAdd() {
  $("#pdfFile").innerHTML = add.pdf ? `<li><span class="nm" title="${esc(add.pdf.name)}">${esc(add.pdf.name)}</span><span class="dur">${(add.pdf.size / 1e6).toFixed(1)} Mo</span><span class="mv"><button type="button" data-rmpdf aria-label="${t("Retirer")}">✕</button></span></li>` : "";
  $("#dropPdf").classList.toggle("ok", !!add.pdf);
  $("#dropAudio").classList.toggle("ok", add.audio.length > 0);
  $("#audioList").innerHTML = add.audio.map((f, k) => `<li><span class="nm" title="${esc(f.name)}">${esc(f.name)}</span><span class="dur">${f._dur ? fmt(f._dur) : "…"}</span>
    <span class="mv"><button type="button" data-mv="${k}" data-d="-1" aria-label="${t("Monter")}">↑</button><button type="button" data-mv="${k}" data-d="1" aria-label="${t("Descendre")}">↓</button><button type="button" data-rm="${k}" aria-label="${t("Retirer")}">✕</button></span></li>`).join("");
  const total = add.audio.reduce((s, f) => s + (f._dur || 0), 0), mb = add.audio.reduce((s, f) => s + f.size, 0) / 1e6;
  // 1 morceau = 20 min / 25 Mo ; Whisper sur carte graphique ≈ 10× plus vite que la lecture (sur processeur, bien plus lent)
  const n = add.audio.reduce((s, f) => s + Math.max(1, Math.ceil(f.size / (MAX_BYTES - 1e5)), Math.ceil((f._dur || 0) / MAX_SEC)), 0);
  $("#estimate").textContent = add.audio.length ? `${add.audio.length} fichier${add.audio.length > 1 ? "s" : ""} · ${dur(total)} ${t("d'audio")} · ${Math.round(mb)} Mo — ${t("traitement estimé")} ≈ ${dur(total / 10 + 60)} ${t("(carte graphique)")}` : "";
}
$("#codeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const inp = e.target.elements.code, err = $("#codeErr"), msg = $("#codeMsg"), btn = e.target.querySelector("button"); err.textContent = "";
  const m = inp.value.trim().match(/^(https?:\/\/[^/\s]+)\/partage\/([A-Za-z0-9-]+)\/?$/);
  btn.disabled = true;
  try {
    if (m && m[1] !== location.origin) await importRemote(m[1], m[2], (p) => (msg.textContent = `${t("Copie du livre depuis l'autre PC…")} ${p} %`));
    else await api("/share", "POST", { code: m ? m[2] : inp.value });
    inp.value = ""; toast(t("Livre ajouté à ta bibliothèque ✓")); ACTIONS.toLibrary();
  } catch (ex) { err.textContent = ex.status === 404 ? t("Code inconnu.") : ex.message || t("Pas de connexion internet."); }
  finally { msg.textContent = ""; btn.disabled = false; }
});
// Copie complète d'un livre partagé par un autre PC Lisio (PDF, audio, synchronisation) dans ce Lisio
async function importRemote(origin, code, prog) {
  code = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const get = async (u, asJson) => {
    const r = await fetch(u).catch(() => null);
    if (!r?.ok) throw new Error(r?.status === 404 ? t("Code inconnu.") : t("L'autre PC Lisio ne répond pas : il doit être allumé avec Lisio lancé."));
    return asJson ? r.json() : r.blob();
  };
  const info = await get(`${origin}/api/share/${code}`, true), base = `${origin}/books/${encodeURIComponent(info.id)}/`;
  const bookJson = await get(base + "book.json");
  const files = ["book.pdf", ...JSON.parse(await bookJson.text()).parts.map((p) => p.src)];
  prog(0);
  const { id } = await api("/books", "POST", { title: info.title, author: info.author, year: info.year, colors: info.colors });
  for (const [k, f] of files.entries()) { await putFile(id, f, await get(base + f)); prog(Math.round(((k + 1) / (files.length + 1)) * 100)); }
  await putFile(id, "book.json", bookJson);
  await api(`/books/${id}/publish`, "POST", { duration: info.duration });
}
async function putFile(id, name, blob) {
  for (let k = 0; ; k++) {
    const r = await fetch(`/api/books/${id}/files/${name}`, { method: "PUT", body: blob }).catch(() => null);
    if (r?.ok) return;
    if (k >= 3 || (r && r.status < 500)) throw Object.assign(new Error((await r?.json().catch(() => null))?.error || t("Envoi des fichiers impossible.")), { net: !r || r.status >= 502 });
    await new Promise((res) => setTimeout(res, 3000 * (k + 1)));
  }
}
$("#pdfFile").addEventListener("click", (e) => { if (e.target.closest("[data-rmpdf]")) { add.pdf = null; renderAdd(); } });
$("#audioList").addEventListener("click", (e) => {
  const mv = e.target.closest("[data-mv]"), rm = e.target.closest("[data-rm]");
  if (mv) { const k = +mv.dataset.mv, j = k + +mv.dataset.d; if (j >= 0 && j < add.audio.length) [add.audio[k], add.audio[j]] = [add.audio[j], add.audio[k]]; }
  if (rm) add.audio.splice(+rm.dataset.rm, 1);
  renderAdd();
});
for (const id of ["#dropPdf", "#dropAudio"]) {
  const z = $(id);
  z.addEventListener("dragover", (e) => { e.preventDefault(); z.classList.add("over"); });
  z.addEventListener("dragleave", () => z.classList.remove("over"));
  z.addEventListener("drop", async (e) => { e.preventDefault(); z.classList.remove("over"); takeFiles(await filesFromDrop(e.dataTransfer)); });
  z.querySelector("input").addEventListener("change", (e) => { takeFiles([...e.target.files]); e.target.value = ""; });
  z.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); z.querySelector("input").click(); } });
}
$("#pickFolder").addEventListener("click", (e) => {
  e.preventDefault(); e.stopPropagation();
  const i = document.createElement("input"); i.type = "file"; i.webkitdirectory = true; i.multiple = true;
  i.onchange = () => takeFiles([...i.files]); i.click();
});

$("#addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target), err = $("#addErr"); err.textContent = "";
  if (!add.pdf) return (err.textContent = t("Ajoute le PDF du livre."));
  if (!add.audio.length) return (err.textContent = t("Ajoute au moins un fichier audio."));
  if (add.quota && !add.quota.storage) return (err.textContent = t("Aucun PC n'est relié à ce site : Paramètres → « Relier mon PC ».")); // site en ligne sans PC relié
  job = { key: Date.now(), user: S.user, title: f.get("title").trim(), author: f.get("author").trim(), year: f.get("year").trim(), colors: add.colors, pdf: add.pdf, audio: [...add.audio], pct: {} };
  $("#addForm").hidden = true; $("#addProgress").hidden = false; renderJob(job);
  const lock = await navigator.wakeLock?.request("screen").catch(() => null); // l'écran reste allumé (téléphone)
  try { await sendJob(job); } catch (ex) { job.error = ex.message || String(ex); renderJob(job); } finally { lock?.release().catch(() => {}); }
});
// PC éteint ou injoignable (tunnel : 502/530)
const isNet = (e) => e instanceof TypeError || e?.net || [502, 503, 504, 530].includes(e?.status);
async function sendJob(j) {
  try {
    if (!(await api("/ai/quota").catch(() => null))) throw Object.assign(new Error(), { net: true });
    await runJob(j);
    await outbox.del(j.key).catch(() => {});
  } catch (ex) {
    if (!isNet(ex)) { await outbox.del(j.key).catch(() => {}); throw ex; }
    // gardé sur cet appareil (IndexedDB) : il partira dès que le PC répond
    const { pct, error, done, local, ...keep } = j;
    await outbox.put(keep);
    j.local = j.done = true; renderJob(j); drainSoon();
  }
}
async function runJob(j) {
  const set = (k, v) => { j.pct[k] = v; renderJob(j); };
  // 1. lecture du PDF (mots + positions) et découpage du MP3, dans le navigateur
  set("prep", 1);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await j.pdf.arrayBuffer()) }).promise;
  const pdf = await pdfWords(doc, (x) => set("prep", x * 80));
  doc.destroy();
  const chunks = [];
  for (const f of j.audio) chunks.push(...(await audioChunks(f)));
  set("prep", 100);
  // 2. envoi au PC (un livre déjà créé lors d'un essai précédent est complété)
  if (!j.id) { j.id = (await api("/books", "POST", { title: j.title, author: j.author, year: j.year, colors: j.colors })).id; await outbox.get(j.key).then((o) => o && outbox.put({ ...o, id: j.id })).catch(() => {}); }
  const json = (o) => new Blob([JSON.stringify(o)], { type: "application/json" });
  const files = [["book.pdf", j.pdf], ["pdf.json", json(pdf)], ...chunks.map((c, k) => [`audio/${String(k + 1).padStart(3, "0")}.${c.ext}`, c.blob]),
    ["job.json", json({ chunks: chunks.map((c) => ({ ext: c.ext, mime: c.mime, duration: c.duration })) })]];
  const total = files.reduce((s, [, b]) => s + b.size, 0); let sent = 0;
  for (const [name, blob] of files) { await putFile(j.id, name, blob); sent += blob.size; set("upload", (sent / total) * 100); }
  // 3. file d'attente : le PC transcrit et synchronise tout seul (scripts/queue.mjs)
  await api(`/books/${j.id}/queue`, "POST");
  j.done = true; set("queue", 100);
}
addEventListener("beforeunload", (e) => { if (job && !job.done && !job.error) e.preventDefault(); }); // fermer la page arrête l'envoi

// Livres gardés sur cet appareil quand le PC ne répondait pas
const outbox = {
  db: () => new Promise((res, rej) => { const r = indexedDB.open("lisio-outbox", 1); r.onupgradeneeded = () => r.result.createObjectStore("jobs", { keyPath: "key" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
  async run(mode, fn) { const d = await outbox.db(); return new Promise((res, rej) => { const tx = d.transaction("jobs", mode), q = fn(tx.objectStore("jobs")); tx.oncomplete = () => res(q.result); tx.onerror = () => rej(tx.error); }); },
  all: () => outbox.run("readonly", (s) => s.getAll()),
  get: (key) => outbox.run("readonly", (s) => s.get(key)),
  put: (j) => outbox.run("readwrite", (s) => s.put(j)),
  del: (key) => outbox.run("readwrite", (s) => s.delete(key)),
};
let draining = false, drainTimer = 0;
function drainSoon() { clearTimeout(drainTimer); drainTimer = setTimeout(drainOutbox, 30000); }
async function drainOutbox() {
  if (draining || !S.user) return;
  const list = (await outbox.all().catch(() => [])).filter((o) => o.user === S.user && o.key !== (job && !job.done ? job.key : 0));
  showOutbox(list.length);
  if (!list.length) return;
  if (!(await api("/ai/quota").catch(() => null))) return drainSoon();
  draining = true;
  try {
    for (const o of list) {
      const j = { ...o, pct: {} };
      try { await runJob(j); await outbox.del(o.key); toast(`« ${o.title} » ${t("est envoyé au PC ✓")}`); }
      catch (ex) { if (isNet(ex)) break; await outbox.del(o.key); toast(`« ${o.title} » : ${ex.message}`); }
    }
  } finally { draining = false; }
  const left = (await outbox.all().catch(() => [])).filter((o) => o.user === S.user).length;
  showOutbox(left);
  if (left) drainSoon(); else if (!$("#library").hidden) showLibrary();
}
function showOutbox(n) {
  const el = $("#outboxNote"); el.hidden = !n;
  el.textContent = n ? `${n} ${t(n > 1 ? "livres gardés sur cet appareil : ils partiront vers le PC dès qu'il répondra." : "livre gardé sur cet appareil : il partira vers le PC dès qu'il répondra.")}` : "";
}
addEventListener("online", () => drainOutbox());

const ADD_STAGES = [["prep", "Lecture du PDF et de l'audio", 25], ["upload", "Envoi des fichiers au PC", 70], ["queue", "Mise en file d'attente", 5]];
function renderJob(j) {
  $("#apTitle").textContent = j.title;
  let pct = 0;
  ADD_STAGES.forEach(([k, , w]) => (pct += (w * (j.pct[k] || 0)) / 100));
  pct = j.done ? 100 : Math.min(99, pct);
  $("#apBar").style.width = pct + "%"; $("#apPct").textContent = Math.floor(pct) + " %";
  const cur = ADD_STAGES.findIndex(([k]) => (j.pct[k] || 0) < 100);
  $("#apStages").hidden = !!j.local;
  $("#apStages").innerHTML = ADD_STAGES.map(([k, label], i) => {
    const v = j.pct[k] || 0, ok = v >= 100 || j.done;
    return `<li class="${ok ? "ok" : (v > 0 || i === cur) && !j.error ? "run" : ""}"><span class="st">${ok ? "✓" : ""}</span>${t(label)}<span class="muted">${!ok && v >= 1 ? Math.floor(v) + " %" : ""}</span></li>`;
  }).join("");
  $("#apEta").textContent = j.error || j.done ? "" : t("Garde cette page ouverte pendant l'envoi");
  $("#apLog").hidden = !j.error; if (j.error) $("#apLog").textContent = j.error;
  $("#apDone").hidden = !(j.error || j.done);
  $("#apDone").innerHTML = j.error
    ? `<strong>${t("L'envoi s'est arrêté.")}</strong><button class="btn small" data-act="resetAdd">${t("Recommencer")}</button>`
    : j.local ? `<strong>« ${esc(j.title)} » ${t("est gardé sur cet appareil")}</strong><span class="muted">${t("Le PC ne répond pas. Le livre partira tout seul dès qu'il répond : rouvre Lisio quand le PC est allumé.")}</span><button class="btn accent" data-act="doneAdd">${t("Retour à la bibliothèque")}</button>`
    : j.done ? `<strong>« ${esc(j.title)} » ${t("est envoyé au PC ✓")}</strong><span class="muted">${t("Le PC le transcrit et le synchronise tout seul : tu peux fermer la page. Il apparaîtra dans ta bibliothèque quand il sera prêt.")}</span><button class="btn accent" data-act="doneAdd">${t("Retour à la bibliothèque")}</button>` : "";
}

// ---------- Actions ----------
const ACTIONS = {
  toggleHidden: () => { S.showHidden = !S.showHidden; renderLibrary(); },
  back: () => { audio.pause(); saveProgress(); closePanel(); S.book = null; seg = -1; audio.removeAttribute("src"); showLibrary(); },
  settings: openSettings, search: () => ($("#panel").classList.contains("open") && !$('[data-pane="search"]').hidden ? closePanel() : openPanel("search")),
  notes: () => ($("#panel").classList.contains("open") && !$('[data-pane="notes"]').hidden ? closePanel() : openPanel("notes")),
  closePanel, mode: () => setMode(S.prefs.mode === "pdf" ? "read" : "pdf"), download: downloadBook,
  fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()),
  play: togglePlay, back10: () => seekTo(now() - 10), fwd10: () => seekTo(now() + 10),
  addNoteHere: () => addNote("note", S.cur, S.cur), exportMd, exportWord,
  addBook: showAdd, toLibrary: () => showLibrary(), share: () => shareBook({ id: S.book.id }),
  resetAdd: () => { job = null; add.pdf = null; add.audio = []; renderAdd(); showAdd(); },
  doneAdd: () => { job = null; add.pdf = null; add.audio = []; renderAdd(); showLibrary(); },
  logout: async () => { await api("/logout", "POST").catch(() => {}); localStorage.clear(); location.href = "/"; },
};
document.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b && ACTIONS[b.dataset.act]) { if (b.closest("dialog") && b.dataset.act !== "logout") return; e.preventDefault(); ACTIONS[b.dataset.act](); } });
$("#pcPair").addEventListener("click", async () => {
  try {
    const { code } = await api("/pc/pair", "POST");
    $("#cmdLink").textContent = `cd "$HOME\\Downloads\\Lisio"; node scripts/link.mjs ${location.origin} ${code}`;
    $("#pcCmd").hidden = false;
  } catch (e) { toast(e.message || t("Pas de connexion internet.")); }
});
$("#settings").addEventListener("click", (e) => { const b = e.target.closest("[data-copy]"); if (b) navigator.clipboard?.writeText($("#" + b.dataset.copy).textContent).then(() => toast(t("Commande copiée"))); });
if (!document.fullscreenEnabled) $$('[data-act="fullscreen"]').forEach((b) => (b.hidden = true));
document.addEventListener("keydown", (e) => {
  if ($("#reader").hidden || e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  else if (e.key === "ArrowLeft") seekTo(now() - 10);
  else if (e.key === "ArrowRight") seekTo(now() + 10);
  else if (e.key === "f" || e.key === "F") ACTIONS.fullscreen();
  else if (e.key === "/") { e.preventDefault(); openPanel("search"); }
  else if (e.key === "Escape") closePanel();
});
addEventListener("popstate", () => {
  if (!location.pathname.startsWith("/livre/") && S.book) ACTIONS.back();
  else if (location.pathname === "/ajouter") showAdd();
  else if (location.pathname === "/" && !$("#add").hidden) ACTIONS.toLibrary();
});

boot();
