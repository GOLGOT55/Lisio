// Tunnel Cloudflare gratuit (sans compte) vers ce Lisio : ouvre Lisio sur le téléphone, même hors de chez toi.
// Lancé par start. L'adresse change à chaque lancement : on la donne à ce Lisio (Paramètres → Ouvrir sur ton téléphone)
// et au site en ligne relié s'il y en a un (LISIO_CLOUD, voir scripts/link.mjs).
import { readFileSync } from "fs";
import { spawn } from "child_process";

const vars = readFileSync(".dev.vars", "utf8");
const CLOUD = vars.match(/^LISIO_CLOUD=(\S+)/m)?.[1], KEY = vars.match(/^QUEUE_KEY=(\w+)/m)?.[1];
const PORT = process.env.LISIO_PORT || 8787;
if (!KEY) process.exit(0);

let url = null;
async function register() {
  if (!url) return;
  for (const site of [`http://127.0.0.1:${PORT}`, CLOUD].filter(Boolean)) {
    const r = await fetch(site + "/api/pc/url", { method: "POST", headers: { "content-type": "application/json", "x-queue-key": KEY }, body: JSON.stringify({ url }) }).catch(() => null);
    console.log(r?.ok ? `${site === CLOUD ? "Site en ligne relié" : "Lisio sur le téléphone"} : ${url}` : `${site} ne répond pas (${r?.status || "réseau"}), nouvel essai bientôt.`);
  }
}
function start() {
  url = null;
  const p = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
  const read = (d) => { const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m && !url) { url = m[0]; setTimeout(register, 5000); } };
  p.stdout.on("data", read); p.stderr.on("data", read);
  p.on("error", () => { console.log("cloudflared est introuvable : pas d'accès hors de chez toi (installe-le : winget install --id Cloudflare.cloudflared)."); process.exit(0); });
  p.on("exit", () => { console.log("Tunnel arrêté, redémarrage…"); setTimeout(start, 10000); });
}
start();
setInterval(register, 5 * 60000); // Lisio ou le site redémarrés gardent l'adresse à jour
