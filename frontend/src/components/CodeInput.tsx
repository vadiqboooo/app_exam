import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

const LENGTH = 6;

/** Шесть клеток для цифрового кода: автопереход, Backspace, вставка целого кода. */
export function CodeInput({
  value,
  onChange,
  label = 'Код доступа',
  autoFocus = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (index: number) => refs.current[Math.min(Math.max(index, 0), LENGTH - 1)]?.focus();
  const digits = Array.from({ length: LENGTH }, (_, index) => value[index] ?? '');

  const setDigit = (index: number, digit: string) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join('').slice(0, LENGTH));
  };
  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index]) {
      event.preventDefault();
      if (index > 0) {
        setDigit(index - 1, '');
        focus(index - 1);
      }
    } else if (event.key === 'ArrowLeft') focus(index - 1);
    else if (event.key === 'ArrowRight') focus(index + 1);
  };
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    focus(pasted.length);
  };

  return (
    <div className="code-input" role="group" aria-label={label}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          aria-label={`${label}: цифра ${index + 1}`}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          value={digit}
          onChange={(event) => {
            const typed = event.target.value.replace(/\D/g, '');
            if (!typed) return setDigit(index, '');
            setDigit(index, typed.slice(-1));
            focus(index + 1);
          }}
          onKeyDown={(event) => onKeyDown(index, event)}
          onPaste={onPaste}
          onFocus={(event) => event.target.select()}
        />
      ))}
    </div>
  );
}
