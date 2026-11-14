---
name: Field Shift
description: Cuaderno de campo con mapa satelital donde un agricultor marca su terreno y lee qué sembrar después, con datos de la NASA y el USDA.
colors:
  paper: "#f3eddd"
  paper-deep: "#e9e1cc"
  moss-wash: "#e2e6cf"
  ink: "#23301f"
  ink-soft: "#46523f"
  ink-faint: "#575f4e"
  rule: "#cfc5a8"
  field: "#8a8470"
  moss: "#3f6b3a"
  moss-deep: "#2c4d29"
  clay: "#9a4220"
  paper-night: "#151a12"
  paper-deep-night: "#1f271b"
  moss-wash-night: "#213019"
  ink-night: "#ece6d3"
  ink-soft-night: "#c3cab6"
  ink-faint-night: "#9aa38f"
  rule-night: "#37422f"
  field-night: "#6b7760"
  moss-night: "#93c283"
  moss-deep-night: "#b5d9a7"
  clay-night: "#e58d62"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.25
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
  headline-sm:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  title-sm:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body-lg:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: "1.75rem"
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.moss-deep}"
    textColor: "{colors.paper}"
  button-primary-lg:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.paper}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    padding: "14px 28px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.moss}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-outline-hover:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.paper}"
  toggle:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  toggle-selected:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.paper}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body}"
    padding: "12px 20px"
  tab-active:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
  pill:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  pill-active:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.paper}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  step-marker:
    backgroundColor: "transparent"
    textColor: "{colors.moss}"
    rounded: "{rounded.full}"
    size: "32px"
  step-marker-done:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.paper}"
  best-option:
    backgroundColor: "{colors.moss-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
  alert:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.clay}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: Field Shift

## Overview

**Creative North Star: "The Field Notebook"**

Un cuaderno de campo abierto junto a una foto aérea del terreno. La mitad izquierda es el mundo real (imagen satelital del USGS, con el pin «Mi terreno»); la mitad derecha es la libreta donde se anota lo que se sabe de ese pedazo de tierra: tres pasos numerados, una recomendación y, siempre a mano, de dónde sale cada dato. Se lee como una página escrita a mano con cuidado, no como un tablero de control.

El papel es claro por defecto porque la escena de uso es una oficina o una cocina con luz de día; el modo oscuro existe como una libreta de noche en verde bosque, elegida por la persona y recordada. El sistema es plano: la jerarquía viene de la serif Fraunces en los títulos, del tamaño y de líneas finas de color «rule», no de tarjetas, sombras ni adornos. El verde musgo es la única voz de acción; el barro (clay) solo avisa de pérdida, riesgo o error.

El lenguaje es español sencillo de agricultor, con unidades de EE. UU. (acres, bushels, dólares por acre). Nada de rótulos en mayúsculas encima de los títulos ni de bordes laterales de color: el título dice lo que es y la línea separa.

**Key Characteristics:**
- Pantalla partida 50/50: mapa satelital a la izquierda, cuaderno a la derecha.
- Papel crema claro por defecto; libreta verde bosque como modo oscuro opcional.
- Líneas en lugar de tarjetas; una sola superficie tintada para «Tu mejor opción».
- Musgo para actuar y elegir; barro solo para pérdida, riesgo y error.
- Cada afirmación lleva su «¿De dónde sale esto?» con enlace al dato oficial.

## Colors

Papel crema y tinta verde oscura, con un solo acento musgo y un barro rojizo reservado para advertir; cada token tiene su par nocturno bajo `:root[data-theme="dark"]` con el mismo nombre de variable CSS.

### Primary
- **Musgo** (moss / moss-night): botón principal, pestaña activa (subrayado de 3px), píldoras y opciones seleccionadas, círculos de los pasos, enlaces de acción y «Ver dato oficial», viñetas de «Por qué sí», línea del gráfico de verdor, el pin del mapa, el anillo de foco y la selección de texto.
- **Musgo Hondo** (moss-deep / moss-deep-night): solo el hover del botón principal.
- **Lavado de Musgo** (moss-wash / moss-wash-night): fondo de la tarjeta «Tu mejor opción». No se usa en ningún otro sitio.

### Secondary
- **Barro** (clay / clay-night): «Te daría pérdida», «No es buena idea ahora», viñetas de «Ten cuidado con», mensajes de validación y error, hover de «Quitar cultivo» y la línea punteada del umbral de verdor. Nunca decorativo.

### Neutral
- **Papel** (paper / paper-night): fondo del cuaderno, de los campos de formulario y de las tarjetas flotantes sobre el mapa (al 95%).
- **Papel Hondo** (paper-deep / paper-deep-night): fondo de avisos de error, bloques de código y pistas de las barras de porcentaje.
- **Tinta** (ink / ink-night): títulos y texto principal.
- **Tinta Suave** (ink-soft / ink-soft-night): párrafos de apoyo, ayudas, etiquetas de definición, pestañas inactivas, ejes de gráficos.
- **Tinta Tenue** (ink-faint / ink-faint-night): anotaciones terciarias como «(cálculo de Field Shift)».
- **Renglón** (rule / rule-night): todas las líneas divisorias, bordes de pestañas, rejilla de gráficos y borde de las filas de historial.
- **Lindero** (field / field-night): bordes de campos de formulario, botones de alternar sin elegir y cajas punteadas de estado vacío.

### Named Rules
**The Measured Ink Rule.** Todo token de texto (ink, ink-soft, ink-faint, moss, clay) mide al menos 4.5:1 sobre paper y paper-deep en ambos temas, y field mide al menos 3:1 como borde de control. Un color nuevo de texto entra solo si pasa la misma medida.

**The Two Voices Rule.** Musgo significa «actúa o está elegido»; barro significa «cuidado». No hay tercer acento, y ninguno se usa como adorno.

**The One Wash Rule.** Moss-wash pinta únicamente la recomendación principal. Si todo está tintado, nada destaca.

## Typography

**Display Font:** Fraunces (con Georgia, serif)
**Body Font:** Public Sans (con system-ui, sans-serif)

**Character:** Una serif con tinta y calidez para lo que se titula a mano en el cuaderno, y una sans pública y sobria para leer instrucciones y números. Los números de los pasos van en Public Sans aunque estén dentro de un título serif.

### Hierarchy
- **Display** (600, 2.25rem, 1.25): el nombre «Field Shift» en la cabecera del cuaderno.
- **Headline** (600, 1.875rem): título de cada pestaña principal («Mi terreno», «Mis precios y costos»), «Lo que te sugerimos» y la frase de «Tu mejor opción».
- **Headline Small** (600, 1.5rem): títulos de los paneles de «Más datos».
- **Title** (600, 1.25rem): títulos de pasos, secciones y resúmenes desplegables; la indicación sobre el mapa.
- **Title Small** (600, 1.125rem): cada opción en «Otras opciones» y los apartados de «Lo que sabemos de tu terreno».
- **Body Large** (400, 1.125rem): el veredicto de la mejor opción y el texto del botón principal grande.
- **Body** (400, 1rem, 1.5rem): todo el texto de lectura, etiquetas de formulario, pestañas y botones. Párrafos limitados a `max-w-prose` (65ch).
- **Label** (400, 0.875rem): notas al pie, aclaraciones de fuente, enlaces a datos oficiales, píldoras de «Más datos».

### Named Rules
**The Readable Floor Rule.** El texto que la persona debe leer para decidir es de 16px como mínimo; 14px solo para notas y fuentes. Nada en mayúsculas sostenidas ni con espaciado ampliado.

**The Title Says It Rule.** Un título serif nombra la sección por sí solo; no lleva rótulo pequeño encima.

## Layout

Pantalla completa partida en dos mitades iguales con ancho mínimo de 1024px (pensado para computadora de escritorio): el mapa ocupa la izquierda a toda altura y el cuaderno la derecha, separado por una línea rule; solo el cuaderno se desplaza. El cuaderno tiene un margen lateral de 40px; la cabecera (título, botón de tema, pestañas) queda fija arriba y el contenido corre debajo.

El ritmo vertical es de 32px entre bloques mayores, 24px desde cada línea divisoria hasta su contenido y 16px dentro de grupos. El contenido de cada paso se sangra 44px para alinearse con el texto del título, a la derecha del círculo numerado; los desplegables sangran 28px bajo su chevron. La barra de acción principal es pegajosa al pie del cuaderno, a sangre completa, con línea rule arriba y papel al 95%.

## Elevation & Depth

El cuaderno es plano: la profundidad se expresa con líneas rule, el paso de paper a paper-deep o moss-wash, y nunca con sombra. Las sombras pertenecen al mapa: todo lo que flota sobre la imagen satelital (la tarjeta de indicación, la etiqueta «¿No es tu campo?», el pin) lleva una sombra difusa para separarse de una foto con mucho contraste, y el borde del mapa junto al cuaderno tiene una sombra interior suave.

### Shadow Vocabulary
- **Sobre el mapa** (`box-shadow: 0 6px 20px rgb(0 0 0 / 0.3)`): tarjeta de indicación «Toca tu terreno en el mapa».
- **Etiqueta sobre el mapa** (`box-shadow: 0 4px 12px rgb(0 0 0 / 0.3)`): aviso en píldora una vez puesto el pin.
- **Pliegue del mapa** (`box-shadow: inset -12px 0 24px -12px rgb(0 0 0 / 0.35)`): borde del mapa contra el cuaderno.

### Named Rules
**The Paper Is Flat Rule.** Nada dentro del cuaderno lleva sombra, ni en reposo ni en hover. Las sombras solo separan cosas que flotan sobre la imagen satelital.

## Shapes

Esquinas suaves y pocas: 6px en botones y campos, 8px en avisos, filas de historial, estados vacíos y la tarjeta sobre el mapa, 12px solo en «Tu mejor opción». Lo redondo completo marca lo que se toca para navegar o seguir el avance: píldoras de sub-pestañas y ejemplos, círculos de pasos (32px), botón de tema (40px) y barras de porcentaje. Los bordes son de 1px; las excepciones son el subrayado de la pestaña activa (3px) y el círculo de paso pendiente (2px). Los iconos son propios, de trazo 1.75px con puntas redondeadas, a 20px (14px el de enlace externo), y siempre heredan el color del texto.

## Components

### Buttons
Firmes y sin artificio: un bloque musgo para la acción principal, un contorno musgo para la secundaria.
- **Shape:** esquina suave (6px).
- **Primary:** fondo moss, texto paper, Public Sans 600, 10px 20px. En la barra pegajosa de «Mi terreno» va en tamaño grande (18px, 14px 28px).
- **Hover / Focus:** hover a moss-deep; foco con anillo moss de 2px separado 2px. Deshabilitado al 45% de opacidad con cursor de prohibido, y al lado una frase en ink-soft dice qué falta.
- **Outline:** borde moss, texto moss, 10px 16px; en hover se rellena de moss con texto paper. Puede llevar icono a la izquierda («Agregar un cultivo»).
- **Text link action:** texto moss 600 que se subraya en hover («Poner mis precios», «Ver todo lo que sabemos de tu terreno»).

### Chips
- **Style:** píldoras (radio completo). Sub-pestañas de «Más datos» a 14px con borde rule y texto ink-soft; botones de ejemplo a 16px con borde field y texto ink.
- **State:** elegido = fondo moss, borde moss, texto paper. Hover = borde moss y texto ink.

### Toggles
Pares de opciones como «No, solo lluvia / Sí, tengo riego»: rectángulos de 6px con borde field y texto ink; el elegido se rellena de moss. Usan `aria-pressed`.

### Cards / Containers
- **Corner Style:** 8px; 12px solo la mejor opción.
- **Background:** transparente sobre paper. La única superficie tintada es «Tu mejor opción» (moss-wash, 24px de relleno, sin borde).
- **Shadow Strategy:** ninguna (ver The Paper Is Flat Rule).
- **Border:** 1px rule en filas de historial; 1px punteado field en estados vacíos.
- **Internal Padding:** 16px; 32px en estados vacíos.

### Inputs / Fields
- **Style:** borde 1px field, fondo paper, texto ink 16px, radio 6px, relleno 10px 12px. La etiqueta va encima en ink 16px; lo opcional se aclara en ink-soft entre paréntesis.
- **Focus:** anillo moss de 2px separado 2px (global para todo control).
- **Error / Disabled:** el mensaje aparece debajo en clay 16px, en palabras llanas que dicen cómo arreglarlo. Las casillas usan el color de acento moss.

### Navigation
- **Pestañas principales:** tres pestañas de texto 16px con 12px 20px de relleno sobre una línea rule; la activa lleva subrayado moss de 3px, peso 600 y texto ink; las demás ink-soft que pasan a ink en hover. Se recorren con las flechas izquierda/derecha.
- **Sub-pestañas:** debajo de «Más datos», una fila de píldoras (ver Chips) que recuerda la última elegida.

### Pasos numerados
Cada paso abre con una línea rule y 24px de aire; el título serif va precedido de un círculo de 32px: pendiente = borde moss de 2px con el número en moss; listo = relleno moss con una palomita en paper (y «(listo)» para lectores de pantalla). El contenido se sangra 44px.

### Barra de acción y avance
Barra pegajosa al pie con el botón principal grande. Mientras calcula, muestra en vivo cada fuente que se consulta: palomita moss cuando terminó, giro moss mientras espera, con el texto pasando de ink-soft a ink.

### Tu mejor opción
Tarjeta moss-wash de 12px con el titular serif de 30px: «Tu mejor opción:» en moss y la siembra sugerida en ink. Debajo, el veredicto en 18px, el dinero estimado, dos columnas «Por qué sí» (viñetas moss) y «Ten cuidado con» (viñetas clay), y la evidencia. Las otras opciones van debajo como lista desplegable entre líneas rule, con chevron moss que gira 90° al abrir.

### ¿De dónde sale esto?
Desplegable con escudo y texto moss. Cada evidencia termina en «Ver dato oficial» (moss 600 subrayado, con icono externo) cuando viene de una fuente pública, o en «(cálculo de Field Shift)» en ink-faint cuando es nuestro. «Lo que aún no sabemos» lista las lagunas con viñetas field.

### Avisos de error
Fondo paper-deep, borde clay al 40%, texto clay 16px, radio 8px, relleno 16px, con icono de alerta. `role="alert"`.

### Pin del mapa
Gota musgo con contorno paper de 2.5px y centro paper, coronada por una píldora musgo «Mi terreno» en Public Sans 600 13px. El cursor del mapa es una cruz.

## Do's and Don'ts

### Do:
- **Do** separar secciones con una línea rule de 1px y 24px de aire, no con cajas.
- **Do** usar moss para la única acción principal visible y para lo elegido; moss-deep solo en su hover.
- **Do** reservar clay para pérdida, riesgo, validación y error.
- **Do** acompañar cada dato público con su enlace «Ver dato oficial» y marcar los cálculos propios como tales.
- **Do** escribir en español llano y en unidades de EE. UU. (acres, bushels, $ por acre).
- **Do** dibujar iconos nuevos con trazo de 1.75px, puntas redondeadas y `currentColor`.
- **Do** definir cada color nuevo para ambos temas y medirlo: 4.5:1 para texto, 3:1 para bordes de control.

### Don't:
- **Don't** poner rótulos pequeños en mayúsculas encima de los títulos.
- **Don't** usar bordes laterales de color para resaltar un bloque.
- **Don't** añadir sombras a nada dentro del cuaderno; las sombras son solo para lo que flota sobre el mapa.
- **Don't** pintar con moss-wash nada que no sea la recomendación principal.
- **Don't** usar iconos de fuente, emoji ni paquetes de iconos con otro grosor.
- **Don't** bajar de 16px el texto que hace falta para decidir.
- **Don't** mostrar un dato que no tenemos; se escribe como algo que aún no sabemos.
