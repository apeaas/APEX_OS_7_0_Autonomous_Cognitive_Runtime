# APEX Delivery Roadmap

## Entrega actual - 1.3 Governance Foundation
- Mission Control 1.2 preservado.
- Nueva superficie de Gobierno.
- Licencia visible de 5%.
- Autoauditoría simulada.
- Trust Score visible.
- Constitución integrada.
- Matriz de agentes.
- Diario de conciencia exportable.
- Configuración de gobierno en JSON.

## Próximo bloque - 1.4 Core Event Bus
Objetivo: dejar de conectar componentes por efectos visuales y crear eventos formales.

Eventos iniciales:
- market.snapshot.received
- opportunity.detected
- context.assessed
- strategy.proposed
- risk.vetoed
- portfolio.vetoed
- decision.approved
- execution.requested
- execution.completed
- governance.audit.completed
- autonomy.changed

## 1.5 Hunter Research Engine
- universo configurable;
- ranking multi-horizonte;
- alertas por prioridad;
- cola autónoma separada;
- razones de inclusión y descarte.

## 1.6 Governance Metrics
- Trust Score determinista;
- auditoría por estrategia;
- drawdown y degradación automática;
- calibración de confianza;
- alertas constitucionales.

## 1.7 Connector Abstraction
- MetaTrader 5 para mercados compatibles;
- Interactive Brokers como candidato multiactivo;
- Phantom como bóveda/firma, no cerebro;
- conectores desacoplados del APEX Core;
- paper ledger común.

## 1.8 Strategy Lifecycle
Research -> Backtest -> Walk-forward -> Paper -> Shadow live -> Capital restringido -> Autonomía revisable.

## Definition of Done para live
- trazabilidad completa;
- kill switch;
- reconciliación broker-ledger;
- límites duros externos al modelo;
- historial suficiente en paper y shadow;
- simulación de fallos;
- autorización humana explícita.
