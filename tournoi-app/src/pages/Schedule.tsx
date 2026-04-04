import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/tournamentStore';
import type { Tournament, Match, TeamStanding } from '../types/tournament';
import { calculateStandings, sortStandings } from '../utils/rankings';
import { generateKnockoutMatches, assignMatchesToRotations } from '../utils/scheduler';
import { exportTournamentPDF, exportResultsCSV } from '../utils/export';
import BracketView, { getWinner, getLoser, getRoundLabel } from '../components/BracketView';

function getTeamName(t: Tournament, id: string) { return t.teams.find(x => x.id === id)?.name ?? '?'; }
function getCourtName(t: Tournament, id: string) { return t.courts.find(x => x.id === id)?.name ?? 'Terrain ?'; }

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
        <p>Tournoi introuvable.</p>
        <button onClick={() => navigate('/')} style={linkBtn}>Retour</button>
      </div>
    );
  }

  const rotations = tournament.rotations;
  const currentRotation = rotations[activeRotation];
  const allMatches = rotations.flatMap(r => r.matches);
  const allFinished = allMatches.length > 0 && allMatches.every(m => m.status === 'finished' || m.status === 'forfeit');

  // --- Knockout analysis ---
  const isPoolsKnockout = tournament.format === 'pools_knockout';
  const isKnockout = tournament.format === 'knockout';
  const hasKnockout = isPoolsKnockout || isKnockout;

  const poolMatchIds = new Set(tournament.pools.flatMap(p => allMatches.filter(m => m.poolId === p.id).map(m => m.id)));
  const poolMatches = allMatches.filter(m => poolMatchIds.has(m.id));
  const knockoutMatches = allMatches.filter(m => m.knockoutRound != null);
  const poolsFinished = poolMatches.length > 0 && poolMatches.every(m => m.status === 'finished' || m.status === 'forfeit');
  const knockoutNotStarted = isPoolsKnockout && poolsFinished && knockoutMatches.length === 0;

  // Group KO matches by consolation level
  const getLevel = (m: Match) => m.consolationLevel ?? 0;
  const allLevels = [...new Set(knockoutMatches.map(getLevel))].sort((a, b) => a - b);

  // For each level, get rounds and their status
  type LevelInfo = {
    level: number;
    rounds: Map<number, Match[]>;
    maxRound: number;
    lastMatches: Match[];
    lastDone: boolean;
    isFinal: boolean; // last round has only 1 match and it's done
  };

  const levelInfos: LevelInfo[] = allLevels.map(level => {
    const matches = knockoutMatches.filter(m => getLevel(m) === level);
    const rounds = new Map<number, Match[]>();
    for (const m of matches) { const r = m.knockoutRound ?? 0; if (!rounds.has(r)) rounds.set(r, []); rounds.get(r)!.push(m); }
    const sortedRounds = [...rounds.keys()].sort((a, b) => a - b);
    const maxRound = sortedRounds.length > 0 ? sortedRounds[sortedRounds.length - 1] : 0;
    const lastMatches = rounds.get(maxRound) ?? [];
    const lastDone = lastMatches.length > 0 && lastMatches.every(m => m.status === 'finished' || m.status === 'forfeit');
    const isFinal = lastDone && lastMatches.length === 1;
    return { level, rounds, maxRound, lastMatches, lastDone, isFinal };
  });

  // Check if there are rounds to advance
  // A level needs "next round" if its last round is done AND has more than 1 match
  const levelsNeedingAdvance = levelInfos.filter(li => li.lastDone && li.lastMatches.length > 1);
  // Also need to generate consolation for losers of each finished round
  // A consolation at level L+1 is needed when level L's last round finishes with >=2 matches
  // AND no consolation for those losers exists yet

  const canAdvance = hasKnockout && levelsNeedingAdvance.length > 0;

  // Main bracket winner
  const mainInfo = levelInfos.find(li => li.level === 0);
  const mainWinnerDone = mainInfo?.isFinal ?? false;

  // --- Handle advance: generate next round for all ready brackets ---
  const handleAdvanceAll = () => {
    if (!id) return;
    let newKRounds = [...tournament.knockoutRounds];
    let newRotations = [...rotations];

    for (const li of levelsNeedingAdvance) {
      const byeIds = getByes(li.level, li.maxRound);
      const winnerIds = [...li.lastMatches.map(getWinner), ...byeIds];
      const loserIds = li.lastMatches.map(getLoser);

      // Winners → next round at same level
      if (winnerIds.length >= 2) {
        const winnerTeams = winnerIds.map(tid => tournament.teams.find(t => t.id === tid)).filter((t): t is NonNullable<typeof t> => t != null);
        const kr = generateKnockoutMatches(winnerTeams, li.maxRound + 1);
        kr.consolationLevel = li.level;
        kr.matches.forEach(m => { m.consolationLevel = li.level; });
        const rots = assignMatchesToRotations(kr.matches, tournament.courts);
        const maxNum = newRotations.length > 0 ? Math.max(...newRotations.map(r => r.number)) : 0;
        rots.forEach((r, i) => { r.number = maxNum + i + 1; });
        newKRounds.push(kr);
        newRotations.push(...rots);
      }

      // Losers → consolation at level+1 (only if >=2 losers)
      if (loserIds.length >= 2) {
        const loserTeams = loserIds.map(tid => tournament.teams.find(t => t.id === tid)).filter((t): t is NonNullable<typeof t> => t != null);
        const consoLevel = li.level + 1;
        const kr = generateKnockoutMatches(loserTeams, li.maxRound);
        kr.consolationLevel = consoLevel;
        kr.matches.forEach(m => { m.consolationLevel = consoLevel; });
        const rots = assignMatchesToRotations(kr.matches, tournament.courts);
        const maxNum = newRotations.length > 0 ? Math.max(...newRotations.map(r => r.number)) : 0;
        rots.forEach((r, i) => { r.number = maxNum + i + 1; });
        newKRounds.push(kr);
        newRotations.push(...rots);
      }
    }

    setKnockoutRounds(id, newKRounds);
    setRotations(id, newRotations);
    setActiveRotation(newRotations.length - 1);
  };

  const getByes = (level: number, round: number): string[] => {
    const kr = tournament.knockoutRounds.find(kr =>
      kr.round === round && (kr.consolationLevel ?? 0) === level
    );
    return kr?.byeTeamIds ?? [];
  };

  // --- Cascade on edit ---
  const handleValidateKnockout = (matchId: string, matchRound: number, matchLevel: number) => {
    const s = scores[matchId];
    updateMatch(id, matchId, { scoreA: s?.a ?? 0, scoreB: s?.b ?? 0, status: 'finished' });
    setEditing(prev => ({ ...prev, [matchId]: false }));

    // Remove all later rounds at same level AND all consolation levels generated from this level's later rounds
    const affectedMatches = knockoutMatches.filter(m => {
      const mLevel = getLevel(m);
      const mRound = m.knockoutRound ?? 0;
      // Same level, later round
      if (mLevel === matchLevel && mRound > matchRound) return true;
      // Higher consolation level generated from this level's rounds >= matchRound
      if (mLevel > matchLevel) return true;
      return false;
    });

    if (affectedMatches.length > 0) {
      const removeIds = new Set(affectedMatches.map(m => m.id));
      const filteredRots = rotations
        .map(r => ({ ...r, matches: r.matches.filter(m => !removeIds.has(m.id)) }))
        .filter(r => r.matches.length > 0);
      setRotations(id, filteredRots);

      const keptKR = tournament.knockoutRounds.filter(kr => {
        const krLevel = kr.consolationLevel ?? 0;
        if (krLevel === matchLevel && kr.round > matchRound) return false;
        if (krLevel > matchLevel) return false;
        return true;
      });
      setKnockoutRounds(id, keptKR);
    }
  };

  // --- Standard handlers ---
  const handleValidate = (matchId: string) => {
    const match = allMatches.find(m => m.id === matchId);
    if (match?.knockoutRound != null) {
      handleValidateKnockout(matchId, match.knockoutRound, getLevel(match));
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
  const handleForfait = (matchId: string) => { updateMatch(id, matchId, { scoreA: 0, scoreB: 0, status: 'forfeit' }); };
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
    const teams = qualifiedTeamIds.map(tid => tournament.teams.find(t => t.id === tid)).filter((t): t is NonNullable<typeof t> => t != null);
    const kr = generateKnockoutMatches(teams, 1);
    kr.consolationLevel = 0;
    kr.matches.forEach(m => { m.consolationLevel = 0; });
    const rots = assignMatchesToRotations(kr.matches, tournament.courts);
    const maxNum = rotations.length > 0 ? Math.max(...rotations.map(r => r.number)) : 0;
    rots.forEach((r, i) => { r.number = maxNum + i + 1; });
    setKnockoutRounds(id, [...tournament.knockoutRounds, kr]);
    setRotations(id, [...rotations, ...rots]);
    setActiveRotation(rotations.length);
  };

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
  const handleFinish = () => { if (window.confirm('Terminer le tournoi ?')) finishTournament(id); };
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // --- Compute final rankings from knockout results ---
  const computeRankings = (): { teamId: string; rank: number }[] | null => {
    if (!hasKnockout || knockoutMatches.length === 0) return null;
    // Only compute if all brackets are done (all finals played)
    const allBracketsDone = levelInfos.every(li => li.isFinal || li.lastMatches.length === 0);
    if (!allBracketsDone) return null;

    const rankings: { teamId: string; rank: number }[] = [];
    let currentRank = 1;
    // Main bracket winner = 1st, loser = base for next consolation
    // Level 0 final: winner = 1st, loser starts at position after winners of all levels
    // Actually simpler: winners of finals at each level get consecutive ranks
    // Level 0 winner = 1st, Level 0 loser = plays in level 1, etc.
    // Level N winner = rank based on bracket position

    // Sort levels: 0 first, then 1, 2, etc.
    for (const li of levelInfos) {
      if (li.lastMatches.length === 1) {
        const m = li.lastMatches[0];
        const done = m.status === 'finished' || m.status === 'forfeit';
        if (done) {
          rankings.push({ teamId: getWinner(m), rank: currentRank++ });
          rankings.push({ teamId: getLoser(m), rank: currentRank++ });
        }
      }
    }
    return rankings.length > 0 ? rankings : null;
  };

  // --- Match card ---
  const renderMatchCard = (match: Match) => {
    const isFinished = match.status === 'finished';
    const isForfeit = match.status === 'forfeit';
    const isDone = (isFinished || isForfeit) && !editing[match.id];
    const level = getLevel(match);
    const levelLabel = level === 0 ? '' : `Consolante ${level}`;

    return (
      <div key={match.id} style={{
        background: isFinished && !editing[match.id] ? '#f0fdf4' : isForfeit && !editing[match.id] ? '#fefce8' : '#fff',
        borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        borderLeft: level > 0 ? `3px solid ${level === 1 ? '#f59e0b' : level === 2 ? '#8b5cf6' : '#ec4899'}` : 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {getCourtName(tournament, match.courtId)}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {levelLabel && <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>{levelLabel}</span>}
          </div>
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

  const rankings = computeRankings();

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
            : <button onClick={stopTimer} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Stop</button>}
          <button onClick={resetTimer} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #475569', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Reset</button>
        </div>
      </div>

      {/* Bracket */}
      {hasKnockout && knockoutMatches.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowBracket(!showBracket)} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#1e293b', marginBottom: 8, width: '100%' }}>
            {showBracket ? 'Masquer l\'arbre' : 'Afficher l\'arbre eliminatoire'}
          </button>
          {showBracket && <BracketView tournament={tournament} knockoutMatches={knockoutMatches} knockoutRounds={tournament.knockoutRounds} />}
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

      {/* Advance button — single button for all brackets */}
      {canAdvance && (
        <div style={{ background: '#fef3c7', border: '2px solid #f59e0b', borderRadius: 12, padding: 16, marginBottom: 12, textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>Matchs termines !</p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
            Les vainqueurs passent au tour suivant, les perdants jouent en consolante.
          </p>
          <button onClick={handleAdvanceAll} style={{ padding: '12px 24px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16 }}>
            Tour suivant (+ consolantes)
          </button>
        </div>
      )}

      {/* Winner */}
      {mainWinnerDone && (
        <div style={{ background: '#d1fae5', border: '2px solid #22c55e', borderRadius: 12, padding: 16, marginBottom: 12, textAlign: 'center' }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#065f46', fontWeight: 600 }}>VAINQUEUR</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{getTeamName(tournament, getWinner(mainInfo!.lastMatches[0]))}</p>
        </div>
      )}

      {/* Rankings */}
      {rankings && rankings.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Classement final</h3>
          {rankings.map(r => (
            <div key={r.teamId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ width: 28, fontSize: 14, fontWeight: 700, color: r.rank <= 3 ? '#f59e0b' : '#64748b' }}>
                {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `${r.rank}.`}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{getTeamName(tournament, r.teamId)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rotation tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
        {rotations.map((r, i) => {
          const rotFinished = r.matches.every(m => m.status === 'finished' || m.status === 'forfeit');
          const maxLevel = Math.max(...r.matches.map(m => m.consolationLevel ?? 0), 0);
          const colors = ['#e2e8f0', '#eff6ff', '#fef3c7', '#f3e8ff', '#fce7f3'];
          const bg = i === activeRotation ? '#2563eb' : rotFinished ? '#d1fae5' : (colors[maxLevel] ?? '#e2e8f0');
          return (
            <button key={r.id} onClick={() => setActiveRotation(i)} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', background: bg,
              color: i === activeRotation ? '#fff' : rotFinished ? '#065f46' : '#1e293b',
              fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              R{r.number}{rotFinished && i !== activeRotation ? ' \u2713' : ''}
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

const linkBtn: React.CSSProperties = { padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#1e293b', fontWeight: 500, cursor: 'pointer', fontSize: 14, marginTop: 16 };
