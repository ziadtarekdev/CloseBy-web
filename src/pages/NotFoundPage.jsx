import { Link } from 'react-router-dom';
import { MessageState, Shell } from '../components/Chrome';
import { copy } from '../lib/copy';

/** An unknown route: says so, and points back to the way in. */
export default function NotFoundPage() {
  return (
    <Shell>
      <MessageState
        title={copy.notFoundPageTitle}
        body={copy.notFoundPageBody}
        action={
          <Link className="btn btn-secondary message-action" to="/">
            {copy.scanAnother}
          </Link>
        }
      />
    </Shell>
  );
}
