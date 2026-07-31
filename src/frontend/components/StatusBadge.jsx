import { statusLabel, statusStyles } from '../utils/formatDate.js';

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusStyles(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}
