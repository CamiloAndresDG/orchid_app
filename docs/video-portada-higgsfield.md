# Video de portada con Higgsfield

El archivo final va en `frontend/public/hero/campo.mp4` (y opcionalmente `frontend/public/hero/campo.jpg` como póster).
La portada ya lo carga, lo reproduce en bucle sin sonido y le aplica parallax al hacer scroll.
Si el archivo no existe, se muestra la escena animada en canvas.

## Paso a paso

1. Entra a higgsfield.ai e inicia sesión.
2. Genera primero una **imagen fija** (Image / Soul) con el prompt de imagen de abajo, en **16:9**. Genera 4 variantes y elige la que deje el tercio izquierdo más limpio (ahí va el texto).
3. Ve a **Video → Image to Video** y sube esa imagen.
4. Pega el prompt de video. Si el modelo ofrece movimientos de cámara predefinidos, elige uno lateral y lento (truck / pan lateral, dolly suave). Evita zoom rápido, FPV o giros.
5. Ajustes: 16:9, la mayor resolución disponible (1080p), 5 a 10 segundos, sin audio.
6. Genera 2 o 3 versiones y quédate con la más estable (sin deformaciones en personas ni tractor).
7. Descarga el MP4 y guárdalo como `frontend/public/hero/campo.mp4`.
8. (Recomendado) Comprímelo para que cargue rápido; ver comandos al final.

## Prompt de imagen (paso 2)

```
Cinematic wide aerial landscape of a sustainable family farm in the American Midwest at golden hour, soft warm morning light, gentle haze.
Composition: the left third of the frame is calm open sky and soft distant fields with very little detail (space for text); the main action sits in the center-right and lower half.
Layered depth for parallax: foreground of tall golden wheat and green soybean rows swaying, close and slightly out of focus; midground of neatly striped crop fields in alternating strips of sage green and tilled warm brown soil, a farmer in a straw hat and denim walking between rows inspecting the plants, a small vintage green tractor slowly working a far field raising a faint dust trail; a center-pivot irrigation sprinkler spraying fine water arcs that catch the sunlight; thin wisps of water vapor rising from the moist soil (evaporation) glowing in the backlight; background of soft rolling hills, scattered trees, and a pale cream sky with a low warm sun and a few light clouds, a small flock of birds.
Color palette: warm cream paper #f3eddd, soft sage #e2e6cf, moss green #3f6b3a, deep forest green #2c4d29, terracotta clay accents #9a4220, muted earth brown soil. Low contrast, earthy, natural, slightly desaturated, film-like.
Style: photorealistic, documentary nature cinematography, 35mm film look, shallow atmospheric perspective, high detail, calm and hopeful mood.
```

Negative prompt (si lo permite):

```
text, logos, watermark, people looking at camera, close-up faces, deformed hands, extra limbs, neon colors, oversaturated, blue saturated sky, night, rain storm, city, buildings, drones in frame, fast motion, motion blur artifacts
```

## Prompt de video (paso 4)

```
Slow, smooth lateral camera truck from left to right across the farm, strong parallax: foreground wheat moves fastest, midground fields and farmer move slower, background hills and sky almost still.
Wheat and soybean leaves sway gently in a light breeze. The farmer walks slowly between the rows and bends to touch the plants. The small tractor keeps working the far field with a soft dust trail. The center-pivot sprinkler sprays shimmering water arcs; fine vapor rises from the wet soil and drifts upward, glowing in the golden backlight. Birds glide slowly across the sky, clouds drift.
Calm, steady, cinematic, no cuts, no zoom, no shake. Keep the left third of the frame calm and uncluttered. Warm cream, sage and moss green palette with terracotta accents, soft golden hour light. Seamless, loop-friendly motion.
```

## Comprimir y sacar el póster (opcional, con ffmpeg)

```bash
ffmpeg -i descarga.mp4 -an -vf "scale=1920:-2,fps=30" -c:v libx264 -crf 26 -preset slow -movflags +faststart frontend/public/hero/campo.mp4
```

```bash
ffmpeg -i frontend/public/hero/campo.mp4 -frames:v 1 -q:v 3 frontend/public/hero/campo.jpg
```

Objetivo: menos de 6 a 8 MB para que la portada cargue rápido.
