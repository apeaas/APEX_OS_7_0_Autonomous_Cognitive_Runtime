"use strict";
const fs=require("node:fs"); const path=require("node:path");
const root=path.resolve(__dirname,".."); const sourceArg=process.argv[2];
if(!sourceArg){console.error('Uso: node tools/migrate-from-6-2.js "C:\\ruta\\APEX_OS_6_2"');process.exit(2);}
const source=path.resolve(sourceArg); const sourceData=path.join(source,"data");
if(!fs.existsSync(sourceData)){console.error("No se encontró la carpeta data en la versión fuente.");process.exit(2);}
const backup=path.join(root,"backups",`PRE_MIGRATION_${new Date().toISOString().replace(/[:.]/g,"-")}`); fs.mkdirSync(backup,{recursive:true});
const currentData=path.join(root,"data"); if(fs.existsSync(currentData)) fs.cpSync(currentData,path.join(backup,"data"),{recursive:true});
fs.mkdirSync(currentData,{recursive:true});
for(const name of ["apex-runtime-state.json","apex-runtime-events.ndjson","apex-client-events.ndjson"]){const src=path.join(sourceData,name); if(fs.existsSync(src)) fs.copyFileSync(src,path.join(currentData,name));}
console.log(`Migración backend completada. Respaldo previo: ${backup}`);
console.log("El localStorage del cockpit se conserva automáticamente usando 127.0.0.1:5500 en el mismo perfil de navegador.");
