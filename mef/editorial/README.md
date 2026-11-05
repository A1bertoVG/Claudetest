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
