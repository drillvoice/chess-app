export function formatRelativeDue(iso: string | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const days = Math.ceil(ms / 86_400_000);
  if (days >= 1) return `${days}d`;
  return `${Math.max(1, Math.ceil(ms / 3_600_000))}h`;
}
