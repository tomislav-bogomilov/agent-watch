import { useEffect, useRef, useState } from 'react';
import type { Milestone } from '../parse/types';

export type Speed = 1 | 2 | 4;

export function flattenDFS(root: Milestone): Milestone[] {
  const out: Milestone[] = [];
  function walk(node: Milestone): void {
    out.push(node);
    for (const c of node.children) walk(c);
  }
  walk(root);
  return out;
}

const BASE_MS_PER_NODE = 200;

export type PlaybackState = {
  order: Milestone[];
  index: number;     // index of "current" milestone (head of trail)
  edgeProgress: number; // 0..1 progress of the trail along the edge into the current node
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
};

export function usePlayback(root: Milestone | null): { state: PlaybackState; controls: PlaybackControls } {
  const [order, setOrder] = useState<Milestone[]>([]);
  const [index, setIndex] = useState(0);
  const [edgeProgress, setEdgeProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!root) { setOrder([]); setIndex(0); setEdgeProgress(0); return; }
    const flat = flattenDFS(root);
    setOrder(flat);
    setIndex(0);
    setEdgeProgress(0);
    setPlaying(true);
  }, [root]);

  useEffect(() => {
    if (!playing || order.length === 0) return;
    lastTickRef.current = null;
    function tick(now: number) {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      const msPerNode = BASE_MS_PER_NODE / speed;
      setEdgeProgress((prev) => {
        const next = prev + dt / msPerNode;
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
  };

  return {
    state: {
      order, index, edgeProgress, playing, speed,
      finished: order.length > 0 && index >= order.length - 1 && edgeProgress >= 0.999,
    },
    controls,
  };
}
