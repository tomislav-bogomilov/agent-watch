import { useState } from 'react';
import type { CSSProperties, ReactNode, MouseEvent } from 'react';
import { ITEM_STYLE } from './itemStyle';

type Props = {
  selected: boolean;
  onClick?: (e: MouseEvent<HTMLLIElement>) => void;
  testId?: string;
  children: ReactNode;
};

const BRACKET_SIZE = 9;
const BRACKET_GLOW = '0 0 6px rgba(0,229,255,0.55)';
const BRACKET_COLOR = 'var(--edge-trail)';

function bracket(pos: 'tl' | 'tr' | 'bl' | 'br'): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    width: BRACKET_SIZE,
    height: BRACKET_SIZE,
    pointerEvents: 'none',
    boxShadow: BRACKET_GLOW,
  };
  if (pos === 'tl') return { ...base, top: -1, left: -1, borderTop: `1px solid ${BRACKET_COLOR}`, borderLeft: `1px solid ${BRACKET_COLOR}` };
  if (pos === 'tr') return { ...base, top: -1, right: -1, borderTop: `1px solid ${BRACKET_COLOR}`, borderRight: `1px solid ${BRACKET_COLOR}` };
  if (pos === 'bl') return { ...base, bottom: -1, left: -1, borderBottom: `1px solid ${BRACKET_COLOR}`, borderLeft: `1px solid ${BRACKET_COLOR}` };
  return { ...base, bottom: -1, right: -1, borderBottom: `1px solid ${BRACKET_COLOR}`, borderRight: `1px solid ${BRACKET_COLOR}` };
}

export function ItemShell({ selected, onClick, testId, children }: Props) {
  const [hover, setHover] = useState(false);
  const inner: CSSProperties = {
    ...ITEM_STYLE.inner,
    ...(hover && !selected ? ITEM_STYLE.hover : {}),
    ...(selected ? ITEM_STYLE.selected : {}),
  };
  return (
    <li
      style={ITEM_STYLE.outer}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      data-testid={testId}
    >
      <div style={inner}>
        {children}
        {selected && (
          <>
            <span style={bracket('tl')} />
            <span style={bracket('tr')} />
            <span style={bracket('bl')} />
            <span style={bracket('br')} />
          </>
        )}
      </div>
    </li>
  );
}