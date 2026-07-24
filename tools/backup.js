"use strict";
const fs=require("node:fs"); const path=require("node:path");
const root=path.resolve(__dirname,"..");
const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const dest=path.join(root,"backups",`APEX_BACKUP_${stamp}`);
fs.mkdirSync(dest,{recursive:true});
for(const rel of ["data","config"]){const src=path.join(root,rel); if(fs.existsSync(src)) fs.cpSync(src,path.join(dest,rel),{recursive:true});}
for(const rel of [".env","VERSION.txt"]){const src=path.join(root,rel); if(fs.existsSync(src)) fs.copyFileSync(src,path.join(dest,path.basename(rel)));}
fs.writeFileSync(path.join(dest,"BACKUP_INFO.json"),JSON.stringify({createdAt:new Date().toISOString(),source:root,version:"7.1.0",executionMode:"PAPER_ONLY"},null,2));
console.log(dest);
