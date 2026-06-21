import type { NarrativeBlock as Block } from '../../narrative/types';
import '../../theme/narrative.css';

const cls: Record<Block['status'], string> = { completed: 'done', active: 'active', upcoming: 'upcoming' };

export function NarrativeBlock({
  block, active, isNew, showDetail, onClick,
}: {
  block: Block; active: boolean; isNew: boolean; showDetail: boolean; onClick: () => void;
}) {
  const statusClass = active ? 'active' : cls[block.status];
  return (
    <div
      className={`narr-blk ${statusClass}${isNew ? ' narr-new' : ''}`}
      data-testid={`narr-block-${block.id}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
    >
      <div className="t">{block.title}{block.status === 'completed' ? ' ✓' : ''}</div>
      <div className="s">{block.summary}</div>
      {showDetail && block.detail ? <div className="s" style={{ marginTop: 4 }}>{block.detail}</div> : null}
      <div className="meta">
        {block.thoughtCount ? <span className="mc">{block.thoughtCount} Thoughts</span> : null}
        {block.toolCount ? <span className="mc">{block.toolCount} tools</span> : null}
        {block.status === 'active' ? <span className="mc">running…</span> : null}
      </div>
    </div>
  );
}
