import { codeStateLabels, type CodeState } from '../lib/accessCode';

export function CodeBadge({ state }: { state: CodeState }) {
  const { label, hint } = codeStateLabels[state];
  return (
    <span className="sc-code">
      <span className={`sc-badge sc-badge-${state}`}>{label}</span>
      {hint && <small>{hint}</small>}
    </span>
  );
}

const actionLabels: Record<CodeState, string> = {
  set: 'Сбросить код',
  lock: 'Разблокировать',
  reset: 'Ждём входа',
  first: '—',
};

export function CodeAction({
  state,
  busy,
  onReset,
  onUnlock,
}: {
  state: CodeState;
  busy?: boolean;
  onReset: () => void;
  onUnlock: () => void;
}) {
  const active = state === 'set' || state === 'lock';
  return (
    <button
      type="button"
      className={`sc-action sc-action-${state}`}
      disabled={!active || busy}
      onClick={state === 'lock' ? onUnlock : onReset}
    >
      {actionLabels[state]}
    </button>
  );
}

export function Toast({ message }: { message: string }) {
  return message ? (
    <div className="sc-toast" role="status">
      {message}
    </div>
  ) : null;
}
