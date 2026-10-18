'use client';

interface Option<T extends string> { value: T; label: string; swatch?: string }

/** Accessible radio-group of chips or colour swatches. */
export function OptionPicker<T extends string>({ legend, name, options, value, onChange }: {
  legend: string; name: string; options: Option<T>[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label key={o.value} className={`cursor-pointer select-none rounded-full text-sm font-semibold ring-2 transition ${on ? 'ring-ogun-500' : 'ring-transparent hover:ring-ink/20'} ${o.swatch ? 'p-1' : 'bg-white px-3 py-1.5'}`}>
              <input type="radio" name={name} value={o.value} checked={on} onChange={() => onChange(o.value)} className="sr-only" />
              {o.swatch
                ? <span className="block h-8 w-8 rounded-full ring-1 ring-black/15" style={{ background: o.swatch }} title={o.label} aria-label={o.label} />
                : o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
