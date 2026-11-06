# MEF Estudio · Video 2D #3 "Compresión paralela: 5 tips" (≈60 s, 9:16) — GUION PARA APROBACIÓN

**Público:** productores de techno · **Objetivo:** que guarden el video y sigan a @mef.estudios (mezcla y máster)
**Estrategia:** gancho de "secreto" → promesa de 5 tips en cuenta regresiva (5 → 1, el #1 es el más importante, para que se queden) → marca al ~80 % → CTA y cierre MEF (igual que los videos #1 y #2).
**Estética:** la misma 2D editorial (grafito cálido, marfil, arcilla #D97757, serif Fraunces, grano de papel).
**Idea visual central:** la señal se divide en **dos carriles**. Arriba va el **ORIGINAL** (marfil, con picos altos = golpe) y abajo el **PARALELO** (arcilla, aplastado y denso = cuerpo). Al final los dos se juntan en la **SUMA**, que tiene golpe y cuerpo a la vez. Un número grande en serif (5, 4, 3, 2, 1) marca cada tip y 5 puntos arriba muestran el avance.

| Tiempo aprox. | Bloque | Voz en off | Visual 2D | Texto en pantalla |
|---|---|---|---|---|
| 0–4 s | **GANCHO** | "¿Y si te digo que existe un secreto que va a mejorar el sonido de tu track?" | Desde el cuadro 1: una onda de batería late a 130 BPM detrás de un sobre cerrado con un sello de cera arcilla, que se agrieta con cada kick. | **El *secreto* de tu mezcla** |
| 4–10 s | **Promesa + bucle abierto** | "Se llama compresión paralela, y te doy cinco tips para que lo logres. El número uno es el que casi todos se saltan." | El sello se rompe, la onda se **duplica** y se abre en dos carriles (ORIGINAL / PARALELO). Aparecen 5 puntos y una píldora fija. | **Compresión *paralela*** · píldora **El tip #1 → al final** |
| 10–17 s | **TIP 5 · Duplica** | "Cinco: no comprimas tu batería directo. Duplícala en un bus aparte. El original se queda intacto, con todo su golpe." | Número **5** gigante. La batería se copia a un segundo carril ("BUS PARALELO") y en el original aparece un candado: intacto. | **5 · Duplica en un *bus*** |
| 17–23 s | **TIP 4 · Aplasta** | "Cuatro: en ese bus, aplasta sin miedo. Ratio de diez a uno o más, y de diez a quince decibeles de reducción." | **4**. Solo el carril de abajo baja contra una línea de threshold muy baja y se vuelve un bloque denso. Medidor de GR en −10/−15 dB. | **4 · Aplasta: *10:1* · *−10 a −15 dB*** |
| 23–30 s | **TIP 3 · Tiempos** | "Tres: attack rápido, de uno a cinco milisegundos. Y release al tempo: a ciento treinta BPM, unos ciento quince." | **3**. Dos perillas (ATTACK / RELEASE) giran a su valor; el carril paralelo "respira" al ritmo del kick. | **3 · Attack *1–5 ms* · Release *≈115 ms*** |
| 30–37 s | **TIP 2 · Ecualiza** | "Dos: ecualiza el bus paralelo. Corta abajo de cien hercios para no ensuciar el sub, y dale brillo en las medias altas." | **2**. Curva de EQ sobre el carril paralelo: corte en 100 Hz (la zona del sub queda limpia) y una campana en 3–5 kHz. | **2 · EQ: corta *< 100 Hz*** |
| 37–47 s | **TIP 1 · Mézclalo (lo prometido)** | "Y uno, el que casi todos se saltan: empieza con el bus en silencio, súbelo hasta sentirlo, y bájalo un poco. Compara siempre al mismo volumen: el golpe del original, más el cuerpo de la copia." | **1** con brillo. El fader del bus paralelo sube desde −∞, pasa de largo y regresa un poco. Los dos carriles se funden en la **SUMA**: picos del original + cuerpo del paralelo. Botón A/B "mismo volumen". | **1 · Súbelo por *debajo*** · **Golpe + cuerpo** |
| 47–54 s | **Marca (orgánica, ~80 %)** | "Encontrar esa mezcla exacta entre golpe y cuerpo es lo que hacemos en MEF Estudio: mezcla y máster, para que tu track pegue en el club." | Entramos al estudio 2D de los videos anteriores: la onda SUMA en la pantalla, monitores que laten y se enciende el letrero **MEF ESTUDIO · mezcla · máster**. | (letrero MEF) |
| 54–60 s | **CTA + cierre** | "Guarda este video para tu próxima sesión, y síguenos para más trucos de mezcla." | Se marca Guardar, se pulsa Seguir y cierra con la placa MEF ESTUDIO y @mef.estudios. | **Guárdalo** · @mef.estudios |

## Notas de producción
- 1080×1920, 30 fps, en Python (PIL + numpy) con render en ffmpeg, igual que los videos anteriores. El video final se guarda en `mef/editorial/output/`.
- **Voz nueva:** hay que grabarla con el mismo TTS masculino de los videos anteriores (Kokoro, voz `em_alex`). Los tiempos de la tabla son aproximados y se ajustan a la voz real.
- **Audio que se oye:** el loop de techno se escucha primero solo, luego solo el bus paralelo (aplastado) y en el tip 1 la suma, para que se sienta cómo se suma el cuerpo sin perder el golpe.
- La marca no aparece (ni logo ni nombre) antes del segundo ~47 (~80 %).
- Corregí "e tu track" → "de tu track" en el gancho.
