// Tunnel Cloudflare gratuit (sans compte) vers ce Lisio, et adresse donnée au site en ligne relié (LISIO_CLOUD).
// Lancé par start quand ce PC est relié (scripts/link.mjs). L'adresse change à chaque lancement : on la renvoie au site.
import { readFileSync } from "fs";
import { spawn } from "child_process";

const vars = readFileSync(".dev.vars", "utf8");
const CLOUD = vars.match(/^LISIO_CLOUD=(\S+)/m)?.[1], KEY = vars.match(/^QUEUE_KEY=(\w+)/m)?.[1];
const PORT = process.env.LISIO_PORT || 8787;
if (!CLOUD || !KEY) process.exit(0);

let url = null;
async function register() {
  if (!url) return;
  const r = await fetch(CLOUD + "/api/pc/url", { method: "POST", headers: { "content-type": "application/json", "x-queue-key": KEY }, body: JSON.stringify({ url }) }).catch(() => null);
  console.log(r?.ok ? `Site en ligne relié : ${CLOUD} → ${url}` : `Le site en ligne ne répond pas (${r?.status || "réseau"}), nouvel essai bientôt.`);
}
function start() {
  url = null;
  const p = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
  const read = (d) => { const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m && !url) { url = m[0]; setTimeout(register, 5000); } };
  p.stdout.on("data", read); p.stderr.on("data", read);
  p.on("error", () => { console.log("cloudflared est introuvable : installe-le (winget install --id Cloudflare.cloudflared)."); process.exit(1); });
  p.on("exit", () => { console.log("Tunnel arrêté, redémarrage…"); setTimeout(start, 10000); });
}
start();
setInterval(register, 5 * 60000); // le site garde l'adresse à jour même s'il a été redéployé
