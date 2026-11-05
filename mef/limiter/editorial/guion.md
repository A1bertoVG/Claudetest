# MEF Estudio · Video 2D #2 "Compresor → Limiter: el techo de cristal" (≈59 s, 9:16) — GUION PARA APROBACIÓN

**Público:** productores de techno · **Objetivo:** que guarden el video y sigan a @mef.estudios (mezcla y máster)
**Estrategia:** gancho visual desde el cuadro 1 → bucle abierto ("el error más común → al final") → recorrido de la onda: threshold → ratio → limiter → error → marca al ~77 % → CTA y cierre MEF (igual que el video del compresor).
**Estética:** la misma 2D editorial del video anterior (grafito cálido, marfil, arcilla #D97757, serif Fraunces, grano de papel) + **cielo** para el compresor y **hielo/cristal** para el limiter.
**La onda:** barras tipo DAW que avanzan a 130 BPM, con su reflejo abajo. Los kicks y claps son los picos.

| Tiempo | Bloque | Voz en off (ya grabada) | Visual 2D | Texto en pantalla |
|---|---|---|---|---|
| 0–4.9 s | **GANCHO** | "Esta onda nunca va a romper este cristal. Y justo por eso, tu máster suena fuerte." | La cámara baja desde muy cerca del cristal: cada kick choca contra el techo, salen destellos y aparecen grietas finas, pero el cristal aguanta. | **El techo de *cristal*** |
| 4.9–11.4 s | **Bucle abierto** | "Sigue el viaje de tu track: primero el compresor, luego el limiter. Y al final, el error más común en másters de techno." | Diagrama vertical: ENTRADA → COMPRESOR → LIMITER → SALIDA. Cada etapa se enciende cuando se nombra y un punto arcilla recorre la ruta. | Píldora fija **El error más común → al final** con barra de progreso |
| 11.4–14.8 s | Entrada | "Tu track entra así: picos que saltan por todos lados." | La onda cruda: picos altos y desordenados que rozan la línea de 0 dBFS en arcilla. | ***Entrada*: picos sin control** |
| 14.8–20.7 s | **Threshold** | "El threshold es esta línea. Lo que queda abajo, pasa intacto. Lo que la cruza, el compresor lo trabaja." | Una **línea cian punteada** baja y corta la onda. Lo de abajo sigue marfil ("abajo: pasa intacto") y lo que la cruza se pinta cian ("arriba: se comprime"). | ***Threshold*: esta línea** |
| 20.7–26.0 s | **Ratio** | "El ratio dice cuánto. Con cuatro a uno, si un pico se pasa cuatro decibeles, solo sale uno." | Arriba, 4 bloques de 1 dB sobre el threshold (+4 dB) viajan y se funden en uno solo (+1 dB). Abajo, la gráfica entrada/salida: la recta 1:1 se dobla en el threshold y sigue a 4:1. | ***Ratio*: cuánto se comprime** · +4 dB → +1 dB |
| 26.0–31.2 s | **Limiter = techo de cristal** | "Después viene el limiter: un techo de cristal. Ratio infinito. Ningún pico lo atraviesa." | Un panel de cristal baja hasta −1 dBTP. Los picos ya comprimidos chocan, salen destellos y se quedan justo debajo, sin pasar. | **El *limiter*: techo de cristal** · RATIO ∞:1 |
| 31.2–36.1 s | **Revelación** | "Por eso puedes subir todo sin clipear: el compresor controla, el limiter protege." | Toda la onda sube hasta rozar el cristal y se ve más densa. Medidores ANTES/DESPUÉS de volumen percibido. | **Compresor *controla* · Limiter *protege*** |
| 36.1–42.6 s | **El error (lo prometido)** | "El error: dejarle todo el trabajo al limiter. Si lo aprietas de más, el cristal se empaña, y tu kick pierde el golpe." | Sube la ganancia de golpe y la onda se vuelve un bloque plano pegado al cristal. El cristal se empaña y se agrieta, el medidor de reducción llega al rojo y aparece la etiqueta "KICK SIN GOLPE". | **El *error*: todo al limiter** |
| 42.6–45.7 s | **El consejo** | "Que trabaje de uno a tres decibeles, máximo." | El vaho se limpia, la onda recupera sus picos y el medidor de reducción se queda bajo. | **Limiter: *1–3 dB* de reducción, máximo** |
| 45.7–52.5 s | **Marca (orgánica)** | "Encontrar ese equilibrio es lo que hacemos en MEF Estudio: mezcla y máster, para que tu track pegue fuerte, sin perder el golpe." | La cámara entra al estudio 2D del video anterior: consola, monitores que laten y la onda sana en pantalla. Se enciende el letrero **MEF ESTUDIO · mezcla · máster**. | (letrero MEF) |
| 52.5–59.4 s | **CTA + cierre** | "Guarda este video para tu próxima sesión, y síguenos para más trucos de mezcla." | El ícono de guardar se llena con el kick, se pulsa el botón "Seguir" y cierra con la placa MEF ESTUDIO y @mef.estudios. | **Guárdalo** · @mef.estudios |

## Notas de producción
- 1080×1920, 30 fps, en Python (PIL + numpy) con render en ffmpeg, como el video del compresor.
- Voz: la grabación masculina que ya existe para esta idea (`mef/limiter/audio/voz.wav`), así que no hay que regrabar. Si cambias alguna línea, hay que generar la voz otra vez.
- Audio demostrativo: el loop de techno pasa de verdad por un compresor y un limiter. En el error se escucha sobrelimitado y en el consejo vuelve el golpe.
- La marca no aparece (ni logo ni nombre) antes del segundo 45.7 (77 %).
