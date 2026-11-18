# MEF Estudio · Video 2D #6 "El clipper" (≈68 s, 9:16) — GUION PARA APROBACIÓN

**Público:** productores de techno · **Enfoque:** mezcla y máster
**Objetivo:** que guarden el video, sigan a @mef.estudios y nos escriban
**Estructura:** Hook → Introducción (qué se llevan) → Cuerpo 1 (qué es) → Cuerpo 2 (por qué te da volumen) → Bucle abierto → Cuerpo 3 (dónde sí y dónde no) → Bucle abierto → **El ajuste secreto (oversampling)** → Conclusión MEF → CTA (el de siempre).
**Estética:** la misma 2D editorial de los videos #1–#5 (grafito cálido, marfil, arcilla #D97757, cielo, serif Fraunces, grano de papel).
**Elemento visual central:** la onda en barras con una **cuchilla horizontal** (línea arcilla) que recorta solo las puntas de los picos al instante, con pequeñas chispas. Se contrasta con el limiter, que en vez de cortar baja todo el volumen poco a poco.

| Tiempo aprox. | Bloque | Voz en off | Visual 2D | Texto en pantalla |
|---|---|---|---|---|
| 0–4 s | **HOOK** | "Hay una herramienta que te da más volumen que el limiter… y casi nadie la usa bien." | Desde el cuadro 1: una onda de techno avanza y una cuchilla arcilla baja de golpe y le corta las puntas a los kicks, con chispas. El medidor de volumen sube. | **Más volumen que el *limiter*** |
| 4–11 s | **INTRODUCCIÓN (qué se llevan)** | "Se llama clipper. Quédate, y te digo dónde ponerlo, cuánto apretarlo, y el ajuste que separa un clip limpio de uno que suena barato." | Aparece la palabra CLIPPER y tres casillas: **dónde · cuánto · el ajuste** (la tercera con candado). Píldora fija con barra de progreso. | **El *clipper*** · píldora **El ajuste secreto → al final** |
| 11–19 s | **CUERPO 1 · Qué es** | "El limiter baja el volumen poco a poco. El clipper no: corta la punta del pico al instante. Y como el golpe del kick dura milisegundos, el oído casi no nota el corte." | Pantalla dividida. Arriba, LIMITER: una curva de ganancia que baja y sube, y con ella toda la onda se agacha. Abajo, CLIPPER: la onda queda igual y solo las puntas se cortan planas. Zoom a un kick con la etiqueta "≈ 2 ms". | **Limiter: *baja* · Clipper: *corta*** |
| 19–27 s | **CUERPO 2 · Por qué da volumen** | "Si recortas de uno a dos decibeles de esas puntas, ganas espacio. El limiter trabaja menos, ya no bombea, y tu track sube de volumen sin perder el golpe." | La cuchilla recorta 1–2 dB. Aparece un espacio libre ("headroom") que se marca en arcilla. Luego toda la onda sube a llenarlo y el medidor de reducción del limiter baja de −6 a −2 dB. | **Recorta *1–2 dB* → más volumen** |
| 27–30 s | **BUCLE ABIERTO 1** | "Pero si lo pones en el lugar equivocado, suena horrible…" | La cuchilla se mueve hacia una onda larga de bajo; la pantalla "vibra" con distorsión. | **Pero *cuidado*…** |
| 30–40 s | **CUERPO 3 · Dónde sí y dónde no** | "Úsalo en el bus de batería, o antes del limiter del máster. Nunca en sonidos largos como bajos o pads: ahí el corte se oye como distorsión. Y empieza con soft clip: redondea la punta y suena más cálido." | Tres carriles: BATERÍA ✓ (picos cortos y limpios), MÁSTER ✓ y BAJO ✗ (onda larga, aplastada, con ruido arcilla). Luego una gráfica de entrada/salida: **hard clip** (esquina recta) contra **soft clip** (curva redonda). | **Batería ✓ · Máster ✓ · Bajo ✗** · ***soft clip*** |
| 40–42 s | **BUCLE ABIERTO 2** | "Y ahora, el ajuste que casi nadie activa…" | La píldora de progreso se llena; el candado de la tercera casilla late. | **El ajuste…** |
| 42–53 s | **EL AJUSTE SECRETO · Oversampling** | "El oversampling. Sin él, el clipper crea frecuencias falsas que suenan ásperas y digitales. Actívalo a cuatro x o más, y el clip se vuelve casi invisible." | Un analizador de espectro: con **OVERSAMPLING 1x** aparecen picos grises "fantasma" por todo el espectro (aliasing). Un botón cambia a **4x** y los picos falsos desaparecen; solo queda la señal limpia. | **Oversampling *4x o más*** |
| 53–61 s | **CONCLUSIÓN MEF (~80 %)** | "En MEF Estudio te ayudamos a llevar tu track al siguiente nivel: producción, mezcla y máster. Escríbenos." | Entramos al estudio 2D de siempre con la onda sana en pantalla. Se enciende el letrero **MEF ESTUDIO · producción · mezcla · máster** y aparece la burbuja "Escríbenos →". | **Tu track al *siguiente nivel*** |
| 61–67 s | **CTA** | "Guarda este video para tu próxima sesión, y síguenos para más trucos de mezcla." | Se marca Guardar y se pulsa Seguir. Cierra con la placa MEF ESTUDIO y @mef.estudios. | **Guárdalo** · @mef.estudios |

## Por qué está armado así
- **Hook:** compara el clipper con el limiter, que todos conocen, y lo plantea como algo "que casi nadie usa bien". Así cualquier productor siente que le falta algo.
- **Introducción:** promete tres cosas concretas (dónde, cuánto y el ajuste). La tercera queda con candado hasta el final para que se queden.
- **Lo que no sabían:** que el clipper no "baja" el volumen sino que corta al instante, que por eso el oído no lo nota en picos cortos, y el **oversampling**, que evita el aliasing (frecuencias falsas). Este último es el detalle técnico que casi nadie conoce.
- **Error común:** clipear bajos o pads. Funciona como bucle abierto y a la vez da un consejo útil.
- **Conclusión y CTA:** iguales a los del video de arpegios ("siguiente nivel", producción · mezcla · máster, "Escríbenos"). El CTA vuelve a decir "trucos de **mezcla**" porque el tema es de mezcla y máster.

## Notas de producción
- 1080×1920, 30 fps, en Python (PIL + numpy) con render en ffmpeg. Voz nueva con el mismo TTS masculino (Kokoro `em_alex`). El video final se guarda en `mef/editorial/output/` con los otros cinco.
- **Audio que se oye:** el loop de techno pasa por un clipper real en numpy.
  - En los cuerpos 1 y 2 se escucha sin clip y con clip, igualados al mismo pico, para notar que suena más fuerte.
  - En el bucle 1 y el cuerpo 3 se oye un bajo clipeado y distorsionado.
  - En el secreto se oye el mismo clip a 1x (áspero, con aliasing) y a 4x (limpio).
- **Números usados:** 1–2 dB de recorte y oversampling de 4x o más son puntos de partida prácticos. "Antes del limiter" y "en el bus de batería" son usos comunes en techno.
- La marca no aparece (ni logo ni nombre) antes del segundo ~53 (~80 %).
