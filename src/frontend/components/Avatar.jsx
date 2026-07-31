export default function Avatar({ person, size = 'md', className = '' }) {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-base',
  };
  const box = sizes[size] || sizes.md;
  const name = person?.name || '?';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  if (person?.photoUrl) {
    return (
      <img
        src={person.photoUrl}
        alt={name}
        className={`${box} shrink-0 rounded-full object-cover border-2 border-vvl-border bg-vvl-secondary ${className}`}
      />
    );
  }

  return (
    <span
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-full border-2 border-vvl-primary bg-vvl-primary font-bold text-white ${className}`}
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}
