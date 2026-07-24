# Migración 6.1 → 6.2

## Qué se conserva

- Living Cockpit / Genesis Design System.
- Binance REST/WebSocket.
- indicadores;
- Case Engine, Fiscal e Historiador;
- Governance;
- Event Bus y Persistent Memory;
- portfolio y ejecución paper;
- techo humano del 5%;
- almacenamiento local del navegador.

## Qué cambia

APEX debe abrirse mediante el backend local incluido. Abrir `index.html` directamente mantiene el fallback básico, pero la IA real no puede funcionar porque la clave no debe estar en el navegador.

## Instalación limpia

No mezclar archivos con 6.1. Descomprimir 6.2 en una carpeta nueva, crear `.env` y ejecutar el launcher.

Para conservar el mismo `localStorage`, usar el mismo host y puerto (`127.0.0.1:5500`) de aquí en adelante.
