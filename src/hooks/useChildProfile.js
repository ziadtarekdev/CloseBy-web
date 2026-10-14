import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPublicProfile, submitFoundReport } from '../lib/publicProfile';
import { isSafeProfileId } from '../lib/childLink';
import { getCurrentPosition } from '../lib/geolocation';
import {
  forgetReport,
  recallReport,
  rememberReport,
  rememberScan,
  scanRecentlySent,
} from '../lib/sentReports';

const STATUS = {
  loading: 'loading',
  ready: 'ready',
  invalidLink: 'invalidLink',
  missing: 'missing',
  error: 'error',
};

const REPORT = {
  idle: 'idle',
  locating: 'locating',
  sending: 'sending',
  sent: 'sent',
  sentWithoutLocation: 'sentWithoutLocation',
  failed: 'failed',
};

// After this long without an acknowledgement the page says the connection is
// slow. Firestore keeps the write queued and retries on its own, so the
// report may still land; until it does, nothing claims it was sent.
const SLOW_AFTER_MS = 8000;

/**
 * Loads the public profile for one QR link and files the alerts.
 *
 * Opening the page files a 'scan' alert on its own — the nursery learns that
 * somebody scanned the code even if they do nothing else. `reportFound` files
 * the 'lost' alert, with the finder's location and comment.
 *
 * Takes the profile's document id, already resolved from the URL by the page
 * that renders this hook — `uid~childId` from `/child?uid=..&id=..`, or a legacy
 * token from `/c/{token}`. A null, or anything that could not be a Firestore
 * document id, is rejected here before any network call, so a broken or
 * hand-edited link lands on the invalid-link screen rather than on a "not
 * found" one.
 */
export function useChildProfile(profileId) {
  const [status, setStatus] = useState(STATUS.loading);
  const [profile, setProfile] = useState(null);
  const [report, setReport] = useState(REPORT.idle);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A report this phone already sent for this child, so a reload shows that it
  // went through instead of inviting a duplicate that looks like a first one.
  const [previouslySentAt, setPreviouslySentAt] = useState(() => recallReport(profileId));
  const inFlight = useRef(false);

  // Cancellation is handled by only committing state while this effect is still
  // the current one for this profile — navigating away mid-read must not paint a
  // profile onto the next child's page.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!cancelled) setPreviouslySentAt(recallReport(profileId));
      if (!isSafeProfileId(profileId)) {
        if (!cancelled) setStatus(STATUS.invalidLink);
        return;
      }
      if (!cancelled) setStatus(STATUS.loading);

      try {
        const result = await fetchPublicProfile(profileId);
        if (cancelled) return;

        if (result.status === 'found') {
          setProfile(result.profile);
          setStatus(STATUS.ready);
        } else {
          // A retired code: nothing remembered about it is still useful.
          forgetReport(profileId);
          setStatus(STATUS.missing);
        }
      } catch {
        if (!cancelled) setStatus(STATUS.error);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [profileId, attempt]);

  /** Reads the profile again, for the retry on the error screen. */
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // The automatic scan alert, once the profile is known. Fire and forget: a
  // finder never waits on it and never sees it fail, and the cooldown in
  // sentReports.js keeps a reload from filing it again.
  useEffect(() => {
    if (status !== STATUS.ready || !profile) return;
    if (scanRecentlySent(profileId)) return;
    rememberScan(profileId);
    submitFoundReport(profile, null, { kind: 'scan' }).catch(() => {
      // Already logged by PublicProfileError; the page carries on regardless.
    });
  }, [status, profile, profileId]);

  const reportFound = useCallback(async (comment = '') => {
    // A ref rather than the state, so two taps inside one render cannot both
    // get past the check and file two sightings.
    if (inFlight.current) return;
    if (!isSafeProfileId(profileId) || !profile) return;
    inFlight.current = true;

    setReport(REPORT.locating);
    setSlow(false);
    const location = await getCurrentPosition();

    setReport(REPORT.sending);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    try {
      // Resolves only once Firestore has accepted the write.
      await submitFoundReport(profile, location, { kind: 'lost', comment });
      const at = new Date();
      rememberReport(profileId, at);
      setPreviouslySentAt(at);
      setReport(location === null ? REPORT.sentWithoutLocation : REPORT.sent);
    } catch {
      setReport(REPORT.failed);
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      inFlight.current = false;
    }
  }, [profileId, profile]);

  // True while a report is in flight, so the button can be disabled and a
  // double tap cannot file two sightings for the same sighting.
  const reportInFlight = report === REPORT.locating || report === REPORT.sending;

  return {
    status,
    profile,
    report,
    reportInFlight,
    reportFound,
    reportSlow: slow,
    previouslySentAt,
    reload,
  };
}

export { STATUS, REPORT };
