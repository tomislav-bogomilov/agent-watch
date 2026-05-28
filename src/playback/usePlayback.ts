import { useEffect, useRef, useState } from 'react';
import type { Milestone } from '../parse/types';

export type Speed = 0.1 | 0.25 | 0.5 | 1 | 2 | 4;

export function flattenDFS(root: Milestone): Milestone[] {
  const out: Milestone[] = [];
  function walk(node: Milestone): void {
    out.push(node);
    for (const c of node.children) walk(c);
  }
  walk(root);
  return out;
}

const BASE_MS_PER_NODE = 400;

export function msPerNode(speed: Speed): number {
  return BASE_MS_PER_NODE / speed;
}

export function nextIndexMatching(
  order: Milestone[],
  from: number,
  pred: (m: Milestone) => boolean,
): number | null {
  for (let i = from + 1; i < order.length; i++) {
    if (pred(order[i])) return i;
  }
  return null;
}

export type PlaybackState = {
  order: Milestone[];
  index: number;
  edgeProgress: number;
  playing: boolean;
  speed: Speed;
  finished: boolean;
};

export type PlaybackControls = {
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeed(s: Speed): void;
  restart(): void;
  step(direction: 1 | -1): void;
  scrubTo(milestoneIndex: number): void;
};

type Position = { index: number; edgeProgress: number };

function clampPosition(p: Position, total: number): Position {
  const lastIndex = Math.max(0, total - 1);
  if (p.index >= lastIndex) return { index: lastIndex, edgeProgress: Math.min(1, p.edgeProgress) };
  if (p.index < 0) return { index: 0, edgeProgress: 0 };
  return p;
}

export function usePlayback(root: Milestone | null): { state: PlaybackState; controls: PlaybackControls } {
  const [order, setOrder] = useState<Milestone[]>([]);
  // Index and edgeProgress are bundled because the tick advancement is a
  // single computation: dt/perNode adds to edgeProgress and any overflow
  // rolls forward into index. Splitting them into two state slots forced
  // setIndex to live inside the setEdgeProgress updater, which React 18
  // StrictMode invokes twice — every overflow then advanced the index by
  // two, skipping every other node. One state, pure updater, no skipping.
  const [position, setPosition] = useState<Position>({ index: 0, edgeProgress: 0 });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(0.1);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!root) { setOrder([]); setPosition({ index: 0, edgeProgress: 0 }); setPlaying(false); return; }
    const flat = flattenDFS(root);
    setOrder(flat);
    setPosition({ index: 0, edgeProgress: 0 });
    setPlaying(false);
  }, [root]);

  useEffect(() => {
    if (!playing || order.length === 0) return;
    lastTickRef.current = null;
    const lastIndex = order.length - 1;
    function tick(now: number) {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      const perNode = BASE_MS_PER_NODE / speed;
      const delta = dt / perNode;
      setPosition((prev) => {
        const total = prev.edgeProgress + delta;
        const carry = Math.floor(total);
        const newIndex = prev.index + carry;
        // Only finalize once we'd advance PAST the last node. Landing on
        // it with edgeProgress < 1 must still register so the final node
        // shows as active during its inbound trail.
        if (newIndex > lastIndex) {
          return { index: lastIndex, edgeProgress: 1 };
        }
        return { index: newIndex, edgeProgress: total - carry };
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, order, speed]);

  useEffect(() => {
    if (order.length > 0 && position.index >= order.length - 1 && position.edgeProgress >= 0.999) {
      setPlaying(false);
    }
  }, [position.index, position.edgeProgress, order.length]);

  const controls: PlaybackControls = {
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
    setSpeed: (s) => setSpeed(s),
    restart: () => { setPosition({ index: 0, edgeProgress: 0 }); setPlaying(true); },
    step: (direction) => {
      setPlaying(false);
      setPosition((prev) => clampPosition(
        { index: prev.index + direction, edgeProgress: 0 },
        order.length,
      ));
    },
    scrubTo: (milestoneIndex) => {
      setPlaying(false);
      setPosition(clampPosition({ index: milestoneIndex, edgeProgress: 0 }, order.length));
    },
  };

  return {
    state: {
      order,
      index: position.index,
      edgeProgress: position.edgeProgress,
      playing,
      speed,
      finished: order.length > 0 && position.index >= order.length - 1 && position.edgeProgress >= 0.999,
    },
    controls,
  };
}
