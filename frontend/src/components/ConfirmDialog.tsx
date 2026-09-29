import { Button } from './Button';
import { ErrorNotice } from './ErrorNotice';
import { Modal } from './Modal';

export function ConfirmDialog({
  title,
  text,
  confirm = 'Подтвердить',
  onConfirm,
  onClose,
  busy,
  danger = false,
  error,
}: {
  title: string;
  text: string;
  confirm?: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  danger?: boolean;
  error?: string;
}) {
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <div className="modal-body">
        <ErrorNotice message={error} />
        <p>{text}</p>
      </div>
      <div className="modal-footer">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Подождите…' : confirm}
        </Button>
      </div>
    </Modal>
  );
}
