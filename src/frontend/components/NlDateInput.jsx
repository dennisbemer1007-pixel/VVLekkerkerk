import { useEffect, useState } from 'react';

export function isoToNl(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}

export function nlToIso(text) {
  const match = String(text || '').trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return '';
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3];
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return '';
  }
  return `${year}-${month}-${day}`;
}

/** Tekstveld in dd-mm-jjjj. De waarde naar buiten blijft jjjj-mm-dd. */
export default function NlDateInput({ value = '', onChange, ariaLabel, placeholder = 'dd-mm-jjjj', className = '' }) {
  const [text, setText] = useState(isoToNl(value));

  useEffect(() => {
    setText(isoToNl(value));
  }, [value]);

  return (
    <input
      lang="nl"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`vvl-input ${className}`}
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (!next.trim()) {
          onChange('');
          return;
        }
        const iso = nlToIso(next);
        if (iso) onChange(iso);
      }}
    />
  );
}
