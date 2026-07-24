# APEX OS 7.0 — Master Synopsis

## Qué es

APEX es un **Sistema Operativo Patrimonial Cognitivo** orientado a investigación, decisión, gobierno y ejecución PAPER. Su núcleo no es un indicador ni un chatbot: es un runtime que combina percepción de mercado, casos explicables, memoria persistente, agentes especializados, reglas constitucionales y capacidad operativa limitada.

## Cómo estamos

### Diseño

El Living Cockpit de Genesis permanece como frente operativo. APEX 7 agrega una **Autonomy Command Rail** y un workspace **Runtime** para ver modo, presupuesto, cola, planes, permisos, telemetría, configuración, integraciones y kill switch sin transformar Mission Control en una página de administración.

### Inteligencia

La IA dejó de estar confinada al chat. El backend entrega contexto del cockpit, Event Bus, memoria, portfolio, posiciones, agentes y Governance. A través de herramientas estructuradas puede navegar, investigar, construir casos, crear planes, preparar acciones y administrar la plataforma.

### Autonomía

El runtime posee cuatro estados: Observe, Copilot, Paper Autonomous y Suspended. En autonomía PAPER puede evaluar el estado, seleccionar como máximo una acción por ciclo, someterla a política determinística y enviarla a una cola auditada. El navegador ejecuta la acción contra el ledger PAPER y devuelve el resultado al backend.

### Gobierno

El techo humano es 5%. La IA puede reducir su autoridad o ser suspendida; no puede ampliar ese techo. Risk y Governance conservan veto. Stop y target son obligatorios, se prohíbe aumentar riesgo inicial y existe un kill switch que cancela acciones pendientes y detiene nuevos ciclos.

### Memoria

APEX mantiene dos capas complementarias:

1. Memoria del cockpit y Event Bus en localStorage.
2. Estado, planes, queue y auditoría append-only en archivos JSON/NDJSON del backend local.

Esto permite restaurar contexto, inspeccionar decisiones, exportar el runtime y construir track record más adelante.

### Voz

El sistema conserva push-to-talk y síntesis del navegador. Además incorpora un puente opcional WebRTC Realtime para diálogo natural. La voz no evita permisos: cualquier acción operativa atraviesa el mismo Command Runtime.

### Integraciones

Se incorporó un Integration Registry y un contrato de adapters. Binance público y OpenAI son las únicas conexiones activas/configurables. MT5, IBKR y Phantom figuran como puertos diferidos y bloqueados, listos para una etapa posterior sin contaminar el núcleo.

## Qué puede hacer hoy

- observar mercado y portfolio;
- responder con contexto de toda la plataforma;
- navegar y abrir evidencia;
- construir casos;
- consultar memoria;
- crear y administrar planes;
- preparar operaciones PAPER;
- abrir, cerrar y modificar posiciones PAPER bajo reglas;
- gestionar watchlist y agentes locales;
- ejecutar autoauditorías;
- correr ciclos cognitivos;
- exportar memoria y runtime;
- suspender toda actividad mediante kill switch.

## Qué no hace

- no mueve dinero real;
- no conecta brokers ni wallets;
- no firma transacciones;
- no retira fondos;
- no eleva el límite autónomo;
- no reemplaza validación estadística ni auditoría de seguridad.

## La tesis del producto

> Radical en la búsqueda. Frío en la validación. Implacable protegiendo capital.

APEX 7 representa el paso desde una plataforma con IA hacia una plataforma **gobernada por IA**, todavía dentro de un laboratorio PAPER cerrado.
