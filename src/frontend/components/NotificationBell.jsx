import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../hooks/useApi.js';

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'zojuist';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} u`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');
  const rootRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setItems(data.items || []);
      setUnreadCount(data.unreadCount || 0);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const hasNew = unreadCount > 0;

  const markAll = async () => {
    try {
      await api.markAllNotificationsRead();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const openItem = async (item) => {
    try {
      if (item.unread) await api.markNotificationRead(item.id);
      await load();
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={hasNew ? `${unreadCount} nieuwe notificaties` : 'Notificaties'}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
          hasNew
            ? 'border-vvl-gold bg-vvl-gold/20 text-vvl-gold notification-bell-pulse'
            : 'border-white/50 text-white hover:bg-white/10'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z" />
        </svg>
        {hasNew ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-vvl-gold px-1 text-[10px] font-black text-vvl-primary">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-sm border border-vvl-border bg-white text-vvl-primary shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-vvl-border bg-vvl-secondary px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wide">Notificaties</p>
            {hasNew ? (
              <button
                type="button"
                className="text-[10px] font-bold uppercase text-vvl-accent hover:underline"
                onClick={markAll}
              >
                Alles gelezen
              </button>
            ) : null}
          </div>
          {error ? <p className="px-3 py-2 text-xs text-red-700">{error}</p> : null}
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-600">Geen notificaties.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-vvl-border">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.link || '/ruilen'}
                    onClick={() => openItem(item)}
                    className={`block px-3 py-3 text-left transition hover:bg-vvl-muted ${
                      item.unread ? 'bg-amber-50/70' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold uppercase text-vvl-accent">{item.title}</p>
                      <span className="shrink-0 text-[10px] text-gray-500">{timeAgo(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-800">{item.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
