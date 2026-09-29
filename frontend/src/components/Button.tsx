import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ReactNode;
};
export function Button({
  variant = 'primary',
  icon,
  children,
  className = '',
  type = 'button',
  ...props
}: Props) {
  return (
    <button type={type} className={`button button-${variant} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  );
}
