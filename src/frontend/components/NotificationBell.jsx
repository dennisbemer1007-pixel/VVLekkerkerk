import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const panelRef = useRef(null);

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
      const target = e.target;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
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
        title="Ruilverzoeken. Bijvoorbeeld: iemand vraagt of jij een dienst wilt overnemen."
        aria-label={hasNew ? `${unreadCount} ruilverzoeken` : 'Ruilverzoeken'}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className={`relative inline-flex h-11 w-11 items-center justify-center rounded-sm border transition ${
          hasNew
            ? 'border-white bg-white/15 text-white notification-bell-pulse'
            : 'border-white/40 text-white/85 hover:bg-white/10 hover:text-white'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z" />
        </svg>
        {hasNew && unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-white px-1 text-[10px] font-black text-vvl-primary">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              data-testid="notification-panel"
              role="dialog"
              aria-label="Ruilverzoeken"
              className="fixed left-2 right-2 top-16 z-50 flex max-h-[min(28rem,calc(100dvh-9rem))] w-auto max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-sm border border-vvl-border bg-white text-vvl-primary shadow-lg md:left-auto md:right-4 md:w-[22rem] md:max-w-[min(22rem,calc(100vw-2rem))]"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-vvl-border bg-vvl-secondary px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-wide">Ruilverzoeken</p>
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
              {error ? <p className="shrink-0 px-3 py-2 text-xs text-red-700">{error}</p> : null}
              {items.length === 0 ? (
                <p className="px-3 py-4 text-sm text-gray-600">
                  Nog geen ruilverzoeken. Een voorbeeld: Lisa vraagt of jij haar bardienst van zaterdag wilt overnemen.
                </p>
              ) : (
                <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-vvl-border">
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
                          <p className="min-w-0 text-xs font-bold uppercase text-vvl-accent">{item.title}</p>
                          <span className="shrink-0 text-[10px] text-gray-500">{timeAgo(item.createdAt)}</span>
                        </div>
                        <p className="mt-1 break-words text-sm text-gray-800">{item.body}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
