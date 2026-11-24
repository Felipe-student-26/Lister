import type { Num } from '../lib/metrics';

const W = 560;
const H = 200;
const PAD = { l: 36, r: 12, t: 12, b: 28 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function Axes({ max, unit, labels, step }: { max: number; unit: string; labels: string[]; step: number }) {
  const ih = H - PAD.t - PAD.b;
  const iw = W - PAD.l - PAD.r;
  return (
    <>
      {[0, 0.5, 1].map((f) => {
        const y = PAD.t + ih * (1 - f);
        return (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} className="stroke-brand-200" strokeDasharray={f ? '3 4' : undefined} />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" className="fill-brand-500 text-[10px]">
              {Math.round(max * f * 10) / 10}
              {f === 1 ? unit : ''}
            </text>
          </g>
        );
      })}
      {labels.map((l, i) =>
        i % step === 0 ? (
          <text
            key={i}
            x={PAD.l + (iw / labels.length) * (i + 0.5)}
            y={H - 8}
            textAnchor="middle"
            className="fill-brand-500 text-[10px]"
          >
            {l}
          </text>
        ) : null,
      )}
    </>
  );
}

export function BarChart({
  values,
  labels,
  unit = '',
  max,
  label,
}: {
  values: Num[];
  labels: string[];
  unit?: string;
  max?: number;
  label: string;
}) {
  const top = max ?? niceMax(Math.max(0, ...values.map((v) => v ?? 0)));
  const ih = H - PAD.t - PAD.b;
  const iw = W - PAD.l - PAD.r;
  const slot = iw / values.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      <Axes max={top} unit={unit} labels={labels} step={Math.ceil(values.length / 8)} />
      {values.map((v, i) => {
        const x = PAD.l + slot * i + slot * 0.2;
        if (v === null) {
          // valor nulo: marca discreta en la base
          return <rect key={i} x={x} y={PAD.t + ih - 2} width={slot * 0.6} height={2} rx={1} className="fill-clay-400" />;
        }
        const h = Math.max(2, (v / top) * ih);
        return <rect key={i} x={x} y={PAD.t + ih - h} width={slot * 0.6} height={h} rx={6} className="fill-brand-500" />;
      })}
    </svg>
  );
}

export function LineChart({
  values,
  labels,
  unit = '',
  label,
}: {
  values: Num[];
  labels: string[];
  unit?: string;
  label: string;
}) {
  const valid = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  const top = niceMax(Math.max(0, ...valid));
  const ih = H - PAD.t - PAD.b;
  const iw = W - PAD.l - PAD.r;
  const slot = iw / values.length;
  const pt = (i: number, v: number) => [PAD.l + slot * (i + 0.5), PAD.t + ih * (1 - v / top)] as const;

  // la línea se corta en los nulos (no se interpola dato inventado)
  const segments: string[] = [];
  let cur: string[] = [];
  values.forEach((v, i) => {
    if (v === null || Number.isNaN(v)) {
      if (cur.length) segments.push(cur.join(' '));
      cur = [];
    } else {
      const [x, y] = pt(i, v);
      cur.push(`${cur.length ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
  });
  if (cur.length) segments.push(cur.join(' '));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      <Axes max={top} unit={unit} labels={labels} step={Math.ceil(values.length / 8)} />
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="stroke-brand-600" />
      ))}
      {values.map((v, i) =>
        v === null || Number.isNaN(v) ? (
          <circle key={i} cx={pt(i, 0)[0]} cy={PAD.t + ih} r={3} className="fill-clay-400" />
        ) : (
          <circle key={i} cx={pt(i, v)[0]} cy={pt(i, v)[1]} r={4} className="fill-white stroke-brand-600" strokeWidth={2.5} />
        ),
      )}
    </svg>
  );
}
