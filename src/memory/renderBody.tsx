// src/memory/renderBody.tsx
import { Fragment, type ReactNode } from 'react';

const TOKEN_RE = /(\*\*[^*]+\*\*|\[\[[a-z0-9][a-z0-9-]*\]\])/g;

export function renderBody(body: string, known: Set<string>, onLink: (name: string) => void): ReactNode {
  return body.split('\n').map((line, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {line.split(TOKEN_RE).map((tok, ti) => {
        if (tok.startsWith('**') && tok.endsWith('**')) {
          return <strong key={ti} style={{ color: 'var(--text)' }}>{tok.slice(2, -2)}</strong>;
        }
        if (tok.startsWith('[[') && tok.endsWith(']]')) {
          const name = tok.slice(2, -2);
          const broken = !known.has(name);
          return (
            <span
              key={ti}
              data-testid={`body-link-${name}`}
              data-broken={broken ? 'true' : 'false'}
              onClick={() => onLink(name)}
              style={{
                color: broken ? 'var(--node-failed)' : 'var(--edge-trail)',
                borderBottom: `1px dashed ${broken ? 'var(--node-failed)' : 'var(--edge-trail)'}`,
                cursor: 'pointer',
              }}
            >{name}</span>
          );
        }
        return <Fragment key={ti}>{tok}</Fragment>;
      })}
    </Fragment>
  ));
}
