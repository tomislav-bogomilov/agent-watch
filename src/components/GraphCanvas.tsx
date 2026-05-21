import { useMemo } from 'react';
import { layoutTree } from '../graph/layout';
import { GraphDefs } from '../theme/Filters';
import { NodeShape } from './NodeShape';
import { EdgePath } from './EdgePath';
import type { Session } from '../parse/types';

type Props = { session: Session };

export function GraphCanvas({ session }: Props) {
  const layout = useMemo(() => layoutTree(session.root), [session]);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ display: 'block' }}
    >
      <GraphDefs />
      {layout.edges.map((e) => (
        <EdgePath key={`${e.sourceId}->${e.targetId}`} edge={e} state="idle" progress={0} inSubagent={false} />
      ))}
      {layout.nodes.map((n) => (
        <NodeShape key={n.id} node={n} state="idle" inSubagent={false} />
      ))}
    </svg>
  );
}
