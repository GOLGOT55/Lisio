// Change le mot de passe d'un compte : node scripts/reset-password.mjs email@exemple.com nouveauMotDePasse
// (même format que le serveur : PBKDF2-SHA256, 100 000 tours, « sel:hash » en base64)
import { pbkdf2Sync, randomBytes } from "crypto";
import { execFileSync } from "child_process";
const [email, pass] = process.argv.slice(2);
if (!email || !/^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/.test(email) || !pass || pass.length < 6) {
  console.log("Usage : node scripts/reset-password.mjs email nouveauMotDePasse (6 caractères minimum)");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = `${salt.toString("base64")}:${pbkdf2Sync(pass, salt, 100000, 32, "sha256").toString("base64")}`;
const sql = `UPDATE users SET pass = '${hash}' WHERE email = '${email.toLowerCase()}'; DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = '${email.toLowerCase()}');`;
execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "lisio", "--local", "--persist-to", "data", "--command", sql], { stdio: "inherit" });
console.log("Mot de passe changé (si ce compte existe).");
