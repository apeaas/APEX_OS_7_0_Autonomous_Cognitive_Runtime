"use strict";

function withMarketMarks(projection, prices = {}) {
  const copy = JSON.parse(JSON.stringify(projection));
  copy.positions = copy.positions.map(position => {
    const markPrice = Number(prices[position.symbol]);
    const trustedMark = Number.isFinite(markPrice) && markPrice > 0;
    const effectiveMark = trustedMark ? markPrice : Number(position.entry);
    const unrealizedPnL = ((effectiveMark - Number(position.entry)) / Number(position.entry)) * Number(position.capital);
    return { ...position, markPrice: effectiveMark, unrealizedPnL, markTrusted: trustedMark };
  });
  copy.unrealizedPnL = copy.positions.reduce((sum, position) => sum + position.unrealizedPnL, 0);
  const deployed = copy.positions.reduce((sum, position) => sum + Number(position.capital), 0);
  copy.equity = Number(copy.cash) + deployed + copy.unrealizedPnL;
  copy.highWaterMark = Math.max(Number(copy.highWaterMark), copy.equity);
  copy.drawdown = copy.highWaterMark > 0 ? (copy.highWaterMark - copy.equity) / copy.highWaterMark : 0;
  return copy;
}

module.exports = { withMarketMarks };
