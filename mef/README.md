# MEF Estudio · Video 3D "El compresor" (≈64 s, vertical 9:16)

Reel/TikTok en animación 3D para productores de techno. **Objetivo: que guarden el video y sigan a [@mef.estudios](https://instagram.com/mef.estudios)**.
1080×1920 a 30 fps, voz en off masculina en español.

**Video final:** [`output/mef_compresor.mp4`](output/mef_compresor.mp4) · **Guion aprobado:** [`guion.md`](guion.md)

## Estructura

| Tiempo | Bloque | Qué pasa |
|---|---|---|
| 0–3 s | **Gancho** | Cámara en caída desde el cuadro 1; una perilla de volumen gira hacia abajo, el medidor de PICOS baja y el de LOUDNESS sube. |
| 3–10 s | Promesa | Recorrido por el club con láseres; aparece la píldora "Números para tu kick → al final" con barra de progreso. |
| 10–17 s | Problema | Paisaje de audio 3D; los picos de KICK y CLAP tocan el techo rojo de 0 dBFS. |
| 17–22 s | Concepto | Baja el plano cian del threshold y una prensa aplasta solo los picos (ratio 4:1, medidor GR). |
| 22–30 s | Revelación | Make-up gain: todo sube hasta el mismo techo. Medidores ANTES/DESPUÉS. **En el audio se oye la diferencia.** |
| 30–45 s | Valor | Rack 3D de compresor: attack 10–30 ms, release ≈115 ms @130 BPM, ratio 4:1, 3–6 dB GR; bus 2:1, 1–3 dB. |
| 45–50 s | Advertencia | La prensa golpea: el paisaje se vuelve un ladrillo color cartón (sobrecompresión). |
| 50–57 s | **Marca** (primera mención, ~78 %) | Estudio 3D; se enciende el letrero de neón MEF ESTUDIO. |
| 57–64 s | CTA | Guardar + Seguir + @mef.estudios; placa final. |

El audio es demostrativo de verdad: la música pasa por un compresor en numpy y cambia entre versión seca, comprimida y sobrecomprimida, todas al mismo pico de −1 dBFS (RMS aprox. −14 / −10 / −6 dB).

## Cómo se genera (desde la raíz del repo)

```bash
npm install
pip install kokoro-onnx soundfile numpy
# descargar kokoro-v1.0.onnx y voices-v1.0.bin (releases de kokoro-onnx) en MODEL_DIR
python3 mef/scripts/voz.py MODEL_DIR            # voz em_alex -> mef/audio/voz.wav + mef/scene/timeline.json
node mef/scripts/render.mjs --workers 4         # vista previa: --preview 1,13,40
python3 mef/scripts/audio.py                    # música + compresor + efectos + ducking -> mef/audio/mezcla.wav
ffmpeg -f concat -safe 0 -i mef/output/parts/part_list.txt -i mef/audio/mezcla.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart mef/output/mef_compresor.mp4
```

Nota: el logotipo es un wordmark provisional ("MEF / ESTUDIO" en tipografía Anton); se reemplaza fácil si nos pasan el logo oficial.
