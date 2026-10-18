import { IsoBox, IsoTile, iso } from '@/components/brand/iso';
import type { AvatarSelection } from '@/types/player';
import { OUTFIT_COLORS, SKIN_TONES } from '@/config/game';

/** The starter self-contain, drawn as an isometric cut-away room. */
export function ApartmentRoom({ avatar }: { avatar: AvatarSelection }) {
  const u = 26;
  const floor = [];
  for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) floor.push(<IsoTile key={`${x}${y}`} x={x} y={y} u={u} fill={(x + y) % 2 ? '#e9d7b4' : '#dfc9a0'} />);
  const wallL = [iso(0, 0, 0, u), iso(0, 6, 0, u), iso(0, 6, 110, u), iso(0, 0, 110, u)];
  const wallR = [iso(0, 0, 0, u), iso(6, 0, 0, u), iso(6, 0, 110, u), iso(0, 0, 110, u)];
  const poly = (p: { x: number; y: number }[]) => p.map((q) => `${q.x},${q.y}`).join(' ');
  const me = iso(3.6, 3.8, 0, u);
  return (
    <svg viewBox="-170 -130 340 270" className="w-full" role="img" aria-label="Your starter apartment">
      <polygon points={poly(wallL)} fill="#f4ead2" stroke="#d9c8a4" />
      <polygon points={poly(wallR)} fill="#efe1c2" stroke="#d9c8a4" />
      {/* window with burglary-proof bars */}
      <polygon points={poly([iso(2, 0, 45, u), iso(4, 0, 45, u), iso(4, 0, 85, u), iso(2, 0, 85, u)])} fill="#8fd3f4" stroke="#2a2b33" strokeWidth={2} />
      {[2.5, 3, 3.5].map((x) => <line key={x} x1={iso(x, 0, 45, u).x} y1={iso(x, 0, 45, u).y} x2={iso(x, 0, 85, u).x} y2={iso(x, 0, 85, u).y} stroke="#2a2b33" strokeWidth={1.5} />)}
      {/* calendar */}
      <polygon points={poly([iso(0, 2, 50, u), iso(0, 3, 50, u), iso(0, 3, 80, u), iso(0, 2, 80, u)])} fill="#fff" stroke="#12935a" strokeWidth={2} />
      {floor}
      {/* rug */}
      <IsoTile x={2} y={2.5} w={2} d={2.5} u={u} fill="#3a4fb0" />
      <IsoTile x={2.2} y={2.7} w={1.6} d={2.1} u={u} fill="#5263c6" />
      {/* bed */}
      <IsoBox x={0.2} y={0.3} w={2.2} d={1.6} h={14} u={u} top="#fff6e5" left="#7a5230" right="#8d6340" />
      <IsoBox x={0.3} y={0.4} w={1.1} d={1.4} h={4} z={14} u={u} top="#d4693d" left="#a3401d" right="#c4552d" />
      {/* standing fan */}
      <line x1={iso(5, 1, 0, u).x} y1={iso(5, 1, 0, u).y} x2={iso(5, 1, 60, u).x} y2={iso(5, 1, 60, u).y} stroke="#555" strokeWidth={3} />
      <circle cx={iso(5, 1, 66, u).x} cy={iso(5, 1, 66, u).y} r={12} fill="#cfe3f0" stroke="#3a4fb0" strokeWidth={3} />
      {/* TV stand + TV */}
      <IsoBox x={0.2} y={3.8} w={0.8} d={1.8} h={18} u={u} top="#5b3a1a" left="#3d2610" right="#4a2f15" />
      <IsoBox x={0.4} y={4.0} w={0.15} d={1.4} h={30} z={18} u={u} top="#111" left="#14151a" right="#1d2a3a" />
      {/* small table with a gas stove */}
      <IsoBox x={4.4} y={4.2} w={1.3} d={1.3} h={22} u={u} top="#c4955a" left="#8d6340" right="#a57746" />
      <IsoBox x={4.7} y={4.5} w={0.7} d={0.7} h={6} z={22} u={u} top="#ddd" left="#aaa" right="#bbb" />
      {/* you */}
      <g transform={`translate(${me.x} ${me.y})`}>
        <ellipse cx={0} cy={0} rx={10} ry={4} fill="rgba(0,0,0,0.25)" />
        <rect x={-7} y={-30} width={14} height={26} rx={5} fill={OUTFIT_COLORS[avatar.outfit].hex} />
        <circle cx={0} cy={-38} r={8} fill={SKIN_TONES[avatar.skin].hex} />
      </g>
    </svg>
  );
}
