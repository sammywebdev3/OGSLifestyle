import type { AvatarSelection } from '@/types/player';
import { OUTFIT_COLORS, SKIN_TONES } from '@/config/game';

/** Front-facing character portrait drawn in SVG from an AvatarSelection. */
export function AvatarPreview({ avatar, size = 160 }: { avatar: AvatarSelection; size?: number }) {
  const skin = SKIN_TONES[avatar.skin].hex;
  const outfit = OUTFIT_COLORS[avatar.outfit].hex;
  const femme = avatar.body === 'femme';
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 100 125" role="img" aria-label="Character preview">
      <ellipse cx={50} cy={119} rx={26} ry={5} fill="rgba(0,0,0,0.25)" />
      {/* legs / wrapper */}
      {femme
        ? <path d="M33 78 L67 78 L71 116 L29 116 Z" fill={outfit} opacity={0.85} />
        : <><rect x={37} y={78} width={11} height={38} rx={4} fill="#2a3a5c" /><rect x={52} y={78} width={11} height={38} rx={4} fill="#2a3a5c" /></>}
      {/* torso */}
      <path d={femme ? 'M30 50 Q50 40 70 50 L67 82 L33 82 Z' : 'M28 50 Q50 40 72 50 L70 84 L30 84 Z'} fill={outfit} />
      <path d="M44 46 L50 56 L56 46" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
      {/* arms */}
      <rect x={20} y={50} width={9} height={30} rx={4.5} fill={skin} />
      <rect x={71} y={50} width={9} height={30} rx={4.5} fill={skin} />
      {/* head */}
      <rect x={45} y={38} width={10} height={8} fill={skin} />
      <ellipse cx={50} cy={28} rx={15} ry={17} fill={skin} />
      <circle cx={44} cy={28} r={1.8} fill="#111" /><circle cx={56} cy={28} r={1.8} fill="#111" />
      <path d="M45 36 Q50 39 55 36" fill="none" stroke="#3b1d0e" strokeWidth={1.5} strokeLinecap="round" />
      {avatar.headwear === 'none' && <path d="M35 24 Q50 6 65 24 Q60 14 50 13 Q40 14 35 24 Z" fill="#111" />}
      {avatar.headwear === 'fila' && <path d="M34 20 Q50 2 66 20 L66 23 L34 23 Z" fill={OUTFIT_COLORS.adire.hex} />}
      {avatar.headwear === 'cap' && <><path d="M35 20 Q50 6 65 20 L65 22 L35 22 Z" fill="#c4552d" /><path d="M58 21 L76 23 L65 25 Z" fill="#a3401d" /></>}
      {avatar.headwear === 'gele' && <path d="M30 22 Q36 2 52 6 Q70 0 72 20 Q66 14 58 18 Q50 10 40 18 Q34 16 30 22 Z" fill={OUTFIT_COLORS.palm.hex} stroke="#b98207" strokeWidth={1} />}
      {avatar.headwear === 'braids' && <><path d="M34 24 Q50 4 66 24 Q60 12 50 12 Q40 12 34 24 Z" fill="#111" /><rect x={32} y={22} width={4} height={26} rx={2} fill="#111" /><rect x={64} y={22} width={4} height={26} rx={2} fill="#111" /></>}
    </svg>
  );
}
