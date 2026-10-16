/** Предупреждение для ученика, чья заявка ещё не подтверждена администратором. */
export function PendingNote({ className = '' }: { className?: string }) {
  return (
    <p className={`pending-note ${className}`} role="note">
      <b>Запись станет активной</b> после того, как с вами свяжется администратор.
    </p>
  );
}
