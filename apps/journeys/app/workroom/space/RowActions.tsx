'use client';
import { useEffect, useRef, useState } from 'react';
import { Modal, useApp } from '../../travel/ui';
import { errorText, unsupportedActionText } from './api';

export type RowActionResult = { ok: true } | { ok: false; code: string; unavailable: boolean };

type DialogKind = 'rename' | 'archive' | 'delete';

type Props = {
  kind: 'space' | 'chat';
  name: string;
  archived?: boolean;
  busy?: boolean;
  /** Each callback performs the request *and* its own refetch/navigation on success. */
  onRename: (next: string) => Promise<RowActionResult>;
  onArchived: (archived: boolean) => Promise<RowActionResult>;
  onDelete: (() => Promise<RowActionResult>) | null;
};

function menuLabel(kind: 'space' | 'chat', name: string, t: (en: string, zh: string) => string): string {
  return `${t('Actions', '操作')}: ${name}`;
}

/**
 * Row action menu for spaces and chats: rename, archive/restore and delete.
 *
 * Every mutation goes through an explicit confirmation dialog and is followed by
 * the caller's refetch (no optimistic list edits). If the PATCH/DELETE route is
 * not deployed yet the dialog reports that instead of throwing.
 */
export function RowActions({ kind, name, archived = false, busy = false, onRename, onArchived, onDelete }: Props) {
  const { t, locale, notify } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ code: string; unavailable: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const noun = kind === 'space' ? t('space', '空間') : t('chat', '對話');

  function openDialog(kindToOpen: DialogKind) {
    setMenuOpen(false);
    setError(null);
    setDraft(name);
    setDialog(kindToOpen);
  }

  async function submit() {
    if (!dialog || saving) return;
    const nextName = draft.trim();
    if (dialog === 'rename' && (nextName.length === 0 || nextName === name)) return;
    setSaving(true);
    setError(null);
    let result: RowActionResult;
    if (dialog === 'rename') result = await onRename(nextName);
    else if (dialog === 'archive') result = await onArchived(!archived);
    else result = onDelete ? await onDelete() : { ok: false, code: 'UNAVAILABLE', unavailable: true };
    setSaving(false);
    if (result.ok) {
      setDialog(null);
      notify(
        dialog === 'rename'
          ? t('Renamed', '已重新命名')
          : dialog === 'archive'
            ? archived
              ? t('Restored', '已還原')
              : t('Archived', '已封存')
            : t('Deleted', '已刪除'),
      );
      return;
    }
    setError({ code: result.code, unavailable: result.unavailable });
  }

  const dialogTitle =
    dialog === 'rename'
      ? t('Rename', '重新命名')
      : dialog === 'archive'
        ? archived
          ? t('Restore', '還原')
          : t('Archive', '封存')
        : t('Delete', '刪除');

  const confirmLabel =
    dialog === 'rename'
      ? t('Save name', '儲存名稱')
      : dialog === 'archive'
        ? archived
          ? t('Restore', '還原')
          : t('Archive', '封存')
        : t('Delete', '刪除');

  const warning =
    dialog === 'archive'
      ? kind === 'space'
        ? t('Hide this space from your list? Its chats and messages are kept.', '要從清單隱藏此空間嗎？對話及訊息會保留。')
        : t('Hide this chat from the list? Its messages are kept.', '要從清單隱藏此對話嗎？訊息會保留。')
      : kind === 'space'
        ? t('Delete this space and all of its chats? This cannot be undone.', '刪除此空間及其所有對話？此操作無法復原。')
        : t('Delete this chat and all of its messages? This cannot be undone.', '刪除此對話及其所有訊息？此操作無法復原。');

  return (
    <div className="sp-actions" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="sp-actions-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={menuLabel(kind, name, t)}
        disabled={busy}
        onClick={() => setMenuOpen((value) => !value)}
        data-testid={`${kind}-actions`}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {menuOpen && (
        <div className="sp-actions-menu" role="menu" aria-label={menuLabel(kind, name, t)} ref={menuRef}>
          <button type="button" role="menuitem" onClick={() => openDialog('rename')}>
            {t('Rename', '重新命名')}
          </button>
          <button type="button" role="menuitem" onClick={() => openDialog('archive')}>
            {archived ? t('Restore', '還原') : t('Archive', '封存')}
          </button>
          {onDelete && (
            <button type="button" role="menuitem" className="sp-danger-text" onClick={() => openDialog('delete')}>
              {t('Delete', '刪除')}
            </button>
          )}
        </div>
      )}
      {dialog && (
        <Modal
          title={`${dialogTitle} — ${name}`}
          onClose={() => setDialog(null)}
          closeDisabled={saving}
          returnFocus={triggerRef.current}
        >
          <div className="sp-dialog">
            {dialog === 'rename' ? (
              <label className="sp-field">
                <span>{t(`New ${noun} name`, `新的${noun}名稱`)}</span>
                <input
                  value={draft}
                  maxLength={kind === 'space' ? 80 : 120}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                  data-testid="rename-input"
                />
              </label>
            ) : (
              <p className="sp-dialog-text">{warning}</p>
            )}
            {error && (
              <p role="alert" className="sp-error">
                {error.unavailable ? unsupportedActionText(locale) : errorText(error.code, locale)}
              </p>
            )}
            <div className="sp-dialog-actions">
              <button type="button" className="k-btn" onClick={() => setDialog(null)} disabled={saving}>
                {t('Cancel', '取消')}
              </button>
              <button
                type="button"
                className={dialog === 'delete' ? 'k-btn sp-danger' : 'k-btn primary'}
                onClick={() => void submit()}
                disabled={saving || (dialog === 'rename' && (draft.trim().length === 0 || draft.trim() === name))}
                data-testid={`confirm-${dialog}`}
              >
                {saving ? t('Working…', '處理中…') : confirmLabel}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
