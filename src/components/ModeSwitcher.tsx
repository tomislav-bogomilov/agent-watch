import type { ReactElement } from 'react';
import type { LibraryMode } from './library/LibraryPanel';

type Props = {
  mode: LibraryMode;
  onModeChange: (m: LibraryMode) => void;
};

function SessionsIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" aria-hidden>
      <path d="M8 2 14 5 8 8 2 5Z" />
      <path d="M2 8 8 11 14 8" />
      <path d="M2 11 8 14 14 11" />
    </svg>
  );
}

function PromptsIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4 6.5 8 3 12" />
      <path d="M8 12 13 12" />
    </svg>
  );
}

function UsageIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
      <path d="M3 13 3 9" />
      <path d="M8 13 8 4" />
      <path d="M13 13 13 7" />
    </svg>
  );
}

function MemoryIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M6 18a4 4 0 0 1-2-.5" />
      <path d="M20 17.5a4 4 0 0 1-2 .5" />
    </svg>
  );
}

const TABS: ReadonlyArray<{ value: LibraryMode; label: string; Icon: () => ReactElement }> = [
  { value: 'sessions', label: 'Sessions', Icon: SessionsIcon },
  { value: 'prompts', label: 'Prompts', Icon: PromptsIcon },
  { value: 'usage', label: 'Usage', Icon: UsageIcon },
  { value: 'memory', label: 'Memory', Icon: MemoryIcon },
];

export function ModeSwitcher({ mode, onModeChange }: Props) {
  return (
    <>
      {/* role="tablist" of role="tab" buttons; aria-controls/tabpanel wiring is deferred — the main views are not yet marked up as tabpanels. */}
      <div role="tablist" aria-label="library mode" data-testid="mode-switcher" style={navStyle}>
        {TABS.map(({ value, label, Icon }) => {
          const active = value === mode;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={label}
              title={label}
              data-testid={`mode-tab-${value}`}
              className={active ? 'tg-modetab tg-modetab--active' : 'tg-modetab'}
              onClick={() => onModeChange(value)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

const navStyle = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: 7,
  justifySelf: 'center' as const,
};
