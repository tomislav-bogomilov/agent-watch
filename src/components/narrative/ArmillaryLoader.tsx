import '../../theme/narrative.css';

export function ArmillaryLoader({ label = 'Re-reading transcript' }: { label?: string }) {
  return (
    <div className="narr-loader" role="status" aria-live="polite">
      <div className="narr-gyro" aria-hidden>
        <div className="narr-ring r1" /><div className="narr-ring r2" /><div className="narr-ring r3" />
        <div className="narr-core" />
      </div>
      <div className="cap">{label}</div>
    </div>
  );
}
