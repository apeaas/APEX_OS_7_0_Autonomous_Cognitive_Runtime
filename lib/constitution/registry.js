"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sha256, stableStringify } = require("../paper-ledger/contracts");
const { validateConstitution } = require("./schema");

class ConstitutionIntegrityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ConstitutionIntegrityError";
    this.code = code;
  }
}

class ConstitutionRegistry {
  constructor(options) {
    this.configPath = options.configPath;
    this.statePath = options.statePath;
    this.fs = options.fs || fs;
    this.fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    this.document = this.loadCandidate();
    this.record = this.loadOrRegister(this.document);
  }

  active() {
    return JSON.parse(JSON.stringify(this.document));
  }

  metadata() {
    return { ...this.record };
  }

  loadCandidate() {
    let document;
    try {
      document = JSON.parse(this.fs.readFileSync(this.configPath, "utf8"));
    } catch {
      throw new ConstitutionIntegrityError("CONSTITUTION_UNREADABLE", "No se pudo leer la Constitución.");
    }
    const validation = validateConstitution(document);
    if (!validation.ok) throw new ConstitutionIntegrityError(validation.code, validation.message);
    const computedHash = contentHash(document);
    if (document.contentHash !== computedHash) {
      throw new ConstitutionIntegrityError("CONSTITUTION_HASH_MISMATCH", "El contentHash constitucional no coincide.");
    }
    return document;
  }

  loadOrRegister(document) {
    const existing = readJson(this.fs, this.statePath);
    const candidate = {
      constitutionId: document.constitutionId,
      version: document.version,
      contentHash: document.contentHash,
      activatedAt: document.effectiveAt,
      activationAuthority: "HUMAN_RELEASE_APEX_7_1",
    };
    if (!existing) {
      atomicWrite(this.fs, this.statePath, candidate);
      return candidate;
    }
    if (
      existing.constitutionId !== candidate.constitutionId
      || existing.version !== candidate.version
      || existing.contentHash !== candidate.contentHash
    ) {
      throw new ConstitutionIntegrityError(
        "SILENT_CONSTITUTION_CHANGE_BLOCKED",
        "El archivo constitucional difiere del registro activo. Se requiere nueva versión y aprobación humana.",
      );
    }
    return existing;
  }
}

function contentHash(document) {
  const content = { ...document };
  delete content.contentHash;
  return sha256(stableStringify(content));
}

function readJson(fsImpl, filePath) {
  try { return JSON.parse(fsImpl.readFileSync(filePath, "utf8")); } catch { return null; }
}

function atomicWrite(fsImpl, filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fsImpl.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fsImpl.renameSync(temporary, filePath);
}

module.exports = { ConstitutionIntegrityError, ConstitutionRegistry, contentHash };
