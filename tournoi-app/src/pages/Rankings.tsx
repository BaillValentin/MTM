import { useParams, useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/tournamentStore';
import type { Tournament, TeamStanding } from '../types/tournament';
import { calculateStandings, sortStandings } from '../utils/rankings';

function getTeamName(tournament: Tournament, teamId: string): string {
  return tournament.teams.find(t => t.id === teamId)?.name ?? 'Equipe ?';
}
const headerStyle: React.CSSProperties = {
  background: '#1e293b',
  color: '#fff',
  padding: '8px 6px',
  fontSize: 12,
  fontWeight: 600,
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

const cellStyle = (rowIndex: number): React.CSSProperties => ({
  padding: '8px 6px',
  fontSize: 13,
  textAlign: 'center',
  background: rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc',
});

function StandingsTable({
  title,
  standings,
  tournament,
  highlightQualified,
  qualifiedCount,
}: {
  title: string;
  standings: TeamStanding[];
  tournament: Tournament;
  highlightQualified?: boolean;
  qualifiedCount?: number;
}) {
  const cols = ['#', 'Equipe', 'J', 'V', 'N', 'D', 'BP', 'BC', 'Diff', 'Pts'];

  return (
    <div style={{
      background: '#fff', borderRadius: 12, marginBottom: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 16, borderBottom: '1px solid #e2e8f0' }}>
        {title}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c} style={{ ...headerStyle, textAlign: c === 'Equipe' ? 'left' : 'center' }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => {
              const isQualified = highlightQualified && qualifiedCount != null && i < qualifiedCount;
              const rowBg = isQualified
                ? '#f0fdf4'
                : i % 2 === 0 ? '#ffffff' : '#f8fafc';
              return (
                <tr key={s.teamId}>
                  <td style={{ ...cellStyle(i), background: rowBg, fontWeight: 700, width: 32 }}>{i + 1}</td>
                  <td style={{ ...cellStyle(i), background: rowBg, textAlign: 'left', fontWeight: 600 }}>
                    {getTeamName(tournament, s.teamId)}
                    {isQualified && (
                      <span style={{
                        marginLeft: 6, fontSize: 10, background: '#bbf7d0', color: '#166534',
                        padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                      }}>
                        Q
                      </span>
                    )}
                  </td>
                  <td style={{ ...cellStyle(i), background: rowBg }}>{s.played}</td>
                  <td style={{ ...cellStyle(i), background: rowBg }}>{s.wins}</td>
                  <td style={{ ...cellStyle(i), background: rowBg }}>{s.draws}</td>
                  <td style={{ ...cellStyle(i), background: rowBg }}>{s.losses}</td>
                  <td style={{ ...cellStyle(i), background: rowBg }}>{s.goalsFor}</td>
                  <td style={{ ...cellStyle(i), background: rowBg }}>{s.goalsAgainst}</td>
                  <td style={{ ...cellStyle(i), background: rowBg, fontWeight: 600 }}>{s.goalDifference}</td>
                  <td style={{ ...cellStyle(i), background: rowBg, fontWeight: 700 }}>{s.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Rankings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tournament = useTournamentStore(s => s.tournaments.find(t => t.id === id));

  if (!tournament || !id) {
    return (
      <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh' }}>
        <p style={{ color: '#1e293b' }}>Tournoi introuvable.</p>
      </div>
    );
  }

  const allMatches = tournament.rotations.flatMap(r => r.matches);
  const hasPools = (tournament.format === 'pools' || tournament.format === 'pools_knockout') && tournament.pools.length > 0;
  const qualifiedCount = tournament.format === 'pools_knockout' ? (tournament.qualifiedPerPool ?? 2) : undefined;

  const poolStandings: { poolName: string; standings: TeamStanding[] }[] = [];

  if (hasPools) {
    for (const pool of tournament.pools) {
      const poolMatches = allMatches.filter(m => m.poolId === pool.id);
      const st = calculateStandings(poolMatches, pool.teamIds, tournament.scoring);
      const sorted = sortStandings(st, tournament.tiebreakers, poolMatches);
      poolStandings.push({ poolName: pool.name, standings: sorted });
    }
  }

  const generalTeamIds = tournament.teams.map(t => t.id);
  const generalStandings = sortStandings(
    calculateStandings(allMatches, generalTeamIds, tournament.scoring),
    tournament.tiebreakers,
    allMatches,
  );

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', padding: 16, color: '#1e293b' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => navigate(`/tournament/${id}/play`)}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1',
            background: '#fff', color: '#1e293b', fontWeight: 600, cursor: 'pointer', fontSize: 14,
          }}
        >
          &larr; Retour
        </button>
        <h1 style={{ margin: 0, fontSize: 20 }}>Classements</h1>
      </div>

      {hasPools ? (
        poolStandings.map((ps, i) => (
          <StandingsTable
            key={i}
            title={ps.poolName}
            standings={ps.standings}
            tournament={tournament}
            highlightQualified={tournament.format === 'pools_knockout'}
            qualifiedCount={qualifiedCount}
          />
        ))
      ) : (
        <StandingsTable
          title="Classement general"
          standings={generalStandings}
          tournament={tournament}
        />
      )}
    </div>
  );
}
