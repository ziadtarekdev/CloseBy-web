import { useLocation } from 'react-router-dom';
import { profileIdFromQuery } from '../lib/childLink';
import ChildRecordPage from '../components/ChildRecordPage';

/**
 * The page a current QR code opens: `/child?uid={nurseryId}&id={childId}`.
 *
 * Everything the page needs is in the URL, so there is nothing to search for,
 * nothing to type and no second step. The phone camera reads the link, the
 * finder taps the notification, and this resolves the two ids to one public
 * profile document and renders it.
 *
 * A missing or unusable `uid`/`id` resolves to null, which the shared screen
 * shows as "this link is not complete" — the same screen a truncated or
 * hand-edited link gets, which is the same problem.
 */
export default function ChildByIdPage() {
  const { search } = useLocation();

  return <ChildRecordPage profileId={profileIdFromQuery(search)} />;
}
