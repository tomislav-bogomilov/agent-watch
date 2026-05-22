import { useCallback } from 'react';

type Side = 'right' | 'left';

type Props = {
  side: Side;
  onResize: (delta: number) => void;
  testId?: string;
};

export function ResizeHandle({ side, onResize, testId }: Props) {
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    let lastX = startX;
    const move = (ev: MouseEvent) => {
      const rawDelta = ev.clientX - lastX;
      lastX = ev.clientX;
      const signed = side === 'right' ? rawDelta : -rawDelta;
      onResize(signed);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [side, onResize]);

  const style: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 6,
    cursor: 'col-resize',
    zIndex: 10,
    background: 'transparent',
    [side === 'right' ? 'right' : 'left']: -3,
  };

  return (
    <div
      data-testid={testId ?? `resize-handle-${side}`}
      onMouseDown={handleMouseDown}
      style={style}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
