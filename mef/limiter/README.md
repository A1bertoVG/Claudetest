# MEF Estudio · Video 3D #2 "Compresor → Limiter: el techo de cristal" (≈59 s, 9:16)

Reel/TikTok en 3D para productores de techno. **Objetivo: que guarden el video y sigan a @mef.estudios.** El cierre es el mismo del video #1.
1080×1920 a 30 fps, voz en off masculina (Kokoro `em_alex`).

**Video final:** [`output/mef_compresor_limiter.mp4`](output/mef_compresor_limiter.mp4) · **Guion aprobado:** [`guion.md`](guion.md)

## Idea visual
Una sola onda de neón viaja por un túnel de marcos que laten a 130 BPM y cambia de forma en dos estaciones:
1. **COMPRESOR** (marco cian): el **threshold** es un láser horizontal. Lo que lo cruza se pinta de cian y se reduce según el **ratio**, con una gráfica de entrada/salida y los bloques "+4 dB → +1 dB".
2. **LIMITER** (marco blanco): un **techo de cristal** a −1 dBTP con ratio ∞:1. Los picos chocan, sueltan chispas y nunca lo atraviesan.

En "el error", el cristal se empaña y se agrieta y la onda se vuelve un bloque gris sin golpe. Después se limpia con 1–3 dB de reducción.

## Audio
El loop pasa de verdad por un compresor y un limiter con look-ahead (numpy), y la versión que suena sigue a la pantalla:
cruda (−14 dB RMS) → comprimida → compresor + limiter (−10 dB RMS, mismo pico) → sobrelimitada (−7.6 dB RMS, aplastada).

## Generar (desde la raíz del repo)
```bash
python3 mef/limiter/scripts/voz.py MODEL_DIR
node mef/limiter/scripts/render.mjs --workers 4      # vista previa: --preview 1,13,40
python3 mef/limiter/scripts/audio.py
ffmpeg -f concat -safe 0 -i mef/limiter/output/parts/part_list.txt -i mef/limiter/audio/mezcla.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart mef/limiter/output/mef_compresor_limiter.mp4
```
