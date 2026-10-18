import { IsoBox } from './iso';

/** OGUN STATE LIFESTYLE wordmark: an isometric house block with an adire-blue roof. */
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-26 -30 52 52" aria-hidden="true">
      <IsoBox x={-0.6} y={-0.6} w={1.2} d={1.2} h={16} u={18} top="#f2b632" left="#0e7a4b" right="#12935a" />
      <IsoBox x={-0.6} y={-0.6} w={1.2} d={1.2} h={5} z={16} u={18} top="#3a4fb0" left="#1f2f6b" right="#2b3d8f" />
      <circle cx={0} cy={-27} r={2} fill="#fff6e5" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={compact ? 34 : 44} />
      <span className="flex flex-col leading-none">
        <span className={`font-display font-black tracking-tight ${compact ? 'text-lg' : 'text-2xl'}`}>
          OGUN STATE
        </span>
        <span className={`font-display font-bold tracking-[0.32em] text-palm-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>LIFESTYLE</span>
      </span>
    </span>
  );
}
