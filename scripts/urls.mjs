// Affiche les adresses où ouvrir Lisio (ce PC et le réseau Wi-Fi local).
import os from "os";
const port = process.argv[2] || 8787;
const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
console.log(`\n  Lisio sur ce PC        : http://localhost:${port}`);
for (const ip of lan) console.log(`  Lisio sur le Wi-Fi     : http://${ip}:${port}`);
console.log("\n  Hors de chez toi : lance start-tunnel (voir README).\n");
