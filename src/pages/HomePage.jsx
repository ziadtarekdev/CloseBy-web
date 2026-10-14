import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shell } from '../components/Chrome';
import Icon from '../components/Icon';
import QrScanner from '../components/QrScanner';
import { copy } from '../lib/copy';
import { canScanInBrowser, routeFromScannedText } from '../lib/scanLink';

/**
 * Shown when the site is opened without a code.
 *
 * Not an error page: someone who typed the address, or whose camera app opened
 * the bare domain, still has a child in front of them. The page offers the
 * three ways in — the phone's camera app (the usual one, so it comes first and
 * is spelled out step by step), the in-page scanner where the browser supports
 * it, and pasting the link — and every one of them goes through
 * routeFromScannedText, so only a CloseBy child link is ever opened.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const [link, setLink] = useState('');
  const [error, setError] = useState(null);
  const scanner = canScanInBrowser();

  const open = (route) => navigate(route);

  // The button is always enabled: a greyed-out "Open" looks broken, and a
  // press on an empty box deserves a sentence saying what to do.
  const submit = (event) => {
    event.preventDefault();
    if (link.trim() === '') {
      setError(copy.homePasteEmpty);
      return;
    }
    const route = routeFromScannedText(link, window.location.host);
    if (route === null) {
      setError(copy.homePasteInvalid);
      return;
    }
    setError(null);
    open(route);
  };

  return (
    <Shell>
      <section className="hero">
        <span className="hero-mark" aria-hidden="true">
          <Icon name="qr" size={28} />
        </span>
        <h1>{copy.homeTitle}</h1>
        <p>{copy.homeBody}</p>
      </section>

      <section className="card how" aria-labelledby="how-title">
        <h2 id="how-title">{copy.homeCameraTitle}</h2>
        <ol className="steps">
          {copy.homeSteps.map((step, index) => (
            <li key={step.icon}>
              <span className="step-mark" aria-hidden="true">
                <Icon name={step.icon} size={20} />
                <span className="step-number">{index + 1}</span>
              </span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        <p className="how-foot">{copy.homeNoApp}</p>
      </section>

      {scanner && (
        <section className="card" aria-labelledby="scan-title">
          <h2 id="scan-title" className="card-title">
            <Icon name="camera" size={18} />
            {copy.homeScanTitle}
          </h2>
          <QrScanner onRoute={open} />
        </section>
      )}

      <section className="card">
        <form className="paste" onSubmit={submit} noValidate>
          <label htmlFor="code-link" className="card-title">
            <Icon name="link" size={18} />
            {copy.homePasteTitle}
          </label>
          <p className="paste-hint" id="code-link-hint">
            {copy.homePasteHint}
          </p>
          <div className="paste-row">
            <input
              id="code-link"
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              placeholder={copy.homePastePlaceholder}
              value={link}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'code-link-hint code-link-error' : 'code-link-hint'}
              onChange={(event) => {
                setLink(event.target.value);
                if (error) setError(null);
              }}
            />
            <button type="submit" className="btn btn-primary">
              {copy.homePasteSubmit}
            </button>
          </div>
          {error && (
            <p id="code-link-error" className="field-error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </p>
          )}
        </form>
      </section>

      <section className="callout" aria-labelledby="safety-title">
        <Icon name="shield" size={22} className="callout-icon" />
        <div>
          <h2 id="safety-title">{copy.homeSafetyTitle}</h2>
          <p>{copy.homeSafetyBody}</p>
        </div>
      </section>
    </Shell>
  );
}
