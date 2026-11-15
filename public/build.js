// Préparation d'un livre dans le navigateur : mots du PDF avec leur position, découpage du MP3 en morceaux.
// La transcription (Whisper) et l'alignement (align.js) se font ensuite sur le PC qui héberge Lisio (scripts/queue.mjs).
import * as pdfjs from "/vendor/pdf.min.mjs";


// ---------- 1. Mots du PDF (même logique que tools/build_book.py) ----------
// Titre de chapitre seul sur sa ligne : « Chapitre XII », « CHAPITRE PREMIER », « Chapitre 3 », « XII. »
const CHAP = /^(?:(?:[Cc]hapitre|CHAPITRE|[Cc]hapter|CHAPTER)\s+([IVXLC]+|\d+|[Pp]remier|PREMIER|[Pp]remière|PREMIÈRE|[A-Za-zéèÉÈ-]+i[eè]me|[A-ZÉÈ-]+IÈME)\.?|([IVXLC]{1,7})\.?)$/;
const ctx = document.createElement("canvas").getContext("2d");

async function pageLines(page) {
  const vp = page.getViewport({ scale: 1 }), W = vp.width, H = vp.height;
  const items = [];
  for (const it of (await page.getTextContent()).items) {
    if (!it.str || !it.str.trim()) continue;
    const m = pdfjs.Util.transform(vp.transform, it.transform), fh = Math.hypot(m[2], m[3]);
    if (Math.abs(m[1]) > 0.01 * fh || fh < 1) continue; // texte tourné : ignoré
    items.push({ s: it.str, x: m[4], y: m[5], h: fh, w: it.width * (vp.scale || 1) });
  }
  // lignes : même ligne de base (à une demi-hauteur de lettre près), triées de haut en bas puis de gauche à droite
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const l = lines.find((l) => Math.abs(l.y - it.y) < 0.5 * Math.min(l.h, it.h));
    l ? l.items.push(it) : lines.push({ y: it.y, h: it.h, items: [it] });
  }
  lines.sort((a, b) => a.y - b.y);
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    // découpe en mots ; la position de chaque mot est estimée avec la largeur des lettres (police serif mise à l'échelle)
    const words = [];
    let glue = false; // le morceau précédent finit au milieu d'un mot
    for (const it of l.items) {
      ctx.font = `${it.h}px serif`;
      const k = it.w / (ctx.measureText(it.s).width || 1);
      const prev = words[words.length - 1];
      const touching = prev && it.x - prev.x1 < 0.15 * it.h;
      for (const m of it.s.matchAll(/\S+/g)) {
        const x0 = it.x + ctx.measureText(it.s.slice(0, m.index)).width * k, x1 = x0 + ctx.measureText(m[0]).width * k;
        if (m.index === 0 && glue && touching) { prev.t += m[0]; prev.x1 = x1; }
        else words.push({ t: m[0], x0, x1, y: it.y, h: it.h });
      }
      glue = !/\s$/.test(it.s);
    }
    l.words = words; l.x0 = words[0]?.x0 ?? 0; l.x1 = words.at(-1)?.x1 ?? 0;
    l.text = words.map((w) => w.t).join(" ");
  }
  return { W, H, lines: lines.filter((l) => l.words.length) };
}

export async function pdfWords(doc, onProgress) {
  const P = [];
  for (let i = 1; i <= doc.numPages; i++) { P.push(await pageLines(await doc.getPage(i))); onProgress?.(i / doc.numPages); }
  const pages = P.map((p) => [Math.round(p.W * 10) / 10, Math.round(p.H * 10) / 10]);
  const text = [], page = [], box = [], flags = [], chapters = [];
  const hasChapters = P.some((p) => p.lines.some((l) => CHAP.test(l.text.trim())));
  let started = !hasChapters;
  if (!hasChapters) chapters.push({ title: "Texte", word: 0 });
  pages: for (let pi = 0; pi < P.length; pi++) {
    const { W, H, lines } = P[pi];
    const left = Math.min(...lines.map((l) => l.x0)), right = Math.max(...lines.map((l) => l.x1));
    const gaps = lines.slice(1).map((l, k) => l.y - lines[k].y).filter((g) => g > 0).sort((a, b) => a - b);
    const step = gaps[gaps.length >> 1] || 0;
    let prev = null;
    for (const l of lines) {
      const top = l.y - 0.8 * l.h;
      if ((top < 0.12 * H || top > 0.85 * H) && /^[–\-\s\d]+$/.test(l.text)) continue; // numéro de page « – 26 – »
      if (started && chapters.length && /^À propos de cette édition/.test(l.text)) { started = null; break pages; } // fin du texte (Ebooks libres et gratuits)
      const m = hasChapters && l.text.trim().match(CHAP);
      if (m) {
        started = true;
        const num = m[1] || m[2];
        chapters.push({ title: `Chapitre ${num === num.toUpperCase() ? num : num[0].toUpperCase() + num.slice(1)}`, word: text.length });
      }
      if (!started) { prev = l; continue; }
      // début de paragraphe : retrait, grand espace avec la ligne d'avant, ou ligne d'avant courte qui finit une phrase
      const para = !prev || l.x0 - left > 0.8 * l.h || (step && l.y - prev.y > 1.6 * step)
        || (right - prev.x1 > 0.15 * (right - left) && /[.!?»…:]$/.test(prev.text)) || !!m || (prev && CHAP.test(prev.text.trim()));
      l.words.forEach((w, wi) => {
        text.push(w.t); page.push(pi);
        box.push([Math.round((w.x0 / W) * 1e4), Math.round(((w.y - 0.8 * w.h) / H) * 1e4), Math.round((w.x1 / W) * 1e4), Math.round(((w.y + 0.22 * w.h) / H) * 1e4)]);
        let f = wi === 0 && para ? 1 : 0;
        if (wi === l.words.length - 1 && w.t.endsWith("-") && w.t.length > 1 && !w.t.endsWith("--")) f |= 2;
        flags.push(f);
      });
      prev = l;
    }
  }
  // un paragraphe qui continue sur la page suivante ne doit pas être coupé
  for (let i = 1; i < text.length; i++)
    if (flags[i] & 1 && page[i] !== page[i - 1] && !/[.!?»…:]$/.test(text[i - 1]) && !text[i].startsWith("—")) flags[i] &= ~1;
  if (!text.length) throw new Error("Aucun texte trouvé dans ce PDF (PDF scanné en images ?).");
  return { pages, text, page, box, flags, chapters };
}

// ---------- 2. Découpage de l'audio en morceaux (20 min / 25 Mo au plus), sans le décoder ----------
const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
function frameAt(b, i) { // en-tête de trame MP3 (MPEG 1/2/2.5, couche III)
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3;
  if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) return null;
  const sr = SR[ver][sri], samples = ver === 3 ? 1152 : 576;
  return { len: Math.floor(((samples / 8) * (ver === 3 ? BR1 : BR2)[bri] * 1000) / sr) + ((b[i + 2] >> 1) & 1), dur: samples / sr };
}
export const MAX_BYTES = 25e6, MAX_SEC = 1200;
async function mp3Chunks(file) {
  const out = [], WIN = 4 << 20;
  let pos = 0, buf = new Uint8Array(0), base = 0, start = -1, dur = 0, first = true;
  // garantit les octets [p, p+n) en mémoire (fenêtre de 4 Mo relue au besoin)
  const has = (p, n) => p >= base && p + n <= base + buf.length;
  const load = async (p) => { base = p; buf = new Uint8Array(await file.slice(p, Math.min(file.size, p + WIN)).arrayBuffer()); };
  await load(0);
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) // balise ID3v2 au début
    pos = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]) + (buf[5] & 0x10 ? 10 : 0);
  const cut = () => { if (start >= 0 && dur > 0) out.push({ blob: file.slice(start, pos, "audio/mpeg"), duration: dur, mime: "audio/mpeg", ext: "mp3" }); start = -1; dur = 0; };
  while (pos + 4 <= file.size) {
    if (!has(pos, 4100)) await load(pos); // une trame + l'en-tête de la suivante
    const f = frameAt(buf, pos - base);
    // trame valide seulement si la suivante l'est aussi (évite les fausses synchros dans les données)
    const ok = f && (pos + f.len + 4 > file.size || frameAt(buf, pos + f.len - base));
    if (!ok) { cut(); pos++; continue; }
    if (first) { // trame d'info Xing/Info/VBRI : elle décrit tout le fichier, on ne la garde pas
      first = false;
      if (/Xing|Info|VBRI/.test(String.fromCharCode(...buf.subarray(pos - base, pos - base + 48)))) { pos += f.len; continue; }
    }
    if (start < 0) start = pos;
    pos += f.len; dur += f.dur;
    if (pos - start >= MAX_BYTES - 2000 || dur >= MAX_SEC) cut();
  }
  cut();
  if (!out.length) throw new Error(`« ${file.name} » n'est pas un MP3 lisible.`);
  return out;
}
const MIME = { m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac" };
export async function audioChunks(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "mp3") return mp3Chunks(file);
  // shortcut: les autres formats ne sont pas découpés (il faudrait les décoder) ; un fichier trop long doit être converti en MP3
  const d = file._dur || 0;
  if (!MIME[ext] || file.size > MAX_BYTES || !d || d > MAX_SEC + 20) throw new Error(`« ${file.name} » : pour les longs fichiers, seul le MP3 est accepté. Convertis-le en MP3.`);
  return [{ blob: file, duration: d, mime: MIME[ext], ext: ext === "opus" ? "ogg" : ext }];
}
