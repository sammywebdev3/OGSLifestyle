export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 p-6 text-sm font-semibold opacity-80">
      <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-current border-t-transparent" />
      {label}
    </div>
  );
}
