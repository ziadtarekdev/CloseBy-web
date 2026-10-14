import { useParams } from 'react-router-dom';
import { isSafeSegment } from '../lib/childLink';
import ChildRecordPage from '../components/ChildRecordPage';

/**
 * The QR link printed before the URL carried the nursery and child ids.
 *
 * The token is the last path segment of `/c/{token}`, and it was already the
 * document id of the profile document, so it passes straight through. Kept
 * working on purpose: these codes are on bracelets that are already printed, and
 * a route that stops resolving turns a child's name into a dead link.
 */
export default function ChildPage() {
  const { token } = useParams();

  return <ChildRecordPage profileId={isSafeSegment(token) ? token : null} />;
}
