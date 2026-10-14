import { useCallback, useEffect, useRef, useState } from 'react';
import { copy } from '../lib/copy';
import { routeFromScannedText } from '../lib/scanLink';

// How often a video frame is handed to the detector. A QR held up to a phone
// is found within a frame or two; checking every frame only burns battery.
const SCAN_INTERVAL_MS = 250;

/**
 * Reads a CloseBy QR code with the device camera and hands its route to
 * [onRoute].
 *
 * Uses the browser's built-in BarcodeDetector rather than a scanning library,
 * so there is nothing to download for the finder and nothing added to the
 * bundle. Where the browser has no detector — Safari, Firefox, desktop Chrome
 * on Windows — the home page does not offer this button at all and points to
 * the phone's camera app instead, which reads the code natively.
 *
 * Every code is checked by routeFromScannedText before anything happens: a QR
 * that is not a CloseBy child link is reported as such and scanning carries
 * on, rather than the page following an arbitrary URL.
 */
export default function QrScanner({ onRoute }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const [status, setStatus] = useState('idle');

  const stop = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // The camera is released however the scanner goes away — a result, the
  // close button, or navigating off the page.
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setStatus('starting');
    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      setStatus('unsupported');
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch (error) {
      console.error('[closeby] camera unavailable:', error?.name, error);
      setStatus(error?.name === 'NotAllowedError' ? 'denied' : 'noCamera');
      return;
    }

    const video = videoRef.current;
    video.srcObject = streamRef.current;
    await video.play().catch(() => {});
    setStatus('scanning');

    let busy = false;
    timerRef.current = setInterval(async () => {
      if (busy || video.readyState < 2) return;
      busy = true;
      try {
        const codes = await detector.detect(video);
        for (const code of codes) {
          const route = routeFromScannedText(code.rawValue, window.location.host);
          if (route) {
            stop();
            setStatus('found');
            onRoute(route);
            return;
          }
          // A QR, but not one of ours. Keep looking; say why nothing happened.
          setStatus('notCloseBy');
        }
      } catch {
        // A frame the detector could not read is not an error worth showing.
      } finally {
        busy = false;
      }
    }, SCAN_INTERVAL_MS);
  }, [onRoute, stop]);

  const cancel = () => {
    stop();
    setStatus('idle');
  };

  const live = status === 'starting' || status === 'scanning' || status === 'notCloseBy';

  return (
    <div className="scanner">
      <div className="scanner-frame" data-live={live ? 'true' : 'false'} hidden={!live}>
        <video ref={videoRef} playsInline muted aria-label={copy.scanVideoLabel} />
        <span className="scanner-target" aria-hidden="true" />
      </div>

      <p className="scanner-status" role="status" aria-live="polite">
        {copy.scanStatus[status] ?? ''}
      </p>

      {live ? (
        <button type="button" className="btn btn-secondary" onClick={cancel}>
          {copy.scanCancel}
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={start}>
          {status === 'denied' || status === 'noCamera' ? copy.scanRetry : copy.scanStart}
        </button>
      )}
    </div>
  );
}
