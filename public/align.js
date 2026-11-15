// Alignement texte du PDF ↔ mots entendus par Whisper. Sans dépendance au navigateur : utilisé aussi par scripts/queue.mjs (Node).
export const norm = (s) => s.normalize("NFD").toLowerCase().replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, "");

// ---------- 4. Alignement (ancres de 4 mots uniques + plus longue sous-suite commune entre les ancres) ----------
export function align(pdf, chunks, transcripts) {
  const { text, flags, chapters } = pdf;
  const tok = [], tokIdx = []; // un mot coupé « domes- tique » devient un seul token
  for (let i = 0; i < text.length;) {
    if (flags[i] & 2 && i + 1 < text.length) { tok.push(norm(text[i].slice(0, -1) + text[i + 1])); tokIdx.push([i, i + 1]); i += 2; }
    else { tok.push(norm(text[i])); tokIdx.push([i]); i++; }
  }
  const B = [], Bt = []; let off = 0;
  const parts = chunks.map((c, k) => {
    for (const [w, a, b] of transcripts[k]) { const n = norm(w); if (n) { B.push(n); Bt.push([a + off, b + off]); } }
    const p = { src: `audio/${String(k + 1).padStart(3, "0")}.${c.ext}`, offset: Math.round(off * 100) / 100, duration: Math.round(c.duration * 100) / 100 };
    off += c.duration; return p;
  });
  const A = tok, K = 4;
  const grams = (s) => { const g = new Map(); for (let i = 0; i + K <= s.length; i++) { const k = s.slice(i, i + K).join(" "); g.has(k) ? g.get(k).push(i) : g.set(k, [i]); } return g; };
  const ga = grams(A), gb = grams(B), pairs = [];
  for (const [g, pa] of ga) { const pb = gb.get(g); if (pa.length === 1 && pb?.length === 1) pairs.push([pa[0], pb[0]]); }
  pairs.sort((x, y) => x[0] - y[0]);
  // plus longue sous-suite croissante en j
  const tails = [], tailsI = [], prev = new Array(pairs.length);
  pairs.forEach(([, j], n) => {
    let lo = 0, hi = tails.length; while (lo < hi) { const md = (lo + hi) >> 1; tails[md] < j ? (lo = md + 1) : (hi = md); }
    tails[lo] = j; tailsI[lo] = n; prev[n] = lo ? tailsI[lo - 1] : null;
  });
  const chain = []; for (let n = tailsI.length ? tailsI[tailsI.length - 1] : null; n !== null && n !== undefined; n = prev[n]) chain.push(pairs[n]);
  chain.reverse();
  const match = new Array(A.length).fill(null);
  const lcs = (i0, i1, j0, j1) => { // plus longue sous-suite commune A[i0,i1) / B[j0,j1)
    const n = i1 - i0, m = j1 - j0;
    if (!n || !m || n * m > 6e6) return;
    const L = new Uint16Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i * (m + 1) + j] = A[i0 + i] === B[j0 + j] ? L[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(L[(i + 1) * (m + 1) + j], L[i * (m + 1) + j + 1]);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (A[i0 + i] === B[j0 + j]) { match[i0 + i] = j0 + j; i++; j++; }
      else if (L[(i + 1) * (m + 1) + j] >= L[i * (m + 1) + j + 1]) i++; else j++;
    }
  };
  let li = 0, lj = 0;
  for (const [i, j] of [...chain, [A.length, B.length]]) {
    if (i < li || j < lj) continue;
    lcs(li, i, lj, j);
    if (i < A.length) for (let t = 0; t < K; t++) match[i + t] = j + t;
    li = i + K; lj = j + K;
  }
  // temps par mot, trous interpolés selon la longueur des mots
  const t0 = new Array(A.length).fill(null), t1 = new Array(A.length).fill(null);
  match.forEach((j, i) => { if (j !== null) [t0[i], t1[i]] = Bt[j]; });
  for (let i = 0; i < A.length;) {
    if (t0[i] !== null) { i++; continue; }
    const s = i; while (i < A.length && t0[i] === null) i++;
    const start = s ? t1[s - 1] : 0, end = i < A.length ? t0[i] : off;
    const lens = []; for (let k = s; k < i; k++) lens.push(Math.max(1, A[k].length));
    const tot = lens.reduce((a, b) => a + b, 0); let acc = 0;
    for (let k = s; k < i; k++) { t0[k] = start + ((end - start) * acc) / tot; acc += lens[k - s]; t1[k] = start + ((end - start) * acc) / tot; }
  }
  const wt = new Array(text.length).fill(0), wordTok = new Array(text.length).fill(0);
  tokIdx.forEach((idxs, t) => idxs.forEach((k) => { wt[k] = Math.round(t0[t] * 100) / 100; wordTok[k] = t; }));
  for (let i = 1; i < wt.length; i++) if (wt[i] < wt[i - 1]) wt[i] = wt[i - 1]; // temps toujours croissants
  chapters.forEach((ch, c) => {
    const a = wordTok[ch.word], b = c + 1 < chapters.length ? wordTok[chapters[c + 1].word] : A.length;
    let real = 0, hit = 0; for (let k = a; k < b; k++) if (A[k]) { real++; if (match[k] !== null) hit++; }
    ch.coverage = Math.round((hit / Math.max(1, real)) * 1000) / 1000; ch.time = wt[ch.word];
  });
  let real = 0, hit = 0; A.forEach((x, k) => { if (x) { real++; if (match[k] !== null) hit++; } });
  return { book: { pages: pdf.pages, parts, duration: Math.round(off * 100) / 100, chapters, text, page: pdf.page, box: pdf.box, flags, t: wt }, coverage: hit / Math.max(1, real) };
}
