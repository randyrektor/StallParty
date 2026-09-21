import { useMemo } from 'react';
import { encode } from 'uqr';

export function QrCode({
  value,
  size = 180,
  label,
}: {
  value: string;
  size?: number;
  label: string;
}) {
  const { path, modules } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    for (let y = 0; y < qr.size; y++) {
      const row = qr.data[y]!;
      for (let x = 0; x < qr.size; x++) {
        if (row[x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { path: d, modules: qr.size };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      style={{
        display: 'block',
        margin: '0 auto 12px',
        background: '#fff',
        borderRadius: 8,
      }}
    >
      <rect width={modules} height={modules} fill="#fff" />
      <path d={path} fill="#111" />
    </svg>
  );
}
