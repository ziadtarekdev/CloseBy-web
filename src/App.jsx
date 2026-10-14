import { Route, Routes } from 'react-router-dom';
import ChildByIdPage from './pages/ChildByIdPage';
import ChildPage from './pages/ChildPage';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';

// The Flutter app generates
//   https://closeby-28cdc.web.app/child?uid={nurseryId}&id={childId}
// so `/child` is the route that has to work. `/c/:token` stays because codes in
// that shape are already printed on bracelets; `/child` on its own, and anything
// else, falls through to a plain "scan again" page rather than a 404.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/child" element={<ChildByIdPage />} />
      <Route path="/c/:token" element={<ChildPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
