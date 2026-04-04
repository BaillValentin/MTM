import type { Match, Tournament, KnockoutRound } from '../types/tournament';

function getTeamName(tournament: Tournament, teamId: string): string {
  return tournament.teams.find(t => t.id === teamId)?.name ?? '?';
}
function getWinner(m: Match): string {
  if ((m.scoreA ?? 0) > (m.scoreB ?? 0)) return m.teamAId;
  if ((m.scoreB ?? 0) > (m.scoreA ?? 0)) return m.teamBId;
  return m.teamAId;
}
function getLoser(m: Match): string {
  return getWinner(m) === m.teamAId ? m.teamBId : m.teamAId;
}
function getRoundLabel(numMatches: number, isConsolation: boolean): string {
  const prefix = isConsolation ? 'C. ' : '';
  if (numMatches === 1) return isConsolation ? 'Finale consolante' : 'Finale';
  if (numMatches === 2) return `${prefix}Demi-finales`;
  if (numMatches === 4) return `${prefix}Quarts`;
  if (numMatches === 8) return `${prefix}8es`;
  return `${prefix}${numMatches} matchs`;
}

// A "slot" in the bracket: either a real match or a bye
type BracketSlot = { type: 'match'; match: Match } | { type: 'bye'; teamId: string };

interface BracketViewProps {
  tournament: Tournament;
  knockoutMatches: Match[];
  knockoutRounds: KnockoutRound[];
  dark?: boolean;
}

export default function BracketView({ tournament, knockoutMatches, knockoutRounds, dark = false }: BracketViewProps) {
  const mainMatches = knockoutMatches.filter(m => !m.isConsolation);
  const consolationMatches = knockoutMatches.filter(m => m.isConsolation);

  // Build rounds with byes included as slots
  const buildSlots = (matches: Match[], isConsolation: boolean): [number, BracketSlot[]][] => {
    const roundMap = new Map<number, Match[]>();
    for (const m of matches) {
      const r = m.knockoutRound ?? 0;
      if (!roundMap.has(r)) roundMap.set(r, []);
      roundMap.get(r)!.push(m);
    }
    const roundNums = Array.from(roundMap.keys()).sort((a, b) => a - b);

    return roundNums.map(rNum => {
      const rMatches = roundMap.get(rNum)!;
      const slots: BracketSlot[] = rMatches.map(m => ({ type: 'match' as const, match: m }));

      // Find bye teams for this round
      // Look through knockoutRounds for matching round
      // For consolation, we check if the KR's matches are consolation
      const kr = knockoutRounds.find(kr => {
        if (kr.round !== rNum) return false;
        if (isConsolation) return kr.matches.some(m => m.isConsolation);
        return !kr.matches.some(m => m.isConsolation);
      });
      const byeIds = kr?.byeTeamIds ?? [];
      for (const tid of byeIds) {
        slots.push({ type: 'bye', teamId: tid });
      }

      return [rNum, slots];
    });
  };

  const mainSlots = buildSlots(mainMatches, false);
  const consolationSlots = buildSlots(consolationMatches, true);

  // Theme
  const cardBg = dark ? '#1e293b' : '#fafafa';
  const borderColor = dark ? '#334155' : '#cbd5e1';
  const textColor = dark ? '#f1f5f9' : '#1e293b';
  const mutedColor = dark ? '#94a3b8' : '#64748b';
  const winBg = dark ? '#065f46' : '#dcfce7';
  const lineColor = dark ? '#475569' : '#a1a1aa';
  const bg = dark ? '#0f172a' : '#fff';
  const byeBg = dark ? '#1e293b' : '#f8fafc';

  const matchBox = (m: Match) => {
    const done = m.status === 'finished' || m.status === 'forfeit';
    const winnerId = done ? getWinner(m) : null;
    const sides = [
      { teamId: m.teamAId, score: m.scoreA, isW: winnerId === m.teamAId },
      { teamId: m.teamBId, score: m.scoreB, isW: winnerId === m.teamBId },
    ];
    return (
      <div style={{
        width: 160, border: `2px solid ${done ? '#22c55e' : borderColor}`,
        borderRadius: 6, overflow: 'hidden', background: cardBg, flexShrink: 0,
      }}>
        {sides.map((s, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '3px 8px', height: 20,
            background: s.isW ? winBg : 'transparent',
            borderBottom: i === 0 ? `1px solid ${borderColor}` : 'none',
          }}>
            <span style={{
              fontSize: 11, fontWeight: s.isW ? 700 : 400, color: textColor,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 115,
            }}>{getTeamName(tournament, s.teamId)}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: textColor }}>{done ? s.score : ''}</span>
          </div>
        ))}
      </div>
    );
  };

  const byeBox = (teamId: string) => (
    <div style={{
      width: 160, border: `1px dashed ${borderColor}`,
      borderRadius: 6, background: byeBg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '3px 8px', height: 42,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: textColor }}>
        {getTeamName(tournament, teamId)}
      </span>
      <span style={{ fontSize: 9, color: mutedColor, fontStyle: 'italic' }}>exempt</span>
    </div>
  );

  const slotBox = (slot: BracketSlot) => {
    if (slot.type === 'match') return matchBox(slot.match);
    return byeBox(slot.teamId);
  };

  const CONN_W = 24;
  const MIN_GAP = 4;

  /*
   * Recursive bracket rendering:
   * renderSeed(roundIdx, slotIdx) renders the sub-tree for slot slotIdx of round roundIdx.
   * For the first round (roundIdx=0), it's just the slot box.
   * For later rounds, it renders the two source slots from the previous round,
   * connector lines, then this slot's box.
   */
  const renderBracket = (rounds: [number, BracketSlot[]][], isConsolation: boolean) => {
    if (rounds.length === 0) return null;

    const renderSeed = (roundIdx: number, slotIdx: number): JSX.Element => {
      const [, slots] = rounds[roundIdx];
      const slot = slots[slotIdx];
      if (!slot) return <div />;

      if (roundIdx === 0) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', padding: `${MIN_GAP / 2}px 0` }}>
            {slotBox(slot)}
          </div>
        );
      }

      const prevRoundIdx = roundIdx - 1;
      const childIdx1 = slotIdx * 2;
      const childIdx2 = slotIdx * 2 + 1;
      const prevSlots = rounds[prevRoundIdx][1];
      const hasChild1 = childIdx1 < prevSlots.length;
      const hasChild2 = childIdx2 < prevSlots.length;

      if (!hasChild1) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', padding: `${MIN_GAP / 2}px 0` }}>
            {slotBox(slot)}
          </div>
        );
      }

      if (!hasChild2) {
        return (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div>{renderSeed(prevRoundIdx, childIdx1)}</div>
            <div style={{ width: CONN_W, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100%', height: 0, borderTop: `1.5px solid ${lineColor}` }} />
            </div>
            {slotBox(slot)}
          </div>
        );
      }

      return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {renderSeed(prevRoundIdx, childIdx1)}
            {renderSeed(prevRoundIdx, childIdx2)}
          </div>
          <ConnectorSvg width={CONN_W} color={lineColor} />
          {slotBox(slot)}
        </div>
      );
    };

    const lastRoundIdx = rounds.length - 1;
    const lastSlots = rounds[lastRoundIdx][1];
    const lastMainMatch = lastSlots.length === 1 && lastSlots[0].type === 'match' ? lastSlots[0].match : null;
    const lastDone = lastMainMatch && (lastMainMatch.status === 'finished' || lastMainMatch.status === 'forfeit');

    // Column headers
    const headers = rounds.map(([, slots]) => {
      const matchCount = slots.filter(s => s.type === 'match').length;
      return matchCount;
    });

    return (
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: MIN_GAP * 2 }}>
            {lastSlots.map((_, i) => renderSeed(lastRoundIdx, i))}
          </div>
        </div>
        {/* Winner */}
        {!isConsolation && lastDone && lastMainMatch && (
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 12, justifyContent: 'center', alignSelf: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', textAlign: 'center', marginBottom: 4 }}>Vainqueur</div>
            <div style={{ border: '2px solid #22c55e', borderRadius: 6, padding: '8px 12px', background: winBg, textAlign: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{getTeamName(tournament, getWinner(lastMainMatch))}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (mainSlots.length === 0) return null;

  return (
    <div style={{ background: bg, borderRadius: 12, padding: 16, boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.1)', overflowX: 'auto' }}>
      <div style={{ marginBottom: consolationSlots.length > 0 ? 24 : 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: textColor, marginBottom: 8 }}>Tableau principal</div>
        {renderBracket(mainSlots, false)}
      </div>

      {consolationSlots.length > 0 && (
        <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: mutedColor, marginBottom: 8 }}>Tableau consolante</div>
          {renderBracket(consolationSlots, true)}
        </div>
      )}
    </div>
  );
}

function ConnectorSvg({ width, color }: { width: number; color: string }) {
  return (
    <div style={{ width, alignSelf: 'stretch', position: 'relative', flexShrink: 0 }}>
      <svg width="100%" height="100%" style={{ display: 'block' }} preserveAspectRatio="none">
        <line x1="0" y1="25%" x2="50%" y2="25%" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="75%" x2="50%" y2="75%" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1="50%" y1="25%" x2="50%" y2="75%" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1="50%" y1="50%" x2="100%" y2="50%" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export { getWinner, getLoser, getRoundLabel };
