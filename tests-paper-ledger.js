"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { LedgerCommandError, PaperLedgerCommands } = require("./lib/paper-ledger/commands");
const { EventStore, LedgerIntegrityError } = require("./lib/paper-ledger/event-store");
const { project } = require("./lib/paper-ledger/projector");
const { SnapshotStore } = require("./lib/paper-ledger/snapshots");
const { validateLegacyPortfolio } = require("./lib/portfolio/validators");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "apex-ledger-"));

try {
  const ledgerPath = path.join(root, "paper.ndjson");
  const snapshotPath = path.join(root, "snapshot.json");
  const store = new EventStore({ filePath: ledgerPath });
  const snapshots = new SnapshotStore({ filePath: snapshotPath });
  const commands = new PaperLedgerCommands({ store, snapshots });
  commands.initialize(10_000);
  assert.equal(commands.projection.cash, 10_000);
  assert.equal(commands.projection.version, 1);

  const baseContext = key => ({
    idempotencyKey: key,
    sessionId: "SESSION-1",
    actor: { type: "human_operator", id: "TEST" },
    policyVersion: "test.v1",
  });
  const open = {
    type: "open_position",
    positionId: "POS-1",
    symbol: "BTCUSDT",
    capital: 1_000,
    entry: 100,
    stop: 95,
    target: 115,
    expectedVersion: 1,
  };
  const opened = commands.execute(open, baseContext("open-0001"));
  assert.equal(opened.projection.cash, 9_000);
  assert.equal(opened.projection.positions.length, 1);
  assert.equal(opened.projection.version, 3);
  const countAfterOpen = store.all().length;
  const duplicateOpen = commands.execute(open, baseContext("open-0001"));
  assert.equal(duplicateOpen.duplicate, true);
  assert.equal(store.all().length, countAfterOpen);
  assert.throws(
    () => commands.execute({ ...open, positionId: "POS-2", symbol: "ETHUSDT" }, baseContext("open-0002")),
    error => error instanceof LedgerCommandError && error.code === "PORTFOLIO_VERSION_CONFLICT",
  );

  const modified = commands.execute({
    type: "modify_position",
    positionId: "POS-1",
    stop: 97,
    target: 118,
    expectedVersion: 3,
  }, baseContext("modify-0001"));
  assert.equal(modified.projection.positions[0].stop, 97);

  const closed = commands.execute({
    type: "close_position",
    positionId: "POS-1",
    fraction: 1,
    exit: 110,
    expectedVersion: 4,
  }, baseContext("close-0001"));
  assert.equal(closed.projection.positions.length, 0);
  assert.equal(closed.projection.realizedPnL, 100);
  assert.equal(closed.projection.cash, 10_100);
  const cashAfterClose = closed.projection.cash;
  const duplicateClose = commands.execute({ type: "close_position", positionId: "POS-1", exit: 110 }, baseContext("close-0001"));
  assert.equal(duplicateClose.duplicate, true);
  assert.equal(duplicateClose.projection.cash, cashAfterClose);
  assert.throws(
    () => commands.execute({ type: "close_position", positionId: "POS-1", exit: 110 }, baseContext("close-0002")),
    error => error.code === "POSITION_NOT_FOUND",
  );

  const beforeRestart = project(store.all());
  const restoredStore = new EventStore({ filePath: ledgerPath });
  const afterRestart = project(restoredStore.all());
  assert.deepEqual(afterRestart, beforeRestart);
  assert.equal(restoredStore.all().length, store.all().length);

  fs.writeFileSync(snapshotPath, "{\"projection\":\"corrupt\",\"checksum\":\"wrong\"}", "utf8");
  assert.equal(snapshots.load(), null);
  assert.deepEqual(project(restoredStore.all()), beforeRestart);

  fs.appendFileSync(ledgerPath, "{\"id\":\"truncated", "utf8");
  const recoveredStore = new EventStore({ filePath: ledgerPath });
  assert.equal(recoveredStore.all().length, store.all().length);
  assert.equal(recoveredStore.recovery.code, "TRUNCATED_TAIL_RECOVERED");

  const migrationRoot = path.join(root, "migration");
  const migrationStore = new EventStore({ filePath: path.join(migrationRoot, "paper.ndjson") });
  const migrationCommands = new PaperLedgerCommands({ store: migrationStore });
  migrationCommands.initialize(25_000);
  const legacy = {
    equity: 25_000,
    cash: 24_000,
    realized: 0,
    positions: [{ id: "LEG-1", symbol: "ETHUSDT", capital: 1_000, entry: 100, stop: 95, target: 112, openedAt: 1 }],
    closedTrades: [],
  };
  assert.equal(validateLegacyPortfolio({ ...legacy, cash: Number.NaN }).code, "INVALID_LEGACY_NUMBERS");
  assert.equal(validateLegacyPortfolio({ ...legacy, positions: [legacy.positions[0], legacy.positions[0]] }).code, "DUPLICATE_POSITION");
  assert.equal(validateLegacyPortfolio({ ...legacy, positions: [{ ...legacy.positions[0], stop: 101 }] }).code, "IMPOSSIBLE_POSITION");
  const imported = migrationCommands.execute({
    type: "import_legacy_portfolio",
    portfolio: legacy,
    expectedVersion: 1,
  }, baseContext("import-0001"));
  assert.equal(imported.projection.legacyImported, true);
  assert.equal(imported.projection.positions[0].id, "LEG-1");
  const importCount = migrationStore.all().length;
  const repeatedImport = migrationCommands.execute({
    type: "import_legacy_portfolio",
    portfolio: legacy,
  }, baseContext("import-0002"));
  assert.equal(repeatedImport.duplicate, true);
  assert.equal(migrationStore.all().length, importCount);
  assert.throws(
    () => migrationCommands.execute({
      type: "import_legacy_portfolio",
      portfolio: { ...legacy, cash: 23_000 },
    }, baseContext("import-0003")),
    error => error.code === "LEGACY_FINGERPRINT_CONFLICT",
  );
  assert.throws(
    () => {
      const partialStore = new EventStore({ filePath: path.join(root, "partial.ndjson") });
      const partialCommands = new PaperLedgerCommands({ store: partialStore });
      partialCommands.initialize(1_000);
      partialCommands.execute({ type: "import_legacy_portfolio", portfolio: { cash: 1_000 } }, baseContext("import-partial"));
    },
    error => error.code === "PARTIAL_LEGACY_IMPORT",
  );

  const tamperPath = path.join(root, "tamper.ndjson");
  fs.copyFileSync(ledgerPath, tamperPath);
  const tampered = fs.readFileSync(tamperPath, "utf8").replace("\"capital\":1000", "\"capital\":1001");
  fs.writeFileSync(tamperPath, tampered, "utf8");
  assert.throws(() => new EventStore({ filePath: tamperPath }), error => error instanceof LedgerIntegrityError);

  console.log("APEX 7.1 PAPER ledger tests: OK · 32 assertions");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
