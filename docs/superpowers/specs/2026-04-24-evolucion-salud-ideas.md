# Sub-project G — Ideas para potenciar "Evolución de salud"

**Date:** 2026-04-24
**Status:** Brainstorm / parked (user said the module is already good — ideas below for when he wants to revisit)
**Parent scope:** nao.fyi UX refresh

---

El timeline actual en `components/health-history-timeline.tsx` muestra cambios de signal (verde/amarillo/rojo) con timestamp. Funciona pero es pasivo. Ideas ordenadas por impacto/esfuerzo.

## 1. Mini-chart en la ficha del cliente (S)

En lugar del collapsible, mostrar un **strip chart** horizontal fijo debajo del badge de salud: una secuencia de cuadraditos (verde/amarillo/rojo) — uno por semana durante las últimas ~12 semanas. Lectura instantánea de si está mejorando o empeorando. Click → abre el timeline completo.

**Por qué:** la tendencia es más importante que los eventos individuales. Esto es un patrón conocido (sparkline GitHub-style) y ahorra scroll.

## 2. Razón del cambio visible (S)

El `healthJustification` ya existe pero solo se muestra en el resumen de situación. En el timeline, cada entrada puede mostrar:
- Ícono de semáforo
- Fecha
- Justificación de 1-2 líneas ("Cambió a amarillo porque la última reunión mencionó que están evaluando otras agencias")

Requiere guardar `healthJustification` también en `account_health_history` (hoy se pierde — solo queda en la `accounts` hasta que cambie). Migración chica.

## 3. Auto-detección de patrones preocupantes (M)

Nueva Trigger task diaria que corre sobre cada cuenta y emite `signals` cuando detecta:
- Cuenta en amarillo/rojo durante >30 días sin cambio → "Riesgo de churn prolongado"
- Oscilación >3 veces entre verde y amarillo en 90 días → "Inestabilidad"
- Descenso sostenido: verde → amarillo → rojo sin recuperación → "Deterioro progresivo"

Estas señales ya tienen infraestructura (`signals` table + panel) — solo hace falta el detector.

## 4. Correlación con métricas externas (L)

Overlay en el timeline que muestra:
- Línea superpuesta del spend mensual de Meta Ads
- Línea del count de deals ganados/perdidos de Pipedrive
- Barra de volumen de reuniones por mes

Permite leer visualmente "la salud bajó cuando el spend se cortó a la mitad y se perdieron 2 deals." Requiere un componente nuevo de chart (recharts o similar) y consultas para agregar métricas. Alto valor visual pero L de esfuerzo.

## 5. Momentum score numérico (M)

Transformar los cambios de signal en un score 0-100 usando una ventana móvil: pesos por signal (verde=3, amarillo=2, rojo=1), promedio de 90 días. Mostrar el delta vs hace 30 días ("+15 este mes" en verde, "-8" en rojo).

Más abstracto que el strip chart pero útil para comparar cuentas entre sí en el portfolio (ordenar por momentum).

## 6. Predicción tipo "weather forecast" (L)

Feed los últimos 6 meses de historial + transcripts recientes a Haiku/Sonnet y pedir:
- Predicción para los próximos 30 días (mismo / mejorando / empeorando) con razón
- Un "riesgo principal a vigilar"
- Una "oportunidad a aprovechar"

Actualización semanal. Puede sonar a gimmick pero para cuentas en riesgo da contexto accionable sin que el equipo lea todo.

## Recomendación

Si tuviera que elegir una: **#1 (strip chart fijo)** — alto impacto visual, muy bajo esfuerzo. Cambia la percepción del módulo de "historial aburrido" a "radar de estado". Se puede hacer en 1 hora.

**#2 (razón del cambio en timeline)** es el segundo más alto ROI — convierte un registro en inteligencia contextual.

**#3 (auto-detección de patrones)** es valioso pero requiere calibrar umbrales con data real.

Las otras tres las archivaría hasta que el producto tenga más tráfico real.
