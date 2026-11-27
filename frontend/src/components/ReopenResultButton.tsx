import { useState } from 'react';
import { api, loadSession } from '../api/client';
import { useAction } from '../hooks/useAction';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';

export function ReopenResultButton({
  id,
  studentName,
  subject,
  onReopened,
  compact = false,
}: {
  id: number;
  studentName: string;
  subject: string;
  onReopened: () => Promise<void>;
  compact?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const { busy, error, run, clearError } = useAction();
  if (loadSession()?.role !== 'admin') return null;

  return (
    <>
      {compact ? (
        <button
          type="button"
          className="rs-reopen-trigger"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          На исправление
        </button>
      ) : (
        <Button variant="secondary" disabled={busy} onClick={() => setConfirming(true)}>
          Вернуть на исправление
        </Button>
      )}
      {confirming && (
        <ConfirmDialog
          title="Вернуть результат на исправление?"
          text={`${studentName} · ${subject}. Результат исчезнет из кабинета ученика. Учитель сможет изменить баллы и опубликовать работу заново.`}
          confirm="Вернуть на исправление"
          busy={busy}
          error={error}
          onClose={() => {
            setConfirming(false);
            clearError();
          }}
          onConfirm={() =>
            void run(async () => {
              await api.results.unpublish(id);
              await onReopened();
              setConfirming(false);
            })
          }
        />
      )}
    </>
  );
}
