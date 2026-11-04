# CANIS · Spa canino — video 3D "Los nudos lastiman" (≈52 s, vertical 9:16)

Reel/TikTok en animación 3D con voz en off cuyo **objetivo es que agenden en CANIS Spa Canino** (Xalapa, Veracruz).
1080×1920 a 30 fps, adaptado al **Manual de Marca CANIS v2**.

**Video final:** [`output/canis_nudos_agenda.mp4`](output/canis_nudos_agenda.mp4)

## Guion y estrategia (StoryBrand: el dueño es el héroe, CANIS es el guía)

| Tiempo | Bloque | Voz en off | Visual |
|---|---|---|---|
| 0–5 s | **Gancho** (sin logo) | “¿Tu perrito se queja cuando lo cepillas? A Canela le pasaba: tenía nudos que la lastimaban.” | Canela triste con nudos que laten en coral. |
| 5–10 s | **Promesa** | “Quédate hasta el final y mira cómo quedó después de su visita a CANIS.” | Regalo con candado + píldora fija **“Antes y después, al final”** con barra de progreso. |
| 10–19 s | Problema | Los nudos se aprietan, jalan; dolor, irritación, humedad, suciedad, heridas. | Corte 3D de piel y pelo (fondo grafito). |
| 19–28 s | Valor (truco en casa) | Sujeta cerca de la piel, desenreda de la punta a la raíz; 2–3 veces por semana. | Mano + peine azul; calendario. |
| 28–33 s | Puente a CANIS | “Si el nudo ya está pegado a la piel, no uses tijeras. Déjalo en nuestras manos.” | Tijeras con señal de prohibido → manos con corazón. |
| 33–38 s | **Proceso** | “En CANIS la desenredamos con calma: sin jalar, sin prisas y sin estrés.” | Cepillado tranquilo, nudos que desaparecen. |
| 38–42 s | **Recompensa / resultado** | “Y aquí está: Canela salió lista, peinada y tranquila.” | El regalo se abre → **antes / después**, placa con el nombre “Canela”. |
| 42–47 s | **CTA: agendar** | “Agenda la cita de tu perrito. Escríbenos por mensaje a @canis.spacanino.” | Sticker amarillo “Agenda su cita” + usuario + “Spa canino · Xalapa, Veracruz”. |
| 47–52 s | **Cierre** | Slogan: “Porque cuando una mascota se siente bien, su familia también.” | Fondo azul, logo blanco original, slogan y @canis.spacanino. |

## Cómo se aplicó el manual de marca

- **Logo:** se usan los PNG originales extraídos del manual (`brand/`), sin redibujar, estirar ni recolorear. Logo blanco sobre azul en el cierre; ícono como marca de agua.
- **Colores:** crema/blanco de base, azul CANIS (#2F80B7) para identidad y objetos (cepillo, peine, moño), grafito (#3E4247) para texto y subtítulos, un solo acento (amarillo #F4C95D) en palabras clave y sticker. El coral aparece solo en pequeños detalles (placa del nombre, pulsos de dolor).
- **Tipografía:** Fraunces (títulos) y Nunito 800 de 48 px (subtítulos).
- **Zonas seguras:** nada importante en los 220 px de arriba ni en los 420 px de abajo; márgenes laterales de 48 px.
- **Elementos fijos:** ícono de marca de agua de ~90 px arriba a la derecha al 85 %; subtítulos en píldora grafito con texto blanco y clave en amarillo; placa crema con detalle coral para el nombre; sticker amarillo con texto grafito.
- **Estructura:** gancho sin logo → proceso → antes/después → cierre azul con logo blanco + slogan.
- **Evitado:** flashes, glitch, zooms agresivos y sacudidas de cámara (sí estaban en la versión anterior).
- **Voz:** cercana y profesional, llamando al perrito por su nombre, sin emojis.

## Cómo se generó (todo local, reproducible)

1. **Guion** → `scripts/guion.json`
2. **Voz en off** → `scripts/voz.py` (TTS neuronal [Kokoro](https://github.com/thewh1teagle/kokoro-onnx), voz `ef_dora`, español). Genera `audio/voz.wav` y `scene/timeline.json` con los tiempos de cada frase.
3. **Escena 3D** → `scene/main.js` (three.js). Todo es función del tiempo `t`, así que se renderiza de forma determinista.
3b. **Marca** → `brand/` (logos PNG originales extraídos del manual con `pdfimages`).
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
ffmpeg -f concat -safe 0 -i output/parts/list.txt -i audio/mezcla.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart output/canis_nudos_agenda.mp4
```
