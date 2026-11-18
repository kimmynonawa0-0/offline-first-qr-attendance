import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function EyeIcon({ open }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    {!open && <path d="m3 3 18 18" />}
  </svg>;
}

function ClipboardIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4.5V3h6v1.5" />
    <path d="M9 10h6M9 14h6" />
  </svg>;
}

export function PasswordField({ label, value, onChange, autoComplete = 'current-password', minLength, required = true, id }) {
  const [visible, setVisible] = useState(false);
  const inputId = id || `password-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <>
    <label htmlFor={inputId}>{label}</label>
    <div className="password-field">
      <input
        id={inputId}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={event => onChange(event.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
      />
      <button
        className="password-toggle"
        type="button"
        onClick={() => setVisible(current => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={String(visible)}
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  </>;
}

export function CopyBox({ value }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2200);
  }
  return <div className="copy-box">
    <code>{value}</code>
    <button type="button" className="copy-button" onClick={copy} aria-label="Copy recovery code" title="Copy recovery code">
      <ClipboardIcon />
    </button>
    {copied && <span className="copy-ok" role="status">Copied</span>}
  </div>;
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(<div
    className="modal-backdrop"
    onMouseDown={event => { if (event.target === event.currentTarget && onClose) onClose(); }}
  >
    <div className={`modal-card${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head">
        <h2>{title}</h2>
        {onClose && <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">×</button>}
      </div>
      {children}
    </div>
  </div>, document.body);
}

export function PasswordDialog({ title, message, confirmLabel = 'Confirm', danger = false, busy = false, error = '', onConfirm, onCancel }) {
  const [password, setPassword] = useState('');
  return <Modal title={title} onClose={busy ? undefined : onCancel}>
    <p>{message}</p>
    <form onSubmit={event => { event.preventDefault(); if (password) onConfirm(password); }}>
      <PasswordField label="System manager password" value={password} onChange={setPassword} autoComplete="current-password" />
      <div className={`status${error ? ' error' : ''}`} role="status">{error}</div>
      <div className="modal-actions">
        <button type="submit" className={danger ? 'danger' : undefined} disabled={busy || !password}>{busy ? 'Working…' : confirmLabel}</button>
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  </Modal>;
}

export function Status({ message }) {
  if (!message) return <div className="status" role="status" />;
  return <div className={`status${message.error ? ' error' : ''}`} role="status">{message.text}</div>;
}

export function Table({ headings, children, empty = 'No records found.' }) {
  return <div className="tablewrap"><table>
    <thead><tr>{headings.map(heading => <th key={heading}>{heading}</th>)}</tr></thead>
    <tbody>{children || <tr><td colSpan={headings.length}>{empty}</td></tr>}</tbody>
  </table></div>;
}

export function Spinner({ label = 'Loading…' }) {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}
