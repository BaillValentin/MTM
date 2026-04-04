import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/tournamentStore';
import type { Tournament, Match, TeamStanding } from '../types/tournament';
import { calculateStandings, sortStandings } from '../utils/rankings';
import { generateKnockoutMatches, assignMatchesToRotations } from '../utils/scheduler';
import { exportTournamentPDF, exportResultsCSV } from '../utils/export';
import BracketView, { getWinner, getLoser, getRoundLabel } from '../components/BracketView';

function getTeamName(tournament: Tournament, teamId: string): string {
  return tournament.teams.find(t => t.id === teamId)?.name ?? 'Equipe ?';
}
function getCourtName(tournament: Tournament, courtId: string): string {
  return tournament.courts.find(c => c.id === courtId)?.name ?? 'Terrain ?';
}

export default function Schedule() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tournament = useTournamentStore(s => s.tournaments.find(t => t.id === id));
  const updateMatch = useTournamentStore(s => s.updateMatch);
  const finishTournament = useTournamentStore(s => s.finishTournament);
  const setRotations = useTournamentStore(s => s.setRotations);
  const setKnockoutRounds = useTournamentStore(s => s.setKnockoutRounds);

  const [activeRotation, setActiveRotation] = useState(0);
  const [scores, setScores] = useState<Record<string, { a: number; b: number }>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [showBracket, setShowBracket] = useState(true);

  // Timer
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useCallback(() => { setTimerRunning(false); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }, []);
  const startTimer = useCallback(() => { if (!tournament) return; setTimerSeconds(tournament.matchDuration * 60); setTimerRunning(true); }, [tournament]);
  const resetTimer = useCallback(() => { stopTimer(); setTimerSeconds(0); }, [stopTimer]);
  useEffect(() => {
    if (timerRunning && timerSeconds > 0) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => { if (prev <= 1) { stopTimer(); alert('Temps ecoule !'); return 0; } return prev - 1; });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning, timerSeconds, stopTimer]);

  if (!tournament || !id) {
    return (
      <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh' }}>
        <p style={{ color: '#1e293b' }}>Tournoi introuvable.</p>
        <button onClick={() => navigate('/')} style={linkBtn}>Retour a l'accueil</button>
      </div>
    );
  }

  const rotations = tournament.rotations;
  const currentRotation = rotations[activeRotation];
  const allMatches = rotations.flatMap(r => r.matches);
  const allFinished = allMatches.length > 0 && allMatches.every(m => m.status === 'finished' || m.status === 'forfeit');

  // --- Knockout detection ---
  const isPoolsKnockout = tournament.format === 'pools_knockout';
  const isKnockout = tournament.format === 'knockout';
  const hasKnockout = isPoolsKnockout || isKnockout;

  const poolMatchIds = new Set(
    tournament.pools.flatMap(p => allMatches.filter(m => m.poolId === p.id).map(m => m.id))
  );
  const poolMatches = allMatches.filter(m => poolMatchIds.has(m.id));
  const knockoutMatches = allMatches.filter(m => m.knockoutRound != null);
  const mainKO = knockoutMatches.filter(m => !m.isConsolation);
  const consolationKO = knockoutMatches.filter(m => m.isConsolation);
  const poolsFinished = poolMatches.length > 0 && poolMatches.every(m => m.status === 'finished' || m.status === 'forfeit');
  const knockoutNotStarted = isPoolsKnockout && poolsFinished && mainKO.length === 0;

  // Group by round
  const groupByRound = (matches: Match[]) => {
    const map = new Map<number, Match[]>();
    for (const m of matches) { const r = m.knockoutRound ?? 0; if (!map.has(r)) map.set(r, []); map.get(r)!.push(m); }
    return map;
  };
  const mainRounds = groupByRound(mainKO);
  const consolationRounds = groupByRound(consolationKO);
  const sortedMainRoundNums = Array.from(mainRounds.keys()).sort((a, b) => a - b);
  const sortedConsoRoundNums = Array.from(consolationRounds.keys()).sort((a, b) => a - b);

  const maxMainRound = sortedMainRoundNums.length > 0 ? sortedMainRoundNums[sortedMainRoundNums.length - 1] : 0;
  const lastMainMatches = mainRounds.get(maxMainRound) ?? [];
  const lastMainDone = lastMainMatches.length > 0 && lastMainMatches.every(m => m.status === 'finished' || m.status === 'forfeit');

  const maxConsoRound = sortedConsoRoundNums.length > 0 ? sortedConsoRoundNums[sortedConsoRoundNums.length - 1] : 0;
  const lastConsoMatches = consolationRounds.get(maxConsoRound) ?? [];
  const lastConsoDone = lastConsoMatches.length > 0 && lastConsoMatches.every(m => m.status === 'finished' || m.status === 'forfeit');

  // Need next main round?
  const needsNextMainRound = hasKnockout && lastMainDone && lastMainMatches.length > 1;
  // Need next consolation round?
  const needsNextConsoRound = hasKnockout && lastConsoDone && lastConsoMatches.length > 1;
  // Also need to generate consolation for newly finished main round losers
  const mainRoundJustFinished = hasKnockout && lastMainDone && lastMainMatches.length >= 2;
  // Check if consolation for this main round's losers has already been created
  const consoExistsForRound = consolationRounds.has(maxMainRound);
  const needsNewConsoFromMain = mainRoundJustFinished && !consoExistsForRound && lastMainMatches.length >= 2;

  const knockoutDone = hasKnockout && lastMainDone && lastMainMatches.length === 1;

  // --- Cascade: editing knockout match removes later rounds ---
  const handleValidateKnockout = (matchId: string, matchRound: number, isConsolation: boolean) => {
    const s = scores[matchId];
    updateMatch(id, matchId, { scoreA: s?.a ?? 0, scoreB: s?.b ?? 0, status: 'finished' });
    setEditing(prev => ({ ...prev, [matchId]: false }));

    // Remove later rounds of same bracket type
    const roundNums = isConsolation ? sortedConsoRoundNums : sortedMainRoundNums;
    const allKO = isConsolation ? consolationKO : mainKO;
    const laterRounds = roundNums.filter(r => r > matchRound);

    if (laterRounds.length > 0) {
      const laterMatchIds = new Set(
        laterRounds.flatMap(r => allKO.filter(m => m.knockoutRound === r).map(m => m.id))
      );
      // Also remove consolation rounds generated from later main rounds if editing main bracket
      let consoToRemove = new Set<string>();
      if (!isConsolation) {
        for (const r of laterRounds) {
          const consoOfRound = consolationKO.filter(m => m.knockoutRound === r);
          consoOfRound.forEach(m => consoToRemove.add(m.id));
        }
        // Also remove consolation for the current round since results changed
        const consoOfCurrent = consolationKO.filter(m => m.knockoutRound === matchRound);
        consoOfCurrent.forEach(m => consoToRemove.add(m.id));
      }

      const allToRemove = new Set([...laterMatchIds, ...consoToRemove]);
      const filteredRotations = rotations
        .map(rot => ({ ...rot, matches: rot.matches.filter(m => !allToRemove.has(m.id)) }))
        .filter(rot => rot.matches.length > 0);
      setRotations(id, filteredRotations);

      const keptKRounds = tournament.knockoutRounds.filter(kr => {
        if (!isConsolation) return kr.round <= matchRound && !laterRounds.includes(kr.round);
        return true; // keep main rounds when editing consolation
      });
      setKnockoutRounds(id, keptKRounds);
    }
  };

  const handleValidate = (matchId: string) => {
    const match = allMatches.find(m => m.id === matchId);
    if (match?.knockoutRound != null) {
      handleValidateKnockout(matchId, match.knockoutRound, !!match.isConsolation);
      return;
    }
    const s = scores[matchId];
    updateMatch(id, matchId, { scoreA: s?.a ?? 0, scoreB: s?.b ?? 0, status: 'finished' });
    setEditing(prev => ({ ...prev, [matchId]: false }));
  };

  const handleEdit = (matchId: string, scoreA: number, scoreB: number) => {
    setScores(prev => ({ ...prev, [matchId]: { a: scoreA, b: scoreB } }));
    setEditing(prev => ({ ...prev, [matchId]: true }));
  };

  const handleForfait = (matchId: string) => {
    updateMatch(id, matchId, { scoreA: 0, scoreB: 0, status: 'forfeit' });
  };

  const setScore = (matchId: string, side: 'a' | 'b', value: number) => {
    setScores(prev => ({ ...prev, [matchId]: { a: prev[matchId]?.a ?? 0, b: prev[matchId]?.b ?? 0, [side]: value } }));
  };

  // --- Launch knockout from pools ---
  const handleLaunchKnockout = () => {
    const qualifiedPerPool = tournament.qualifiedPerPool ?? 2;
    const qualifiedTeamIds: string[] = [];
    for (const pool of tournament.pools) {
      const pMatches = poolMatches.filter(m => m.poolId === pool.id);
      const standings = calculateStandings(pMatches, pool.teamIds, tournament.scoring);
      const sorted = sortStandings(standings, tournament.tiebreakers, pMatches);
      qualifiedTeamIds.push(...sorted.slice(0, qualifiedPerPool).map(s => s.teamId));
    }
    if (qualifiedTeamIds.length < 2) { alert('Pas assez d\'equipes qualifiees.'); return; }
    const qualifiedTeams = qualifiedTeamIds.map(tid => tournament.teams.find(t => t.id === tid)).filter((t): t is NonNullable<typeof t> => t != null);
    appendKnockoutRound(qualifiedTeams, 1, false);
  };

  // Get bye team IDs for a given round and consolation flag
  const getByeTeamIds = (round: number, isConsolation: boolean): string[] => {
    const kr = tournament.knockoutRounds.find(kr => kr.round === round &&
      (isConsolation ? kr.matches.some(m => m.isConsolation) || (kr.byeTeamIds?.length ?? 0) > 0 : !kr.matches.some(m => m.isConsolation))
    );
    return kr?.byeTeamIds ?? [];
  };

  const handleNextMainRound = () => {
    const winnerIds = lastMainMatches.map(getWinner);
    const byeIds = getByeTeamIds(maxMainRound, false);
    const allNextIds = [...winnerIds, ...byeIds];
    if (allNextIds.length < 2) return;
    const nextTeams = allNextIds.map(tid => tournament.teams.find(t => t.id === tid)).filter((t): t is NonNullable<typeof t> => t != null);
    appendKnockoutRound(nextTeams, maxMainRound + 1, false);
  };

  const handleGenerateConsolation = () => {
    const loserIds = lastMainMatches.map(getLoser);
    if (loserIds.length < 2) return;
    const loserTeams = loserIds.map(tid => tournament.teams.find(t => t.id === tid)).filter((t): t is NonNullable<typeof t> => t != null);
    appendKnockoutRound(loserTeams, maxMainRound, true);
  };

  const handleNextConsoRound = () => {
    const winnerIds = lastConsoMatches.map(getWinner);
    const byeIds = getByeTeamIds(maxConsoRound, true);
    const allNextIds = [...winnerIds, ...byeIds];
    if (allNextIds.length < 2) return;
    const nextTeams = allNextIds.map(tid => tournament.teams.find(t => t.id === tid)).filter((t): t is NonNullable<typeof t> => t != null);
    appendKnockoutRound(nextTeams, maxConsoRound + 1, true);
  };

  function appendKnockoutRound(teams: typeof tournament.teams, roundNum: number, isConsolation: boolean) {
    const kr = generateKnockoutMatches(teams, roundNum);
    // Mark consolation
    if (isConsolation) {
      kr.matches.forEach(m => { m.isConsolation = true; });
    }
    const newRots = assignMatchesToRotations(kr.matches, tournament.courts);
    const maxRotNum = rotations.length > 0 ? Math.max(...rotations.map(r => r.number)) : 0;
    const renumbered = newRots.map((r, i) => ({ ...r, number: maxRotNum + i + 1 }));
    setKnockoutRounds(id, [...tournament.knockoutRounds, kr]);
    setRotations(id, [...rotations, ...renumbered]);
    setActiveRotation(rotations.length);
  }

  // --- Exports ---
  const handleExportPDF = () => {
    const standingsMap = new Map<string, TeamStanding[]>();
    if (tournament.pools.length > 0) {
      for (const pool of tournament.pools) {
        const pm = allMatches.filter(m => m.poolId === pool.id);
        const st = calculateStandings(pm, pool.teamIds, tournament.scoring);
        standingsMap.set(pool.id, sortStandings(st, tournament.tiebreakers, pm));
      }
    } else {
      const teamIds = tournament.teams.map(t => t.id);
      const st = calculateStandings(allMatches, teamIds, tournament.scoring);
      standingsMap.set('general', sortStandings(st, tournament.tiebreakers, allMatches));
    }
    exportTournamentPDF(tournament, standingsMap);
  };
  const handleExportCSV = () => {
    const teamIds = tournament.teams.map(t => t.id);
    const st = calculateStandings(allMatches, teamIds, tournament.scoring);
    exportResultsCSV(tournament, sortStandings(st, tournament.tiebreakers, allMatches));
  };
  const handleFinish = () => { if (!allFinished) return; if (window.confirm('Terminer le tournoi ?')) finishTournament(id); };
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const renderMatchCard = (match: Match) => {
    const isFinished = match.status === 'finished';
    const isForfeit = match.status === 'forfeit';
    const isDone = (isFinished || isForfeit) && !editing[match.id];
    const koRoundMatches = match.knockoutRound != null
      ? knockoutMatches.filter(m => m.knockoutRound === match.knockoutRound && !!m.isConsolation === !!match.isConsolation)
      : [];

    return (
      <div key={match.id} style={{
        background: isFinished && !editing[match.id] ? '#f0fdf4' : isForfeit && !editing[match.id] ? '#fefce8' : '#fff',
        borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {getCourtName(tournament, match.courtId)}
          </span>
          {match.knockoutRound != null && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
              background: match.isConsolation ? '#fef3c7' : '#eff6ff',
              color: match.isConsolation ? '#92400e' : '#2563eb',
            }}>
              {getRoundLabel(koRoundMatches.length, !!match.isConsolation)}
            </span>
          )}
        </div>

        {isDone ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{getTeamName(tournament, match.teamAId)}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: isFinished ? '#16a34a' : '#a16207' }}>{match.scoreA} - {match.scoreB}</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{getTeamName(tournament, match.teamBId)}</span>
              {isForfeit && <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 600 }}>Forfait</span>}
            </div>
            <button onClick={() => handleEdit(match.id, match.scoreA ?? 0, match.scoreB ?? 0)}
              style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: '#64748b', whiteSpace: 'nowrap' }}>
              Modifier
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, textAlign: 'right' }}>{getTeamName(tournament, match.teamAId)}</span>
              <input type="number" min={0} value={scores[match.id]?.a ?? 0}
                onChange={e => setScore(match.id, 'a', parseInt(e.target.value) || 0)}
                style={{ width: 52, padding: '8px 4px', borderRadius: 8, border: '2px solid #2563eb', fontSize: 20, textAlign: 'center', fontWeight: 700 }} />
              <span style={{ fontWeight: 700, color: '#94a3b8', fontSize: 18 }}>-</span>
              <input type="number" min={0} value={scores[match.id]?.b ?? 0}
                onChange={e => setScore(match.id, 'b', parseInt(e.target.value) || 0)}
                style={{ width: 52, padding: '8px 4px', borderRadius: 8, border: '2px solid #2563eb', fontSize: 20, textAlign: 'center', fontWeight: 700 }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{getTeamName(tournament, match.teamBId)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleValidate(match.id)} style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Valider</button>
              <button onClick={() => handleForfait(match.id)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>Forfait</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', padding: '16px', color: '#1e293b', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>{tournament.name}</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{tournament.sport} &middot; {tournament.matchDuration} min/match</p>
          </div>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#64748b' }}>Accueil</button>
        </div>
      </div>

      {/* Timer */}
      <div style={{ background: '#1e293b', borderRadius: 12, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ color: '#fff', fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {timerRunning || timerSeconds > 0 ? formatTime(timerSeconds) : `${tournament.matchDuration}:00`}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!timerRunning
            ? <button onClick={startTimer} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Demarrer</button>
            : <button onClick={stopTimer} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Stop</button>
          }
          <button onClick={resetTimer} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #475569', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Reset</button>
        </div>
      </div>

      {/* Bracket */}
      {hasKnockout && knockoutMatches.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowBracket(!showBracket)} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#1e293b', marginBottom: 8, width: '100%' }}>
            {showBracket ? 'Masquer l\'arbre' : 'Afficher l\'arbre eliminatoire'}
          </button>
          {showBracket && <BracketView tournament={tournament} knockoutMatches={knockoutMatches} />}
        </div>
      )}

      {/* Launch knockout from pools */}
      {knockoutNotStarted && (
        <div style={{ background: '#eff6ff', border: '2px solid #2563eb', borderRadius: 12, padding: 16, marginBottom: 12, textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>Poules terminees ! Lancez la phase eliminatoire.</p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>Les {tournament.qualifiedPerPool ?? 2} premier(s) de chaque poule seront qualifies.</p>
          <button onClick={handleLaunchKnockout} style={{ padding: '12px 24px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16 }}>
            Lancer la phase eliminatoire
          </button>
        </div>
      )}

      {/* Next main round + consolation generation */}
      {needsNextMainRound && (
        <div style={{ background: '#fef3c7', border: '2px solid #f59e0b', borderRadius: 12, padding: 16, marginBottom: 12, textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>Tour principal termine !</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleNextMainRound} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              {getRoundLabel(Math.ceil(lastMainMatches.length / 2), false)}
            </button>
            {needsNewConsoFromMain && (
              <button onClick={handleGenerateConsolation} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                Consolante ({lastMainMatches.length} perdants)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Next consolation round (if not same trigger as main) */}
      {!needsNextMainRound && needsNextConsoRound && (
        <div style={{ background: '#fef3c7', border: '2px solid #f59e0b', borderRadius: 12, padding: 16, marginBottom: 12, textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>Tour consolante termine !</p>
          <button onClick={handleNextConsoRound} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            {getRoundLabel(Math.ceil(lastConsoMatches.length / 2), true)}
          </button>
        </div>
      )}

      {/* Consolation available but not yet generated */}
      {!needsNextMainRound && needsNewConsoFromMain && !knockoutDone && (
        <div style={{ background: '#fef9c3', border: '2px solid #eab308', borderRadius: 12, padding: 16, marginBottom: 12, textAlign: 'center' }}>
          <button onClick={handleGenerateConsolation} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#eab308', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            Lancer la consolante ({lastMainMatches.length} perdants)
          </button>
        </div>
      )}

      {/* Winner */}
      {knockoutDone && (
        <div style={{ background: '#d1fae5', border: '2px solid #22c55e', borderRadius: 12, padding: 16, marginBottom: 12, textAlign: 'center' }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#065f46', fontWeight: 600 }}>VAINQUEUR</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{getTeamName(tournament, getWinner(lastMainMatches[0]))}</p>
        </div>
      )}

      {/* Rotation tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
        {rotations.map((r, i) => {
          const rotFinished = r.matches.every(m => m.status === 'finished' || m.status === 'forfeit');
          const hasKO = r.matches.some(m => m.knockoutRound != null);
          const hasConso = r.matches.some(m => m.isConsolation);
          return (
            <button key={r.id} onClick={() => setActiveRotation(i)} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none',
              background: i === activeRotation ? '#2563eb' : rotFinished ? '#d1fae5' : hasConso ? '#fef3c7' : hasKO ? '#eff6ff' : '#e2e8f0',
              color: i === activeRotation ? '#fff' : rotFinished ? '#065f46' : '#1e293b',
              fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              R{r.number} {rotFinished && i !== activeRotation ? '\u2713' : ''}
            </button>
          );
        })}
      </div>

      {/* Matches */}
      {currentRotation && currentRotation.matches.map(renderMatchCard)}

      {/* Bottom actions */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginTop: 16, marginBottom: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={() => navigate(`/tournament/${id}/classements`)} style={{ padding: '12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>Voir les classements</button>
        <button onClick={() => window.open(`/tournament/${id}/bigscreen`, '_blank')} style={{ padding: '12px', borderRadius: 8, border: '1px solid #2563eb', background: '#fff', color: '#2563eb', fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>Vue grand ecran</button>
        <button onClick={() => navigate(`/tournament/${id}/setup`)} style={{ padding: '12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Modifier les parametres</button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleExportPDF} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>PDF</button>
          <button onClick={handleExportCSV} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#1e293b', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>CSV</button>
        </div>
        {allFinished && tournament.status !== 'finished' && (
          <button onClick={handleFinish} style={{ padding: '12px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>Terminer le tournoi</button>
        )}
        {tournament.status === 'finished' && (
          <button onClick={() => navigate('/')} style={{ padding: '12px', borderRadius: 8, border: 'none', background: '#1e293b', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>Retour a l'accueil</button>
        )}
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db',
  background: '#fff', color: '#1e293b', fontWeight: 500, cursor: 'pointer', fontSize: 14, marginTop: 16,
};
