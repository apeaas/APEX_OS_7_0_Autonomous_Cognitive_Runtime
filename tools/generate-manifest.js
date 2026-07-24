"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "MANIFEST_SHA256.txt");
const excludedDirectories = new Set([".git", "node_modules", "backups"]);
const files = collect(root)
  .filter(relative => relative !== ".env" && relative !== "MANIFEST_SHA256.txt")
  .filter(relative => !relative.startsWith("data/") || relative === "data/README.md")
  .sort((left, right) => left.localeCompare(right, "en"));
const lines = [
  "APEX 7.1 - SHA-256 MANIFEST",
  `Generated: ${new Date().toISOString()}`,
  "Note: MANIFEST_SHA256.txt, .env, runtime data and backups are intentionally excluded.",
  "",
  ...files.map(relative => `${sha256(path.join(root, relative))}  ./${relative}`),
  "",
];
fs.writeFileSync(manifestPath, lines.join("\n"), "utf8");
console.log(`Manifest actualizado: ${files.length} archivos.`);

function collect(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replace(/\\/g, "/");
    if (entry.isDirectory()) output.push(...collect(absolute));
    else if (entry.isFile()) output.push(relative);
  }
  return output;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
