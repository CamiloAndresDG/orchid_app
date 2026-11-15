// Marca de Orchid: una Cattleya trianae (la orquídea flor nacional de Colombia) sobre un disco musgo.
// Es el mismo dibujo que app/icon.svg (favicon); si cambia uno, cambia el otro.

const PETAL = "#f4e9f9";
const SEPAL = "#efe1f6";
const SEPAL_SIDE = "#dcc2ea";
const VEIN = "#cfa9e2";
const LIP = "#a52f80";
const LIP_EDGE = "#781c5c";
const THROAT = "#f4c24c";
const THROAT_LINE = "#e08a2a";
const COLUMN = "#fbf6ec";
const SIDE_SEPAL = "M32 31 C 28.8 25, 29 17.5, 32 11 C 35 17.5, 35.2 25, 32 31 Z";

export function OrchidMark({ size = 32, className = "", title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="32" cy="32" r="31" fill="var(--moss-mark, #3f6b3a)" />
      <g transform="translate(32 33) scale(1.04) translate(-32 -32)">
        <path d={SIDE_SEPAL} fill={SEPAL_SIDE} transform="rotate(130 32 31)" />
        <path d={SIDE_SEPAL} fill={SEPAL_SIDE} transform="rotate(-130 32 31)" />
        <path d="M32 30.5 C 28.6 24, 28.8 15, 32 8 C 35.2 15, 35.4 24, 32 30.5 Z" fill={SEPAL} />
        <path d="M32 30.5 C 27 21, 15.5 14, 7.5 17 C 5.5 19.5, 6.6 22, 5.6 24.5 C 6.8 27.5, 9.6 28, 11 30.5 C 17 34, 25 33.5, 32 32.5 Z" fill={PETAL} />
        <path d="M32 30.5 C 37 21, 48.5 14, 56.5 17 C 58.5 19.5, 57.4 22, 58.4 24.5 C 57.2 27.5, 54.4 28, 53 30.5 C 47 34, 39 33.5, 32 32.5 Z" fill={PETAL} />
        <path d="M30.5 30.6 C 24.5 25.5, 16.5 21.8, 9.5 21.5" fill="none" stroke={VEIN} strokeWidth="0.9" strokeLinecap="round" />
        <path d="M33.5 30.6 C 39.5 25.5, 47.5 21.8, 54.5 21.5" fill="none" stroke={VEIN} strokeWidth="0.9" strokeLinecap="round" />
        <path
          d="M32 27 C 27.8 28, 26.4 32.4, 26.4 36.2 C 23.2 38.6, 21.6 42.6, 23.4 46.2 C 25 49.2, 27.8 48.4, 29.4 49.8 C 30.6 50.9, 33.4 50.9, 34.6 49.8 C 36.2 48.4, 39 49.2, 40.6 46.2 C 42.4 42.6, 40.8 38.6, 37.6 36.2 C 37.6 32.4, 36.2 28, 32 27 Z"
          fill={LIP}
        />
        <path
          d="M24.2 45.4 C 26.4 47.4, 28.2 46.2, 29.6 47.8 C 30.8 49, 33.2 49, 34.4 47.8 C 35.8 46.2, 37.6 47.4, 39.8 45.4"
          fill="none"
          stroke={LIP_EDGE}
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path d="M32 30 C 29.8 33.5, 29.6 38.6, 32 43 C 34.4 38.6, 34.2 33.5, 32 30 Z" fill={THROAT} />
        <path d="M32 33 C 31 35.5, 31 38.5, 32 41" fill="none" stroke={THROAT_LINE} strokeWidth="0.9" strokeLinecap="round" />
        <ellipse cx="32" cy="29.6" rx="2.1" ry="2.6" fill={COLUMN} />
      </g>
    </svg>
  );
}

/** Crédito del equipo, en una sola línea. */
export const AUTHORS = "Orbital Farmers";
export const CREDIT = "Hecho por Orbital Farmers, equipo participante en el NASA Space Apps Challenge 2026";
