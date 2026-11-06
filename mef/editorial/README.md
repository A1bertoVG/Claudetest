# MEF Estudio · "El compresor" en 2D editorial (64 s, 1080×1920, 30 fps)

**Video final:** [`output/mef_compresor_editorial.mp4`](output/mef_compresor_editorial.mp4) · guion: [`../guion.md`](../guion.md)

Todo en Python: cuadros con PIL + numpy (supermuestreo 2×, grano de papel y viñeta), audio sintetizado con numpy y codificación con ffmpeg.
Usa la voz y los tiempos ya generados (`mef/audio/voz.wav`, `mef/scene/timeline.json`).

- Estética: grafito cálido #141413, marfil, arcilla #D97757 (picos/techo/palabras clave), cielo (threshold), oliva (make-up), cartón (sobrecompresión); Fraunces + Space Grotesk + JetBrains Mono.
- Audio: loop techno a 130 BPM que pasa por un compresor real y cambia entre versión seca / comprimida / sobrecomprimida al mismo pico, siguiendo lo que se ve; *ducking* bajo la voz y efectos (perilla, golpe de prensa, riser a la marca, pops del CTA).
- La marca aparece por primera vez a los 50.4 s (79 %).

```bash
npm install && pip install numpy pillow soundfile
python3 mef/editorial/make.py --preview 1.6,20.5,36   # cuadros sueltos
python3 mef/editorial/make.py                         # video completo (≈4 min con 4 núcleos)
```

## Video #2 · "Compresor → Limiter: el techo de cristal" (59 s)

**Video final:** [`output/mef_limiter_editorial.mp4`](output/mef_limiter_editorial.mp4) · guion: [`../limiter/editorial/guion.md`](../limiter/editorial/guion.md)
Generador en `mef/limiter/editorial/` (voz y tiempos de `mef/limiter/`); el video y su mezcla se guardan en esta misma carpeta `output/`.

```bash
python3 mef/limiter/editorial/make.py --preview 19.5,30.2
python3 mef/limiter/editorial/make.py
```

## Video #3 · "Compresión paralela: 5 tips" (62 s)

**Video final:** [`output/mef_paralela_editorial.mp4`](output/mef_paralela_editorial.mp4) · guion: [`../paralela/guion.md`](../paralela/guion.md)
Generador en `mef/paralela/` (voz Kokoro `em_alex` con `scripts/voz.py`); el video y su mezcla (`output/mezcla_paralela.wav`) se guardan en esta carpeta.

```bash
python3 mef/paralela/scripts/voz.py MODEL_DIR   # voz + timeline
python3 mef/paralela/make.py --preview 2,22.8,45.5
python3 mef/paralela/make.py
```
