import { IsoBox, IsoTile, iso } from './iso';

/** Landing-page illustration: a Kuto street corner in isometric, drawn in code (no image assets). */
export function IsoSkyline({ className = '' }: { className?: string }) {
  const tiles = [];
  for (let x = 0; x < 9; x++) for (let y = 0; y < 9; y++) {
    const road = y === 4 || x === 5;
    tiles.push(<IsoTile key={`${x}-${y}`} x={x} y={y} fill={road ? '#3b3d46' : (x + y) % 2 ? '#d4693d' : '#c95f34'} />);
  }
  const palm = (x: number, y: number) => {
    const p = iso(x, y);
    return (
      <g key={`palm-${x}-${y}`} transform={`translate(${p.x} ${p.y})`}>
        <rect x={-1.5} y={-34} width={3} height={34} fill="#7a5230" />
        {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={0} cy={-36} rx={13} ry={3.5} fill="#2fb36f" transform={`rotate(${a} 0 -36)`} />)}
      </g>
    );
  };
  return (
    <svg viewBox="-200 -150 400 300" className={className} role="img" aria-label="An isometric street in Kuto, Abeokuta">
      <g>{tiles}</g>
      {/* road markings */}
      {[0.5, 2.5, 6.5, 8].map((x) => <IsoTile key={x} x={x} y={4.45} w={0.8} d={0.1} fill="#f2b632" />)}
      {/* apartment block with water tank */}
      <IsoBox x={0.4} y={0.4} w={2.6} d={2.4} h={78} top="#efe3c8" left="#e3d2ad" right="#f4ead2" />
      <IsoBox x={0.4} y={0.4} w={2.6} d={2.4} h={6} z={78} top="#3a4fb0" left="#1f2f6b" right="#2b3d8f" />
      <IsoBox x={1.2} y={1.0} w={0.8} d={0.8} h={18} z={84} top="#2a2b33" left="#14151a" right="#1f2026" />
      {/* shop with awning */}
      <IsoBox x={6.2} y={0.6} w={2.2} d={2.6} h={42} top="#fff6e5" left="#12935a" right="#0e7a4b" />
      <IsoBox x={6.2} y={3.2} w={2.2} d={0.5} h={4} z={30} top="#f2b632" left="#b98207" right="#d99d1c" />
      {/* mosque dome + minaret */}
      <IsoBox x={0.6} y={5.6} w={2.2} d={2.2} h={36} top="#fff6e5" left="#e7dcc4" right="#f7efde" />
      <circle cx={iso(1.7, 6.7).x} cy={iso(1.7, 6.7).y - 46} r={16} fill="#12935a" />
      <IsoBox x={2.9} y={5.6} w={0.4} d={0.4} h={74} top="#fff6e5" left="#e7dcc4" right="#f7efde" />
      {/* storey building with balconies */}
      <IsoBox x={6.0} y={5.4} w={2.6} d={2.6} h={96} top="#d9cbb0" left="#c4552d" right="#d4693d" />
      <IsoBox x={6.0} y={5.4} w={2.6} d={2.6} h={4} z={96} top="#8d9be0" left="#3a4fb0" right="#5263c6" />
      {/* danfo bus */}
      <IsoBox x={3.4} y={4.1} w={1.6} d={0.7} h={16} top="#f2b632" left="#d99d1c" right="#f7c84f" />
      <IsoBox x={3.4} y={4.1} w={1.6} d={0.7} h={3} z={8} top="#14151a" left="#14151a" right="#14151a" />
      {palm(4.2, 1.0)}
      {palm(4.4, 7.4)}
      {palm(8.6, 4.2)}
    </svg>
  );
}
