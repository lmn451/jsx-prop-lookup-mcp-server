import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const testDataDir = 'test-data';

const setup = async () => {
  // Create directory structure
  const dirs = [
    'simple-components',
    'complex-components', 
    'edge-cases',
    'typescript-interfaces',
    'problematic-files'
  ];

  dirs.forEach(dir => {
    mkdirSync(join(testDataDir, dir), { recursive: true });
  });

  // Create test files
  const testFiles = {
    // Simple components
    'simple-components/Button.tsx': `
import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={'btn btn-' + variant}
    >
      {children}
    </button>
  );
};

export default Button;
`,

  'simple-components/Input.jsx': `
import React from 'react';

const Input = ({ value, onChange, placeholder, type = 'text' }) => {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="form-input"
    />
  );
};

export default Input;
`,

  'simple-components/Card.js': `
import React from 'react';

function Card({ title, children, footer, className }) {
  return (
    <div className={'card ' + (className || '')}>      {title && <div className="card-header">{title}</div>}      <div className="card-body">{children}</div>      {footer && <div className="card-footer">{footer}</div>}    </div>
  );
};

export default Card;
`,

  // Complex components
  'complex-components/Select.tsx': `
import React from 'react';

interface SelectProps {
  options: Array<{ value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
  width?: string | number;
  placeholder?: string;
  disabled?: boolean;
  multiple?: boolean;
}

const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  width,
  placeholder,
  disabled,
  multiple,
  ...rest
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      multiple={multiple}
      style={{ width }}
      {...rest}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

// Usage examples - some missing width prop
const SelectExamples = () => (
  <div>
    {/* Has width - GOOD */}
    <Select
      options={[{value: 'a', label: 'A'}]}
      width="200px"
    />

    {/* Missing width - SHOULD BE FLAGGED */}
    <Select
      options={[{value: 'b', label: 'B'}]}
      placeholder="Choose..."
    />

    {/* Has width - GOOD */}
    <Select
      options={[{value: 'c', label: 'C'}]}
      width={150}
      disabled
    />

    {/* Missing width - SHOULD BE FLAGGED */}
    <Select
      options={[{value: 'd', label: 'D'}]}
      multiple
    />
  </div>
);

export default Select;
`,

  'complex-components/DataTable.tsx': `
import React from 'react';

interface Column {
  key: string;
  title: string;
  width?: number;
  render?: (value: any, record: any) => React.ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  loading?: boolean;
  onRowClick?: (record: any) => void;
  className?: string;
}

const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  loading,
  onRowClick,
  className
}) => {
  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <table className={'data-table ' + (className || '')}>      <thead>
        <tr>
          {columns.map(col => (
            <th key={col.key} style={{ width: col.width }}>
              {col.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((record, index) => (
          <tr key={index} onClick={() => onRowClick?.(record)}>
            {columns.map(col => (
              <td key={col.key}>
                {col.render ? col.render(record[col.key], record) : record[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default DataTable;
`,

  // Edge cases
  'edge-cases/EmptyComponent.tsx': `
import React from 'react';

const EmptyComponent: React.FC = () => {
  return null;
};

export default EmptyComponent;
`,

  'edge-cases/NoProps.jsx': `
import React from 'react';

const NoProps = () => <div>No props here</div>;

export default NoProps;
`,

  'edge-cases/OnlySpread.tsx': `
import React from 'react';

const OnlySpread = (props) => {
  return <div {...props}>Spread only</div>;
};

export default OnlySpread;
`,

  // TypeScript interfaces
  'typescript-interfaces/PropsWithInterface.tsx': `
import React from 'react';

interface BaseProps {
  id?: string;
  className?: string;
}

interface ModalProps extends BaseProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  id,
  className
}) => {
  if (!isOpen) return null;

  return (
    <div id={id} className={'modal modal-' + size + ' ' + (className || '')}>      <div className="modal-content">        {title && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button onClick={onClose}>×</button>
          </div>
        )}        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
`,

  // Problematic files
  'problematic-files/SyntaxError.jsx': `
import React from 'react';

const SyntaxError = ({ prop1, prop2 }) => {
  return (
    <div>
      <p>This file has a syntax error</p>
      <span>Missing closing tag
    </div>
  );
};

export default SyntaxError;
`,

  'problematic-files/InvalidJSX.tsx': `
import React from 'react';

const InvalidJSX = () => {
  return (
    <div>
      <Component prop={unclosedBrace />
      <AnotherComponent>
        <NestedComponent prop="value"
      </AnotherComponent>
    </div>
  );
};
`
  };

  // Write all test files
  Object.entries(testFiles).forEach(([filePath, content]) => {
    const fullPath = join(testDataDir, filePath);
    writeFileSync(fullPath, content.trim());
    console.log('Created: ' + fullPath);
  });

  // Create problematic directory (named like a file)
  mkdirSync(join(testDataDir, 'edge-cases', 'Contents.js'), { recursive: true });
  console.log('Created problematic directory: test-data/edge-cases/Contents.js/');

  // Create a binary file to test non-text file handling
  writeFileSync(join(testDataDir, 'problematic-files', 'BinaryFile.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47]));
  console.log('Created binary file: test-data/problematic-files/BinaryFile.png');

  console.log('\n✅ Test data setup complete!');
  console.log('\nTest data structure:');
  console.log('test-data/');
  console.log('├── simple-components/ (3 files)');
  console.log('├── complex-components/ (2 files)');
  console.log('├── edge-cases/ (3 files + problematic directory)');
  console.log('├── typescript-interfaces/ (1 file)');
  console.log('└── problematic-files/ (3 files)');
};

export default setup;