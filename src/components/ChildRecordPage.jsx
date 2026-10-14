import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { copy } from '../lib/copy';
import { REPORT, STATUS, useChildProfile } from '../hooks/useChildProfile';
import { ChildAvatar, MessageState, Shell, Spinner } from './Chrome';
import Icon from './Icon';

/** "14:05" — when a report was sent, in the finder's own clock. */
const clock = (date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The way back in from a dead-end screen. */
const scanAgain = (
  <Link className="btn btn-secondary message-action" to="/">
    {copy.scanAnother}
  </Link>
);

/**
 * The page a scanned QR code opens.
 *
 * Shared by both link shapes, because the person standing at the gate does not
 * care which one they scanned: `/child?uid=..&id=..` and the legacy
 * `/c/{token}` differ only in how the document id was recovered from the URL,
 * which each route does before handing it in here.
 *
 * Laid out in the order a finder needs it: who the child is, the one action
 * that tells the nursery, how to call them, then what to do while waiting.
 */
export default function ChildRecordPage({ profileId }) {
  const {
    status,
    profile,
    report,
    reportInFlight,
    reportFound,
    reportSlow,
    previouslySentAt,
    reload,
  } = useChildProfile(profileId);

  // The title is what a finder sees in the tab strip or in their app switcher
  // when the page loads in the background, so it names the child as soon as the
  // name is known rather than showing the generic wordmark.
  useEffect(() => {
    document.title = profile?.name && profile.name.trim()
      ? `${profile.name} · ${copy.brand}`
      : `${copy.brand}`;
  }, [profile?.name]);

  if (status === STATUS.invalidLink) {
    return (
      <Shell>
        <MessageState
          title={copy.invalidLinkTitle}
          body={copy.invalidLinkBody}
          action={scanAgain}
        />
      </Shell>
    );
  }

  if (status === STATUS.missing) {
    return (
      <Shell>
        <MessageState
          tone="error"
          title={copy.notFoundTitle}
          body={copy.notFoundBody}
          action={scanAgain}
        />
      </Shell>
    );
  }

  if (status === STATUS.error) {
    return (
      <Shell>
        <MessageState
          tone="error"
          title={copy.errorTitle}
          body={copy.errorBody}
          action={
            <button type="button" className="btn btn-primary message-action" onClick={reload}>
              {copy.reportRetry}
            </button>
          }
        />
      </Shell>
    );
  }

  if (status === STATUS.loading || !profile) {
    return (
      <Shell>
        <Spinner label={copy.loading} />
      </Shell>
    );
  }

  const hasPhone = profile.nurseryPhone !== '';

  return (
    <Shell>
      <article className="card child-card" aria-labelledby="child-name">
        <div className="card-head">
          <ChildAvatar name={profile.name} />
          <div className="card-identity">
            {/* A snapshot with no name is unusual but possible — the Flutter app
                writes `data['name'] ?? ''`. An empty <h1> would read as a broken
                page, so the identity block falls back to wording rather than a
                blank. */}
            <h1 id="child-name">{profile.name !== '' ? profile.name : copy.unknownChild}</h1>
            {(profile.age !== null || profile.group !== '') && (
              <p className="card-meta">
                {profile.age !== null && <span>{copy.ageLabel(profile.age)}</span>}
                {profile.group !== '' && (
                  <span>
                    <span className="visually-hidden">{copy.groupLabel}: </span>
                    {profile.group}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {profile.notes !== '' && (
          <section className="note" aria-labelledby="note-title">
            <h2 id="note-title">{copy.notesTitle}</h2>
            <p>{profile.notes}</p>
          </section>
        )}

        <ReportPanel
          report={report}
          inFlight={reportInFlight}
          slow={reportSlow}
          previouslySentAt={previouslySentAt}
          onReport={reportFound}
          nurseryPhone={profile.nurseryPhone}
        />

        {(profile.nurseryName !== '' || hasPhone) && (
          <section className="nursery" aria-labelledby="nursery-title">
            <h2 id="nursery-title">{copy.nurseryTitle}</h2>
            {profile.nurseryName !== '' && (
              <p className="nursery-name">{profile.nurseryName}</p>
            )}
            {/* The button exists only when there is a number to dial. A nursery
                name on its own is information, not an action. The number is
                part of the label, for a finder on a device that cannot dial. */}
            {hasPhone && (
              <a className="btn btn-secondary btn-call" href={`tel:${profile.nurseryPhone}`}>
                <Icon name="phone" size={20} />
                <span>{copy.callNursery(profile.nurseryPhone)}</span>
              </a>
            )}
          </section>
        )}
      </article>

      <section className="guidance" aria-labelledby="guidance-title">
        <h2 id="guidance-title">{copy.exitTitle}</h2>
        <ol className="numbered">
          {copy.exitSteps(hasPhone).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </Shell>
  );
}

/**
 * Everything about filing the sighting, one state at a time.
 *
 * Each state says what is happening in words, not only in a button label: the
 * location prompt is announced before the browser shows it, a slow connection
 * is named rather than left as an endless "Sending…", success says when it was
 * sent and whether the location went with it, and a failure offers both a retry
 * and the phone number. Changes are announced through polite live regions.
 */
function ReportPanel({ report, inFlight, slow, previouslySentAt, onReport, nurseryPhone }) {
  const sent = report === REPORT.sent || report === REPORT.sentWithoutLocation;
  const failed = report === REPORT.failed;
  // Sent earlier in this visit (a reload, or coming back to the tab), but not
  // from this render. Offered as an update rather than as a first report.
  const sentBefore = !sent && !inFlight && !failed && previouslySentAt !== null;

  if (sent) {
    const withLocation = report === REPORT.sent;
    return (
      <section className="report report-sent" role="status" aria-live="polite">
        <span className="report-icon" aria-hidden="true">
          <Icon name="check" size={24} />
        </span>
        <div className="report-sent-body">
          <h2>{copy.reportSuccessTitle}</h2>
          <p>{withLocation ? copy.reportSuccessBody : copy.reportSuccessNoLocation}</p>
          <p className="report-facts">
            {previouslySentAt && (
              <span>
                <Icon name="clock" size={16} />
                {copy.reportSentAt(clock(previouslySentAt))}
              </span>
            )}
            <span>
              <Icon name="pin" size={16} />
              {withLocation ? copy.reportWithLocation : copy.reportWithoutLocation}
            </span>
          </p>
        </div>
      </section>
    );
  }

  const buttonLabel = inFlight
    ? report === REPORT.locating
      ? copy.reportLocating
      : copy.reportSending
    : failed
      ? copy.reportRetry
      : sentBefore
        ? copy.reportSendUpdate
        : copy.reportIdle;

  return (
    <section className="report" aria-labelledby="report-title">
      <h2 id="report-title" className="visually-hidden">
        {copy.reportTitle}
      </h2>

      {sentBefore && (
        <p className="report-note report-note-done" role="status">
          <Icon name="check" size={18} />
          <span>{copy.reportAlreadySent(clock(previouslySentAt))}</span>
        </p>
      )}

      {failed && (
        <div className="report-note report-note-error" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <strong>{copy.reportFailedTitle}</strong>
            <span>{copy.reportFailed}</span>
            {nurseryPhone !== '' && (
              <span>
                {copy.reportFailedCall} <a href={`tel:${nurseryPhone}`}>{nurseryPhone}</a>
              </span>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        className={sentBefore ? 'btn btn-secondary btn-report' : 'btn btn-primary btn-report'}
        onClick={onReport}
        disabled={inFlight}
        aria-busy={inFlight ? 'true' : 'false'}
      >
        {inFlight ? (
          <span className="btn-spinner" aria-hidden="true" />
        ) : (
          <Icon name="pin" size={20} />
        )}
        <span>{buttonLabel}</span>
      </button>

      <div className="report-live" role="status" aria-live="polite">
        {report === REPORT.locating && (
          <p className="report-note report-note-info">
            <Icon name="pin" size={18} />
            <span>{copy.reportLocatingHint}</span>
          </p>
        )}
        {report === REPORT.sending && slow && (
          <p className="report-note report-note-slow">
            <Icon name="clock" size={18} />
            <span>{copy.reportSlow}</span>
          </p>
        )}
      </div>

      {!inFlight && (
        <p className="privacy">{sentBefore ? copy.reportUpdateHint : copy.reportIntro}</p>
      )}
    </section>
  );
}
