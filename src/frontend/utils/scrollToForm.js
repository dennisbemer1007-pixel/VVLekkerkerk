export function scrollToForm(ref) {
  requestAnimationFrame(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
