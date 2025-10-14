import React from "react";

interface SelectProps {
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
  width?: string | number;
  placeholder?: string;
  disabled?: boolean;
}

const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  width,
  placeholder,
  disabled,
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ width }}
      disabled={disabled}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
};

const ExampleUsage: React.FC = () => {
  return (
    <div>
      {/* This Select has width prop - GOOD */}
      <Select
        options={["Option 1", "Option 2", "Option 3"]}
        width="200px"
        placeholder="Choose an option"
      />

      {/* This Select is missing width prop - SHOULD BE FLAGGED */}
      <Select options={["A", "B", "C"]} placeholder="Select letter" />

      {/* This Select has width prop - GOOD */}
      <Select options={["Red", "Green", "Blue"]} width={150} value="Red" />

      {/* This Select is missing width prop - SHOULD BE FLAGGED */}
      <Select options={["Small", "Medium", "Large"]} disabled={true} />

      {/* This Select has spread props - ASSUMED GOOD (might contain width) */}
      <Select
        options={["X", "Y", "Z"]}
        {...{ width: "100px", placeholder: "Pick one" }}
      />
    </div>
  );
};

export default ExampleUsage;
