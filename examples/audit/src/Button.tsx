/** A small action button used by the audit examples. */
export interface ButtonProps {
  /** Accessible text displayed by the button. */
  label: string;
  /** @deprecated Use a design-system appearance token instead. */
  variant?: string;
  disabled?: boolean;
}

export function Button({ label, disabled = false }: ButtonProps) {
  return <button disabled={disabled}>{label}</button>;
}
