// Relie ce PC à un site Lisio en ligne (ex. déployé sur Cloudflare sans stockage) :
//   node scripts/link.mjs https://mon-lisio.workers.dev CODE
// CODE : affiché dans le site en ligne, Paramètres → « Relier mon PC » (valable 15 min).
// Ensuite, les livres ajoutés sur le site en ligne sont envoyés à ce PC, qui les transcrit et les garde (dossier data/).
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";

const [cloud, code] = process.argv.slice(2);
if (!/^https?:\/\/[a-z0-9.:-]+\/?$/i.test(cloud || "") || !/^[A-Z0-9]{8}$/i.test(code || "")) {
  console.log("Usage : node scripts/link.mjs https://adresse-du-site CODE   (code : Paramètres → Relier mon PC)");
  process.exit(1);
}
execFileSync(process.execPath, ["scripts/queue.mjs", "init"]); // crée la clé de ce PC si besoin
const vars = readFileSync(".dev.vars", "utf8"), key = vars.match(/^QUEUE_KEY=(\w+)/m)[1], url = cloud.replace(/\/$/, "");
const r = await fetch(url + "/api/pc/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, key }) }).catch(() => null);
if (!r?.ok) { console.log("Échec :", r ? (await r.json().catch(() => ({}))).error || r.status : "site injoignable"); process.exit(1); }
writeFileSync(".dev.vars", vars.replace(/^LISIO_CLOUD=.*\n?/m, "") + `LISIO_CLOUD=${url}\n`);
console.log(`PC relié à ${url}. Redémarre Lisio (ferme ses fenêtres puis relance start) : le tunnel démarrera tout seul.`);
