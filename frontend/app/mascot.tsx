// Brote: el personaje de la Guía. Una semilla con su primer brote, dibujada con la misma tinta del cuaderno.
// Estados: "idle" (respira, parpadea, mece las hojas), "listening" (hojas arriba, ojos abiertos),
// "thinking" (mira hacia arriba, hojas inquietas) y "talking" (mueve la boca).
// Con prefers-reduced-motion queda quieto (regla global en globals.css).

export type MascotState = "idle" | "listening" | "thinking" | "talking";

export function Mascot({
  state = "idle",
  size = 64,
  className = "",
  decorative = false,
}: {
  state?: MascotState;
  size?: number;
  className?: string;
  decorative?: boolean; // dentro de un botón con texto: que el lector de pantalla no lo lea dos veces
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={`brote ${className}`}
      data-state={state}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Brote, la guía de Orchid"}
      aria-hidden={decorative || undefined}
    >
      {/* sombra en la tierra */}
      <ellipse className="brote-shadow" cx="60" cy="108" rx="26" ry="4.5" fill="var(--ink)" opacity="0.14" />

      <g className="brote-body">
        {/* tallo y hojas */}
        <path d="M60 46 C 59 38, 61 32, 60 25" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
        <g className="brote-leaf brote-leaf-l">
          <path d="M60 27 C 50 13, 33 14, 28 21 C 37 31, 52 32, 60 27 Z" fill="var(--moss)" stroke="var(--ink)" strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M57 26.5 C 49 24, 41 22, 34 21.5" fill="none" stroke="var(--paper)" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
        </g>
        <g className="brote-leaf brote-leaf-r">
          <path d="M60 25 C 67 9, 85 6, 92 12 C 85 24, 69 29, 60 25 Z" fill="var(--moss)" stroke="var(--ink)" strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M63 23.5 C 71 19, 79 15, 87 13" fill="none" stroke="var(--paper)" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
        </g>

        {/* semilla */}
        <path
          d="M60 44 C 82 44, 92 62, 91 78 C 90 96, 77 106, 60 106 C 43 106, 30 96, 29 78 C 28 62, 38 44, 60 44 Z"
          fill="var(--paper)"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* surco de la semilla */}
        <path d="M44 56 C 40 62, 38 70, 38.5 77" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" opacity="0.35" />

        {/* mejillas */}
        <ellipse cx="43" cy="86" rx="6" ry="3.6" fill="var(--moss)" opacity="0.22" />
        <ellipse cx="77" cy="86" rx="6" ry="3.6" fill="var(--moss)" opacity="0.22" />

        {/* ojos */}
        <g className="brote-eyes">
          <g className="brote-eye">
            <ellipse cx="49" cy="76" rx="4" ry="5.2" fill="var(--ink)" />
            <circle cx="50.4" cy="74" r="1.4" fill="var(--paper)" />
          </g>
          <g className="brote-eye">
            <ellipse cx="71" cy="76" rx="4" ry="5.2" fill="var(--ink)" />
            <circle cx="72.4" cy="74" r="1.4" fill="var(--paper)" />
          </g>
        </g>

        {/* boca: sonrisa en reposo, se abre al hablar */}
        <path className="brote-smile" d="M54 88 C 57 92, 63 92, 66 88" fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" />
        <ellipse className="brote-mouth" cx="60" cy="90" rx="4.6" ry="3.4" fill="var(--ink)" />
      </g>

      {/* puntos de "pensando" */}
      <g className="brote-dots" fill="var(--moss)">
        <circle cx="98" cy="40" r="3" />
        <circle cx="106" cy="31" r="3.6" />
        <circle cx="113" cy="20" r="4.2" />
      </g>
    </svg>
  );
}
