"use strict";
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const root = path.resolve(__dirname, "..");
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); }
function ok(label, detail="") { console.log(`✔ ${label}${detail ? ` — ${detail}` : ""}`); }
function warn(label, detail="") { console.log(`⚠ ${label}${detail ? ` — ${detail}` : ""}`); }
function fail(label, detail="") { console.error(`✖ ${label}${detail ? ` — ${detail}` : ""}`); process.exitCode=1; }
(async()=>{
  console.log("\nAPEX OS 7.0 · DIAGNÓSTICO LOCAL\n");
  const major=Number(process.versions.node.split(".")[0]);
  major>=18 ? ok("Node.js", process.version) : fail("Node.js", `se requiere 18+, detectado ${process.version}`);
  for(const rel of ["server.js","index.html","assets/js/apex-7-runtime.js","config/apex_autonomy.json","config/apex_permissions.json","config/apex_integrations.json"]){
    fs.existsSync(path.join(root,rel)) ? ok(rel) : fail(rel,"archivo faltante");
  }
  try {
    const auto=readJson("config/apex_autonomy.json");
    auto.executionMode==="PAPER_ONLY" ? ok("Execution lock","PAPER_ONLY") : fail("Execution lock","no es PAPER_ONLY");
    Number(auto.humanAutonomyCeilingPct)===5 ? ok("Techo humano","5%") : fail("Techo humano",String(auto.humanAutonomyCeilingPct));
    auto.hardLocks?.liveTrading===false ? ok("Live trading","bloqueado") : fail("Live trading","lock inválido");
    auto.hardLocks?.externalAccounts===false ? ok("Cuentas externas","bloqueadas") : fail("Cuentas externas","lock inválido");
  } catch(e){ fail("Configuración de autonomía",e.message); }
  const envPath=path.join(root,".env");
  if(!fs.existsSync(envPath)) warn(".env","no existe; el launcher lo creará");
  else {
    const text=fs.readFileSync(envPath,"utf8");
    /OPENAI_API_KEY=\s*[^\s#]+/.test(text) ? ok("IA online","clave configurada") : warn("IA online","sin OPENAI_API_KEY; APEX arrancará en modo local");
  }
  try {
    fs.mkdirSync(path.join(root,"data"),{recursive:true});
    const probe=path.join(root,"data",".write-test"); fs.writeFileSync(probe,"ok"); fs.unlinkSync(probe); ok("Data store","escribible");
  } catch(e){ fail("Data store",e.message); }
  const port=5500;
  await new Promise(resolve=>{
    const s=net.createServer();
    s.once("error",e=>{ e.code==="EADDRINUSE" ? warn(`Puerto ${port}`,"ocupado; cerrá otro APEX/Live Server") : fail(`Puerto ${port}`,e.message); resolve(); });
    s.once("listening",()=>s.close(()=>{ok(`Puerto ${port}`,"disponible");resolve();}));
    s.listen(port,"127.0.0.1");
  });
  console.log(process.exitCode ? "\nDiagnóstico con errores.\n" : "\nDiagnóstico completo: base lista.\n");
})();
