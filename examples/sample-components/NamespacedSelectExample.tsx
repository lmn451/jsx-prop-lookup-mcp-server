import React from 'react';

const UI = {
  Select: ({ width, options }: { width?: string | number; options: string[] }) => (
    <select style={{ width }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
};

export const Example = () => (
  <div>
    {/* Has width */}
    <UI.Select width={200} options={["a", "b"]} />

    {/* Missing width */}
    <UI.Select options={["x", "y"]} />
  </div>
);
