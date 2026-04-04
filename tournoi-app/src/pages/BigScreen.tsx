import { useParams } from 'react-router-dom';
import { useTournamentStore } from '../store/tournamentStore';
import type { Tournament, TeamStanding } from '../types/tournament';
import { calculateStandings, sortStandings } from '../utils/rankings';
import BracketView from '../components/BracketView';

function getTeamName(tournament: Tournament, teamId: string): string {
  return tournament.teams.find(t => t.id === teamId)?.name ?? 'Equipe ?';
}
function getCourtName(tournament: Tournament, courtId: string): string {
  return tournament.courts.find(c => c.id === courtId)?.name ?? 'Terrain ?';
}

function CompactStandingsTable({
  title,
  standings,
  tournament,
}: {
  title: string;
  standings: TeamStanding[];
  tournament: Tournament;
}) {
  const cols = ['#', 'Equipe', 'J', 'V', 'N', 'D', 'Diff', 'Pts'];

  return (
    <div style={{
      background: '#1e293b', borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 14, color: '#94a3b8', borderBottom: '1px solid #334155' }}>
        {title}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c} style={{
                  padding: '6px 5px', fontSize: 11, fontWeight: 600, color: '#64748b',
                  textAlign: c === 'Equipe' ? 'left' : 'center', borderBottom: '1px solid #334155',
                }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.teamId}>
                <td style={{ padding: '5px', fontSize: 13, textAlign: 'center', color: '#cbd5e1', background: i % 2 === 0 ? '#1e293b' : '#0f172a' }}>{i + 1}</td>
                <td style={{ padding: '5px', fontSize: 13, textAlign: 'left', color: '#f1f5f9', fontWeight: 600, background: i % 2 === 0 ? '#1e293b' : '#0f172a' }}>{getTeamName(tournament, s.teamId)}</td>
                <td style={{ padding: '5px', fontSize: 13, textAlign: 'center', color: '#cbd5e1', background: i % 2 === 0 ? '#1e293b' : '#0f172a' }}>{s.played}</td>
                <td style={{ padding: '5px', fontSize: 13, textAlign: 'center', color: '#cbd5e1', background: i % 2 === 0 ? '#1e293b' : '#0f172a' }}>{s.wins}</td>
                <td style={{ padding: '5px', fontSize: 13, textAlign: 'center', color: '#cbd5e1', background: i % 2 === 0 ? '#1e293b' : '#0f172a' }}>{s.draws}</td>
                <td style={{ padding: '5px', fontSize: 13, textAlign: 'center', color: '#cbd5e1', background: i % 2 === 0 ? '#1e293b' : '#0f172a' }}>{s.losses}</td>
                <td style={{ padding: '5px', fontSize: 13, textAlign: 'center', color: '#cbd5e1', fontWeight: 600, background: i % 2 === 0 ? '#1e293b' : '#0f172a' }}>{s.goalDifference}</td>
                <td style={{ padding: '5px', fontSize: 13, textAlign: 'center', color: '#fbbf24', fontWeight: 700, background: i % 2 === 0 ? '#1e293b' : '#0f172a' }}>{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BigScreen() {
  const { id } = useParams<{ id: string }>();
  const tournament = useTournamentStore(s => s.tournaments.find(t => t.id === id));

  if (!tournament || !id) {
    return (
      <div style={{ background: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#fff', fontSize: 24 }}>Tournoi introuvable.</p>
      </div>
    );
  }

  const rotations = tournament.rotations;
  const allMatches = rotations.flatMap(r => r.matches);

  // Find the current rotation: first one with non-finished matches, or the last one
  const currentRotationIndex = rotations.findIndex(r =>
    r.matches.some(m => m.status !== 'finished' && m.status !== 'forfeit')
  );
  const activeRotation = rotations[currentRotationIndex >= 0 ? currentRotationIndex : rotations.length - 1];

  // Standings
  const hasPools = (tournament.format === 'pools' || tournament.format === 'pools_knockout') && tournament.pools.length > 0;

  const poolStandingsData: { poolName: string; standings: TeamStanding[] }[] = [];
  if (hasPools) {
    for (const pool of tournament.pools) {
      const poolMatches = allMatches.filter(m => m.poolId === pool.id);
      const st = calculateStandings(poolMatches, pool.teamIds, tournament.scoring);
      poolStandingsData.push({ poolName: pool.name, standings: sortStandings(st, tournament.tiebreakers, poolMatches) });
    }
  }
  const generalTeamIds = tournament.teams.map(t => t.id);
  const generalStandings = sortStandings(
    calculateStandings(allMatches, generalTeamIds, tournament.scoring),
    tournament.tiebreakers,
    allMatches,
  );

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', padding: '24px', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
      {/* Quit button */}
      <button
        onClick={() => window.close()}
        style={{
          position: 'fixed', top: 16, right: 16, padding: '6px 14px', borderRadius: 8,
          border: '1px solid #334155', background: '#1e293b', color: '#64748b',
          fontSize: 12, cursor: 'pointer', zIndex: 10,
        }}
      >
        Quitter
      </button>

      {/* Title */}
      <h1 style={{ textAlign: 'center', fontSize: 'clamp(28px, 5vw, 48px)', margin: '0 0 8px', fontWeight: 800 }}>
        {tournament.name}
      </h1>
      <p style={{ textAlign: 'center', color: '#64748b', fontSize: 16, margin: '0 0 32px' }}>
        {tournament.sport}
      </p>

      {/* Current rotation */}
      {activeRotation && (
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(18px, 3vw, 28px)', color: '#94a3b8', marginBottom: 20 }}>
            Rotation {activeRotation.number}
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))',
            gap: 16,
            maxWidth: 900,
            margin: '0 auto',
          }}>
            {activeRotation.matches.map(match => (
              <div key={match.id} style={{
                background: '#1e293b', borderRadius: 12, padding: 20,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                border: match.status === 'in_progress' ? '2px solid #2563eb' : '1px solid #334155',
              }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>
                  {getCourtName(tournament, match.courtId)}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 'clamp(14px, 2vw, 20px)', fontWeight: 700,
                }}>
                  <span style={{ flex: 1, textAlign: 'right', paddingRight: 12 }}>
                    {getTeamName(tournament, match.teamAId)}
                  </span>
                  {(match.status === 'finished' || match.status === 'forfeit') ? (
                    <span style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 800, color: '#fbbf24', minWidth: 80, textAlign: 'center' }}>
                      {match.scoreA ?? 0} - {match.scoreB ?? 0}
                    </span>
                  ) : match.status === 'in_progress' ? (
                    <span style={{
                      fontSize: 14, fontWeight: 700, color: '#2563eb', minWidth: 80, textAlign: 'center',
                      animation: 'pulse 2s ease-in-out infinite',
                    }}>
                      EN COURS
                    </span>
                  ) : (
                    <span style={{ fontSize: 14, color: '#475569', minWidth: 80, textAlign: 'center' }}>
                      A venir
                    </span>
                  )}
                  <span style={{ flex: 1, textAlign: 'left', paddingLeft: 12 }}>
                    {getTeamName(tournament, match.teamBId)}
                  </span>
                </div>
                {match.status === 'forfeit' && (
                  <div style={{ textAlign: 'center', marginTop: 4 }}>
                    <span style={{
                      fontSize: 11, background: '#fef3c7', color: '#92400e',
                      padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                    }}>
                      Forfait
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bracket */}
      {(tournament.format === 'knockout' || tournament.format === 'pools_knockout') && (() => {
        const koMatches = allMatches.filter(m => m.knockoutRound != null);
        return koMatches.length > 0 ? (
          <div style={{ maxWidth: 900, margin: '0 auto 40px' }}>
            <h2 style={{ textAlign: 'center', fontSize: 20, color: '#94a3b8', marginBottom: 16 }}>Phase eliminatoire</h2>
            <BracketView tournament={tournament} knockoutMatches={koMatches} dark />
          </div>
        ) : null;
      })()}

      {/* Standings */}
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 20, color: '#94a3b8', marginBottom: 16 }}>Classements</h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: hasPools && poolStandingsData.length > 1 ? 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))' : '1fr',
          gap: 16,
        }}>
          {hasPools ? (
            poolStandingsData.map((ps, i) => (
              <CompactStandingsTable key={i} title={ps.poolName} standings={ps.standings} tournament={tournament} />
            ))
          ) : (
            <CompactStandingsTable title="Classement general" standings={generalStandings} tournament={tournament} />
          )}
        </div>
      </div>

      {/* CSS animation for pulse */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
