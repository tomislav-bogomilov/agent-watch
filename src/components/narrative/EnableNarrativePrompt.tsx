import '../../theme/narrative.css';

export function EnableNarrativePrompt({ onEnable, error }: { onEnable: () => void; error: string | null }) {
  return (
    <div className="narr-enable">
      <div className="why">
        Turn the execution graph into a short, plain-language story of what the agent is doing.
        <br />This runs a local <code>claude -p</code> and uses your Claude subscription.
      </div>
      <button onClick={onEnable} data-testid="narr-enable">Enable narrative analysis</button>
      {error ? <div className="err">{error}</div> : null}
    </div>
  );
}
