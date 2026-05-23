import { useState } from 'react';
import type { CSSProperties, ReactNode, MouseEvent } from 'react';
import { getItemStyle, type ItemVariant } from './itemStyle';

type Props = {
  variant: ItemVariant;
  selected: boolean;
  onClick?: (e: MouseEvent<HTMLLIElement>) => void;
  testId?: string;
  children: ReactNode;
};

const DEFAULT_BRACKET_SIZE = 9;
const BRACKET_GLOW = '0 0 6px rgba(0,229,255,0.55)';
const BRACKET_COLOR = 'var(--edge-trail)';

function bracket(pos: 'tl' | 'tr' | 'bl' | 'br', size: number): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
    boxShadow: BRACKET_GLOW,
  };
  if (pos === 'tl') return { ...base, top: -1, left: -1, borderTop: `1px solid ${BRACKET_COLOR}`, borderLeft: `1px solid ${BRACKET_COLOR}` };
  if (pos === 'tr') return { ...base, top: -1, right: -1, borderTop: `1px solid ${BRACKET_COLOR}`, borderRight: `1px solid ${BRACKET_COLOR}` };
  if (pos === 'bl') return { ...base, bottom: -1, left: -1, borderBottom: `1px solid ${BRACKET_COLOR}`, borderLeft: `1px solid ${BRACKET_COLOR}` };
  return { ...base, bottom: -1, right: -1, borderBottom: `1px solid ${BRACKET_COLOR}`, borderRight: `1px solid ${BRACKET_COLOR}` };
}

export function ItemShell({ variant, selected, onClick, testId, children }: Props) {
  const [hover, setHover] = useState(false);
  const style = getItemStyle(variant);
  const inner: CSSProperties = {
    ...style.inner,
    ...(hover && !selected ? style.hover : {}),
    ...(selected ? style.selected : {}),
  };
  return (
    <li
      style={style.outer}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      data-testid={testId}
    >
      <div style={inner}>
        {children}
        {selected && style.brackets && (() => {
          const sz = style.bracketSize ?? DEFAULT_BRACKET_SIZE;
          return (
            <>
              <span style={bracket('tl', sz)} />
              <span style={bracket('tr', sz)} />
              <span style={bracket('bl', sz)} />
              <span style={bracket('br', sz)} />
            </>
          );
        })()}
      </div>
    </li>
  );
}