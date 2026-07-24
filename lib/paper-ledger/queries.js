"use strict";

const { migrationStatus } = require("./migration");
const { project } = require("./projector");
const { withMarketMarks } = require("../portfolio/projection");

class PaperLedgerQueries {
  constructor(options) {
    this.store = options.store;
  }

  portfolio(prices = {}) {
    return withMarketMarks(project(this.store.all()), prices);
  }

  events(limit = 100) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    return this.store.all().slice(-safeLimit).reverse();
  }

  migration() {
    return migrationStatus(this.store.all());
  }

  integrity() {
    const last = this.store.last();
    return {
      ok: true,
      eventCount: this.store.all().length,
      lastEventId: last?.id || null,
      lastChecksum: last?.integrity?.checksum || null,
      recovery: this.store.recovery,
    };
  }
}

module.exports = { PaperLedgerQueries };
