# APEX Governance Architecture

## Flujo principal
Universe -> Hunter -> Quant Filters -> Context -> Strategy -> Risk -> Portfolio -> Decision Core -> Execution -> Ledger -> Governance -> Learning.

## Agentes
### Hunter Agent
Escanea movimientos rápidos, oportunidades de días o semanas, activos infravalorados, eventos, noticias y anomalías. Su salida es una lista priorizada de candidatos, nunca una orden.

### Context Agent
Interpreta régimen de mercado, macro, noticias, calendario, sentimiento y condiciones excepcionales. Puede objetar o bloquear una tesis cuyo contexto invalide la señal cuantitativa.

### Strategy Agent
Convierte una oportunidad en plan: entrada, invalidación, target, horizonte, tamaño sugerido y condiciones de cancelación.

### Risk Agent
Evalúa pérdida potencial, volatilidad, liquidez, slippage, apalancamiento y riesgo de cola. Posee veto duro.

### Portfolio Agent
Evalúa concentración, correlación, exposición neta, exposición por clase de activo y compatibilidad con posiciones existentes.

### Execution Agent
Traduce decisiones aprobadas a órdenes del conector correspondiente. No interpreta oportunidades ni altera el plan sin una nueva decisión.

### Governance Engine
Audita a todos los agentes y a APEX como sistema. Administra Trust Score, licencia, suspensión, degradación y modo seguro.

## Dos salidas del Hunter
1. Alert Stream: oportunidades filtradas para revisión humana.
2. Autonomous Queue: candidatos elegibles para decisión automática dentro del 5%.

## Estados de licencia
- Observación: research y alertas.
- Propuesta: prepara tickets, requiere aprobación.
- Paper autónomo: ejecuta en simulación.
- Live restringido: futuro; capital segregado y límites estrictos.
- Suspendido: investigación activa, ejecución bloqueada.

## Trust Score
El Trust Score no mide rentabilidad aislada. Combina:
- calidad del proceso;
- disciplina de riesgo;
- estabilidad entre regímenes;
- drawdown;
- consistencia;
- integridad de datos;
- calidad de ejecución;
- calibración de confianza;
- frecuencia de excepciones;
- cumplimiento constitucional.

## Regla de autoridad
Una estrategia nueva comienza en investigación. Solo progresa tras evidencia reproducible. Ninguna mejora de licencia puede superar el techo humano de 5%.
