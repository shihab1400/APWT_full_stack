/**
 * Decorative botanical scene for the home hero: misty hills, leafy sprigs and
 * still water. Pure SVG (no image download) so it stays sharp and light.
 */

type Point = [number, number];

interface Sprig {
  /** Quadratic curve of the stem: base, control, tip. */
  stem: [Point, Point, Point];
  leaves: number;
  size: number;
  fill: string;
  opacity: number;
}

const SPRIGS: Sprig[] = [
  { stem: [[610, 660], [540, 400], [650, 140]], leaves: 10, size: 1.9, fill: "#35524d", opacity: 0.85 },
  { stem: [[690, 680], [740, 450], [640, 250]], leaves: 8, size: 1.6, fill: "#2d4844", opacity: 0.8 },
  { stem: [[500, 700], [430, 520], [500, 330]], leaves: 8, size: 1.45, fill: "#2b433f", opacity: 0.7 },
  { stem: [[760, 660], [820, 450], [770, 290]], leaves: 7, size: 1.4, fill: "#304b47", opacity: 0.65 },
  { stem: [[420, 720], [370, 600], [400, 470]], leaves: 6, size: 1.1, fill: "#263c39", opacity: 0.55 },
]

/** A pointed leaf lying along +x, base at the origin. */
const LEAF = "M0 0C12 -11 34 -13 56 0C34 13 12 11 0 0Z";

function pointAt([a, c, b]: [Point, Point, Point], t: number): Point {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

function angleAt([a, c, b]: [Point, Point, Point], t: number): number {
  const dx = 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]);
  const dy = 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function SprigShape({ sprig }: { sprig: Sprig }) {
  const [a, c, b] = sprig.stem;
  return (
    <g opacity={sprig.opacity}>
      <path d={`M${a[0]} ${a[1]}Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`} stroke="#2f4743" strokeWidth={3} fill="none" />
      {Array.from({ length: sprig.leaves }, (_, i) => {
        const t = 0.18 + (0.8 * i) / sprig.leaves;
        const [x, y] = pointAt(sprig.stem, t);
        const side = i % 2 === 0 ? -1 : 1;
        // Leaves angle away from the stem and shrink toward the tip.
        const angle = angleAt(sprig.stem, t) + side * 52;
        const scale = sprig.size * (1.15 - t * 0.55);
        return (
          <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(${scale.toFixed(2)})`}>
            <path d={LEAF} fill={sprig.fill} />
            <path d="M2 0H50" stroke="#20302e" strokeWidth={0.8} opacity={0.6} />
          </g>
        );
      })}
      {/* A final leaf at the tip, pointing along the stem. */}
      <g transform={`translate(${b[0]} ${b[1]}) rotate(${angleAt(sprig.stem, 1).toFixed(1)}) scale(${(sprig.size * 0.7).toFixed(2)})`}>
        <path d={LEAF} fill={sprig.fill} />
      </g>
    </g>
  );
}

export function HeroArt({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 800 800"
      preserveAspectRatio="xMaxYMid slice"
      className={className}
    >
      <defs>
        <radialGradient id="hero-glow" cx="70%" cy="35%" r="65%">
          <stop offset="0" stopColor="#2b3f3c" />
          <stop offset="1" stopColor="#121a19" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-hill-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3d3a" />
          <stop offset="1" stopColor="#1a2523" />
        </linearGradient>
        <linearGradient id="hero-hill-near" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#24342f" />
          <stop offset="1" stopColor="#172120" />
        </linearGradient>
        <linearGradient id="hero-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2a28" />
          <stop offset="1" stopColor="#111817" />
        </linearGradient>
        <filter id="hero-soften" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>

      <rect width="800" height="800" fill="url(#hero-glow)" />

      {/* Misty hills */}
      <path
        d="M250 800C300 650 400 610 450 520C500 430 470 330 560 270C650 210 700 250 760 170C780 140 790 110 800 90V800Z"
        fill="url(#hero-hill-far)"
        opacity="0.85"
      />
      <path d="M400 800C440 640 540 620 590 520C640 420 720 400 800 350V800Z" fill="#253834" opacity="0.5" />

      {/* Plants */}
      <g filter="url(#hero-soften)">
        {SPRIGS.map((s, i) => (
          <SprigShape key={i} sprig={s} />
        ))}
      </g>

      {/* Near slope */}
      <path d="M60 800C220 720 360 705 480 650C600 595 690 575 800 610V800Z" fill="url(#hero-hill-near)" opacity="0.9" />

      {/* Still water with soft ripples */}
      <path d="M0 800V700C200 680 520 690 800 660V800Z" fill="url(#hero-water)" />
      <g fill="none" stroke="#9fc5bd" strokeLinecap="round">
        <path d="M430 712C520 704 610 706 700 700" strokeOpacity="0.14" strokeWidth="2" />
        <path d="M500 732C580 726 660 728 760 722" strokeOpacity="0.1" strokeWidth="2" />
        <path d="M380 752C470 746 560 748 660 744" strokeOpacity="0.08" strokeWidth="2" />
        <path d="M560 772C640 768 720 768 800 764" strokeOpacity="0.07" strokeWidth="2" />
        <path d="M300 786C380 782 460 783 540 780" strokeOpacity="0.05" strokeWidth="2" />
      </g>
    </svg>
  );
}
