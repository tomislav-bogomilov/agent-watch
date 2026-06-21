import type { Verbosity } from '../../narrative/types';
import '../../theme/narrative.css';

const LEVELS: { v: Verbosity; label: string }[] = [
  { v: 'overview', label: 'Overview' }, { v: 'steps', label: 'Steps' }, { v: 'detailed', label: 'Detailed' },
];

export function VerbosityControl({ value, onChange }: { value: Verbosity; onChange: (v: Verbosity) => void }) {
  return (
    <>
      <span className="narr-vlabel">Verbosity</span>
      <div className="narr-seg" role="group" aria-label="Verbosity">
        {LEVELS.map(({ v, label }) => (
          <button key={v} className={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
