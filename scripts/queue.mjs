// File d'attente de Lisio : transcrit avec Whisper puis synchronise, un par un, les livres envoyés depuis le site
// (téléphone ou ordinateur). Lancé par start.bat / start.sh ; tourne tant que la fenêtre de Lisio est ouverte.
//   node scripts/queue.mjs init   → crée la clé partagée avec le serveur (QUEUE_KEY dans .dev.vars), puis quitte
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { randomBytes } from "crypto";
import { align } from "../public/align.js";

const LISIO = `http://127.0.0.1:${process.env.LISIO_PORT || 8787}`, WHISPER = "http://127.0.0.1:8765";
const VARS = ".dev.vars", CACHE = "data/queue";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const vars = existsSync(VARS) ? readFileSync(VARS, "utf8") : "";
let KEY = vars.match(/^QUEUE_KEY=(\w+)/m)?.[1];
if (!KEY) { KEY = randomBytes(24).toString("hex"); appendFileSync(VARS, `${vars && !vars.endsWith("\n") ? "\n" : ""}QUEUE_KEY=${KEY}\n`); }
if (process.argv[2] === "init") process.exit(0);

async function lisio(path, opts = {}) {
  const r = await fetch(LISIO + path, { ...opts, headers: { "x-queue-key": KEY, ...opts.headers } });
  if (!r.ok) throw new Error(`${path} : ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}
const file = (id, name) => fetch(`${LISIO}/books/${id}/${name}`).then((r) => { if (!r.ok) throw new Error(`${name} introuvable`); return r; });
const post = (id, what, data) => lisio(`/api/queue/${id}/${what}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

// un morceau : réessaie tant que Whisper n'est pas joignable (il démarre plus lentement que Lisio)
async function transcribe(blob, mime) {
  for (let k = 0; ; k++) {
    const r = await fetch(WHISPER + "/transcribe", { method: "POST", headers: { "x-mime": mime }, body: blob }).catch(() => null);
    if (r?.ok) return (await r.json()).words.filter((w) => w[0] && w[1] >= 0);
    if (r && k >= 2) throw new Error((await r.json().catch(() => ({}))).error || `Whisper : erreur ${r.status}`);
    await sleep(r ? 5000 : 15000);
  }
}

async function run(b) {
  console.log(`« ${b.title} » : transcription…`);
  const job = await (await file(b.id, "job.json")).json(), pdf = await (await file(b.id, "pdf.json")).json();
  // transcriptions déjà faites gardées sur le disque : un redémarrage du PC reprend où il en était
  mkdirSync(CACHE, { recursive: true });
  const cache = `${CACHE}/${b.id}.json`, tr = existsSync(cache) ? JSON.parse(readFileSync(cache, "utf8")) : [];
  const t0 = Date.now();
  for (let k = tr.length; k < job.chunks.length; k++) {
    const c = job.chunks[k], name = `audio/${String(k + 1).padStart(3, "0")}.${c.ext}`;
    tr.push(await transcribe(await (await file(b.id, name)).blob(), c.mime));
    writeFileSync(cache, JSON.stringify(tr));
    await post(b.id, "progress", { progress: ((k + 1) / job.chunks.length) * 95 });
  }
  const { book, coverage } = align(pdf, job.chunks, tr);
  if (coverage < 0.3) throw new Error(`Le texte du PDF et l'audio ne correspondent pas (${Math.round(coverage * 100)} %). Vérifie que c'est bien le même livre.`);
  Object.assign(book, { title: b.title, author: b.author });
  const body = JSON.stringify(book);
  await lisio(`/api/queue/${b.id}/book.json`, { method: "PUT", headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) }, body });
  await post(b.id, "done", { duration: book.duration });
  unlinkSync(cache);
  console.log(`« ${b.title} » prêt (${Math.round(coverage * 100)} % synchronisé, ${Math.round((Date.now() - t0) / 60000)} min).`);
}

console.log("File d'attente de Lisio prête : les livres envoyés depuis le site seront transcrits ici.");
for (;;) {
  const list = await lisio("/api/queue").then((r) => r.json()).catch(() => []); // Lisio pas encore démarré : on réessaie
  for (const b of list) {
    try { await run(b); }
    catch (e) { console.log(`« ${b.title} » : échec — ${e.message}`); await post(b.id, "fail", { error: e.message }).catch(() => {}); }
  }
  await sleep(10000);
}
