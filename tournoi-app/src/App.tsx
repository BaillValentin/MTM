import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useTournamentStore } from './store/tournamentStore';
import Home from './pages/Home';
import TournamentSetup from './pages/TournamentSetup';
import TeamSetup from './pages/TeamSetup';
import Schedule from './pages/Schedule';
import Rankings from './pages/Rankings';
import BigScreen from './pages/BigScreen';

function TournamentRedirect() {
  const { id } = useParams<{ id: string }>();
  const tournament = useTournamentStore((s) => s.tournaments.find((t) => t.id === id));

  if (!tournament) {
    return <Navigate to="/" replace />;
  }

  switch (tournament.status) {
    case 'setup':
      return <Navigate to={`/tournament/${id}/setup`} replace />;
    case 'teams':
      return <Navigate to={`/tournament/${id}/teams`} replace />;
    case 'ready':
    case 'in_progress':
      return <Navigate to={`/tournament/${id}/play`} replace />;
    case 'finished':
      return <Navigate to={`/tournament/${id}/play`} replace />;
    default:
      return <Navigate to={`/tournament/${id}/setup`} replace />;
  }
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tournament/new" element={<TournamentSetup />} />
        <Route path="/tournament/:id" element={<TournamentRedirect />} />
        <Route path="/tournament/:id/setup" element={<TournamentSetup />} />
        <Route path="/tournament/:id/teams" element={<TeamSetup />} />
        <Route path="/tournament/:id/play" element={<Schedule />} />
        <Route path="/tournament/:id/classements" element={<Rankings />} />
        <Route path="/tournament/:id/bigscreen" element={<BigScreen />} />
      </Routes>
    </HashRouter>
  );
}
