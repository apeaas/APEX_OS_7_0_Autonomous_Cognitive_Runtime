"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sha256, stableStringify } = require("./contracts");

class SnapshotStore {
  constructor(options) {
    this.filePath = options.filePath;
    this.fs = options.fs || fs;
    this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  save(projection) {
    const payload = {
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      lastEventApplied: projection.lastEventApplied,
      lastEventChecksum: projection.lastEventChecksum,
      projection,
    };
    payload.checksum = sha256(stableStringify(payload));
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    this.fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), "utf8");
    this.fs.renameSync(temporary, this.filePath);
    return payload;
  }

  load() {
    try {
      const payload = JSON.parse(this.fs.readFileSync(this.filePath, "utf8"));
      const expected = payload.checksum;
      delete payload.checksum;
      if (sha256(stableStringify(payload)) !== expected) return null;
      return payload;
    } catch {
      return null;
    }
  }
}

module.exports = { SnapshotStore };
