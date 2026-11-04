# Peina a tu perrito – video 3D (≈58 s, vertical 9:16)

Video corto en animación 3D con voz en off sobre **por qué hay que cepillar a tu perrito y cómo los nudos lo lastiman**.
Formato 1080×1920 a 30 fps, listo para TikTok / Reels / Shorts.

**Video final:** [`output/peina_a_tu_perrito.mp4`](output/peina_a_tu_perrito.mp4)

## Estrategia de contenido

| Tiempo | Bloque | Táctica |
|---|---|---|
| 0–5 s | **Hook** – “¿Sabías que un simple nudo en el pelo de tu perrito puede lastimarlo todos los días?” | Pregunta + golpe de cámara + sonido de impacto + nudos con pulsos rojos. |
| 5–11 s | **Intro con promesa** – “Quédate hasta el final, y te enseño el truco que usan los peluqueros caninos para quitar nudos sin dolor.” | Regalo con candado (bucle abierto). Aparece la píldora fija **“EL TRUCO, AL FINAL”** con barra de progreso que se llena hasta la recompensa. |
| 11–24 s | **Problema** | Corte 3D de piel: el pelo se enreda, el nudo se aprieta, jala la piel; luego irritación, humedad, suciedad y bacterias. |
| 24–38 s | **Solución** | El cepillo quita los nudos, el perrito pasa de triste a feliz; chips de beneficios y calendario (2–3 veces por semana, diario si es pelo largo). |
| 38–48 s | **Recompensa** – el truco | El regalo se abre, la píldora cambia a **“¡TRUCO DESBLOQUEADO!”**; demostración: no jalar, sujetar en la raíz, fécula de maíz, desenredar de la punta a la raíz. |
| 48–53 s | Aviso de seguridad | Nudo pegado a la piel → nada de tijeras, ve con un profesional. |
| 53–58 s | **CTA** | “Guarda este video y compártelo…” con botones animados. |

Además: subtítulos tipo karaoke palabra por palabra, titulares por escena con palabras clave resaltadas, transiciones con destello y *whoosh*, música que cambia de tensa a alegre al llegar la solución.

## Cómo se generó (todo local, reproducible)

1. **Guion** → `scripts/guion.json`
2. **Voz en off** → `scripts/voz.py` (TTS neuronal [Kokoro](https://github.com/thewh1teagle/kokoro-onnx), voz `ef_dora`, español). Genera `audio/voz.wav` y `scene/timeline.json` con los tiempos de cada frase.
3. **Escena 3D** → `scene/main.js` (three.js). Todo es función del tiempo `t`, así que se renderiza de forma determinista.
4. **Render** → `scripts/render.mjs` (Chromium headless + ffmpeg, cuadro a cuadro, en paralelo).
5. **Audio** → `scripts/audio.py` (música y efectos sintetizados con numpy + *ducking* bajo la voz) → `audio/mezcla.wav`.
6. **Mux** → ffmpeg une video y audio.

```bash
npm install
pip install kokoro-onnx soundfile numpy
# descargar kokoro-v1.0.onnx y voices-v1.0.bin (releases de kokoro-onnx) en MODEL_DIR
python3 scripts/voz.py MODEL_DIR
node scripts/render.mjs --workers 3          # vista previa: --preview 1,13,40
python3 scripts/audio.py
ffmpeg -f concat -safe 0 -i output/parts/list.txt -i audio/mezcla.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart output/peina_a_tu_perrito.mp4
```
