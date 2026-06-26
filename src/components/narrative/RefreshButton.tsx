import '../../theme/narrative.css';

export function RefreshButton({ building, onClick }: { building: boolean; onClick: () => void }) {
  return (
    <button className="narr-refresh" onClick={onClick} disabled={building}
      title="Rebuild from scratch · Sonnet" data-testid="narr-refresh">
      <svg className={building ? 'narr-spin' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path d="M21 12a9 9 0 1 1-2.6-6.3M21 4v5h-5" />
      </svg>
      <span>{building ? 'Rebuilding…' : 'Refresh'}</span>
    </button>
  );
}
