import { useEffect, useRef, useState } from 'react';
import type { Milestone } from '../parse/types';

export type Speed = 0.25 | 0.5 | 1 | 2 | 4;

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

export function usePlayback(root: Milestone | null): { state: PlaybackState; controls: PlaybackControls } {
  const [order, setOrder] = useState<Milestone[]>([]);
  const [index, setIndex] = useState(0);
  const [edgeProgress, setEdgeProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!root) { setOrder([]); setIndex(0); setEdgeProgress(0); setPlaying(false); return; }
    const flat = flattenDFS(root);
    setOrder(flat);
    setIndex(0);
    setEdgeProgress(0);
    setPlaying(false);
  }, [root]);

  useEffect(() => {
    if (!playing || order.length === 0) return;
    lastTickRef.current = null;
    function tick(now: number) {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;
      const perNode = BASE_MS_PER_NODE / speed;
      setEdgeProgress((prev) => {
        const next = prev + dt / perNode;
        if (next >= 1) {
          setIndex((idx) => Math.min(idx + 1, order.length - 1));
          return 0;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, order, speed]);

  useEffect(() => {
    if (index >= order.length - 1 && edgeProgress >= 0.999) {
      setPlaying(false);
    }
  }, [index, edgeProgress, order.length]);

  const controls: PlaybackControls = {
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
    setSpeed: (s) => setSpeed(s),
    restart: () => { setIndex(0); setEdgeProgress(0); setPlaying(true); },
    step: (direction) => {
      setPlaying(false);
      setEdgeProgress(0);
      if (direction === 1) {
        setIndex((i) => Math.min(i + 1, Math.max(0, order.length - 1)));
      } else {
        setIndex((i) => Math.max(0, i - 1));
      }
    },
    scrubTo: (milestoneIndex) => {
      setPlaying(false);
      setEdgeProgress(0);
      setIndex(Math.max(0, Math.min(milestoneIndex, Math.max(0, order.length - 1))));
    },
  };

  return {
    state: {
      order, index, edgeProgress, playing, speed,
      finished: order.length > 0 && index >= order.length - 1 && edgeProgress >= 0.999,
    },
    controls,
  };
}
