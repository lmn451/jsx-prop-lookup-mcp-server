import React from 'react';

type Props = {
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
};

// Arrow function with identifier parameter
export const ArrowWithIdentifier: React.FC<Props> = (p) => {
  const handle = () => {
    if (p.onClick) p.onClick();
  };
  return (
    <button disabled={p.disabled} onClick={handle}>{p.label}</button>
  );
};

// Function declaration with non-"props" parameter name
export function FuncWithIdentifier(buttonProps: Props) {
  return (
    <button disabled={buttonProps.disabled} onClick={buttonProps.onClick}>
      {buttonProps.label}
    </button>
  );
}
