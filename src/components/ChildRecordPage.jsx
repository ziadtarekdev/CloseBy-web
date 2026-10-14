import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { copy } from '../lib/copy';
import { COMMENT_MAX } from '../lib/foundReport';
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
 * Laid out in the order a finder needs it: who the child is and who to call,
 * the one action that raises the alarm, the nursery, then what to do while
 * waiting. Opening the page already tells the nursery the code was scanned.
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
            {/* The group is listed under the child details below. */}
            {profile.age !== null && (
              <p className="card-meta">
                <span>{copy.ageLabel(profile.age)}</span>
              </p>
            )}
          </div>
        </div>

        <ChildDetails profile={profile} />

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
 * Group and guardian, so a finder can call the family straight away.
 *
 * Each row is shown only when the snapshot carries it: a page published before
 * the guardian fields existed simply has fewer rows, never a blank one.
 */
function ChildDetails({ profile }) {
  const rows = [
    profile.group !== '' && { label: copy.groupLabel, value: profile.group },
    profile.guardianName !== '' && { label: copy.guardianNameLabel, value: profile.guardianName },
    profile.guardianPhone !== '' && { label: copy.guardianPhoneLabel, value: profile.guardianPhone },
  ].filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <section className="details" aria-labelledby="details-title">
      <h2 id="details-title">{copy.detailsTitle}</h2>
      <dl className="details-list">
        {rows.map(({ label, value }) => (
          <div className="details-row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {profile.guardianPhone !== '' && (
        <a className="btn btn-secondary btn-call" href={`tel:${profile.guardianPhone}`}>
          <Icon name="phone" size={20} />
          <span>{copy.callGuardian(profile.guardianPhone)}</span>
        </a>
      )}
    </section>
  );
}

/**
 * Raising the "child is lost" alarm, one state at a time.
 *
 * The button opens a short form: a comment for the nursery and a note that the
 * browser will ask for the finder's location. Sending asks for the location,
 * then files the 'lost' report. Each state says what is happening in words: the
 * location prompt is announced before the browser shows it, a slow connection
 * is named rather than left as an endless "Sending…", success says when it was
 * sent and whether the location went with it, and a failure offers both a retry
 * and the phone number. Changes are announced through polite live regions.
 */
function ReportPanel({ report, inFlight, slow, previouslySentAt, onReport, nurseryPhone }) {
  const [formOpen, setFormOpen] = useState(false);
  const [comment, setComment] = useState('');

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

  // The form stays open while sending and after a failure, so the comment the
  // finder typed is never lost to a retry.
  const showForm = formOpen || inFlight || failed;

  if (!showForm) {
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

        <button
          type="button"
          className={sentBefore ? 'btn btn-secondary btn-report' : 'btn btn-danger btn-report'}
          onClick={() => setFormOpen(true)}
        >
          <Icon name="alert" size={20} />
          <span>{sentBefore ? copy.reportSendUpdate : copy.reportIdle}</span>
        </button>

        <p className="privacy">{sentBefore ? copy.reportUpdateHint : copy.reportIntro}</p>
      </section>
    );
  }

  const submitLabel = inFlight
    ? report === REPORT.locating
      ? copy.reportLocating
      : copy.reportSending
    : failed
      ? copy.reportRetry
      : copy.reportSubmit;

  const submit = (event) => {
    event.preventDefault();
    onReport(comment);
  };

  return (
    <form className="report report-form" aria-labelledby="report-title" onSubmit={submit}>
      <h2 id="report-title">{copy.reportFormTitle}</h2>

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

      <label className="field-label" htmlFor="report-comment">
        {copy.reportCommentLabel}
      </label>
      <textarea
        id="report-comment"
        className="field-input report-comment"
        rows={3}
        maxLength={COMMENT_MAX}
        placeholder={copy.reportCommentPlaceholder}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        disabled={inFlight}
      />

      <p className="report-note report-note-info">
        <Icon name="pin" size={18} />
        <span>{copy.reportLocationAsk}</span>
      </p>

      <button
        type="submit"
        className="btn btn-danger btn-report"
        disabled={inFlight}
        aria-busy={inFlight ? 'true' : 'false'}
      >
        {inFlight ? (
          <span className="btn-spinner" aria-hidden="true" />
        ) : (
          <Icon name="alert" size={20} />
        )}
        <span>{submitLabel}</span>
      </button>

      {!inFlight && !failed && (
        <button type="button" className="btn btn-text" onClick={() => setFormOpen(false)}>
          {copy.reportCancel}
        </button>
      )}

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
    </form>
  );
}
