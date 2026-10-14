import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { avatarDots, colors } from '../styles/brand';
import { dotIndexFor, initialsOf } from '../lib/initials';
import { copy } from '../lib/copy';
import Icon from './Icon';

const DOTS = [
  { dot: colors.sky, tint: '#E6F0FE', deep: colors.skyDeep },
  { dot: colors.coral, tint: '#FFE9ED', deep: colors.coralDeep },
  { dot: colors.teal, tint: '#E3F3F3', deep: colors.tealDeep },
  { dot: colors.yellow, tint: '#FFF8CC', deep: colors.yellowDeep },
];

/**
 * The frame every page sits in: the brand bar, the single content column, and
 * a short footer. The bar and the footer share the column's width, so on a
 * tablet or desktop the wordmark lines up with the card instead of sitting in
 * the far corner of the window.
 */
export function Shell({ children }) {
  return (
    <div className="page">
      <Brand />
      <main className="content">{children}</main>
      <footer className="site-footer">
        <p>{copy.footer}</p>
      </footer>
    </div>
  );
}

/** CloseBy wordmark with the four logo dots, as on the Flutter header. */
export function Brand({ compact = false }) {
  return (
    <header className="brand" data-compact={compact ? 'true' : 'false'}>
      <Link to="/" className="brand-inner" aria-label={copy.brand}>
        <span className="brand-dots" aria-hidden="true">
          {avatarDots.map((color) => (
            <span key={color} style={{ background: color }} />
          ))}
        </span>
        <span className="brand-text">
          <strong>{copy.brand}</strong>
          {!compact && <em>{copy.tagline}</em>}
        </span>
      </Link>
    </header>
  );
}

/** Initials circle, coloured from the name so it is stable per child. */
export function ChildAvatar({ name }) {
  const tone = DOTS[dotIndexFor(name || '?')];
  return (
    <div
      className="avatar"
      style={{ background: tone.tint, color: tone.deep, borderColor: tone.dot }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <span className="spinner-ring" aria-hidden="true" />
      <span className="spinner-label">{label}</span>
    </div>
  );
}

/**
 * Shown for a broken link, an inactive code, or a failed read. One component for
 * all three because to the person standing there they are the same thing: this
 * page cannot help you, go and find the nursery.
 */
export function MessageState({ tone = 'info', title, body, action }) {
  useEffect(() => {
    document.title = `${title} · ${copy.brand}`;
  }, [title]);

  return (
    <div className="message-state" data-tone={tone} role="alert">
      <div className="message-mark" aria-hidden="true">
        <Icon name={tone === 'error' ? 'alert' : 'info'} size={24} />
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

