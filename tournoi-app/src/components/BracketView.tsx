import type { ReactElement } from 'react';
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
function getRoundLabel(numMatches: number, level: number): string {
  const prefix = level > 0 ? `C${level}. ` : '';
  if (numMatches === 1) return level > 0 ? `Finale C${level}` : 'Finale';
  if (numMatches === 2) return `${prefix}Demi-finales`;
  if (numMatches === 4) return `${prefix}Quarts`;
  if (numMatches === 8) return `${prefix}8es`;
  return `${prefix}${numMatches} matchs`;
}
function getLevelTitle(level: number): string {
  if (level === 0) return 'Tableau principal';
  if (level === 1) return 'Consolante';
  return `Consolante niveau ${level}`;
}

const LEVEL_COLORS = ['#2563eb', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// A node in the bracket tree
type BNode = {
  type: 'match';
  match: Match;
  childA: BNode | null; // source for teamA
  childB: BNode | null; // source for teamB
} | {
  type: 'bye';
  teamId: string;
};

interface BracketViewProps {
  tournament: Tournament;
  knockoutMatches: Match[];
  knockoutRounds: KnockoutRound[];
  dark?: boolean;
}

export default function BracketView({ tournament, knockoutMatches, knockoutRounds, dark = false }: BracketViewProps) {
  const levels = [...new Set(knockoutMatches.map(m => m.consolationLevel ?? 0))].sort((a, b) => a - b);

  // Theme
  const cardBg = dark ? '#1e293b' : '#fafafa';
  const borderColor = dark ? '#334155' : '#cbd5e1';
  const textColor = dark ? '#f1f5f9' : '#1e293b';
  const mutedColor = dark ? '#94a3b8' : '#64748b';
  const winBg = dark ? '#065f46' : '#dcfce7';
  const lineColor = dark ? '#475569' : '#a1a1aa';
  const bg = dark ? '#0f172a' : '#fff';
  const byeBg = dark ? '#1e293b' : '#f8fafc';

  // Build tree by following team connections
  function buildTree(level: number): BNode[] {
    const matches = knockoutMatches.filter(m => (m.consolationLevel ?? 0) === level);
    const roundMap = new Map<number, Match[]>();
    for (const m of matches) { const r = m.knockoutRound ?? 0; if (!roundMap.has(r)) roundMap.set(r, []); roundMap.get(r)!.push(m); }
    const roundNums = [...roundMap.keys()].sort((a, b) => a - b);
    if (roundNums.length === 0) return [];

    // Find bye teams per round
    const byesPerRound = new Map<number, string[]>();
    for (const kr of knockoutRounds) {
      if (!kr.byeTeamIds?.length) continue;
      const krLevel = kr.consolationLevel ?? 0;
      if (krLevel === level) byesPerRound.set(kr.round, kr.byeTeamIds);
    }

    // Build a lookup: "which match/bye in round R produced teamId as winner?"
    // For a match: winner goes forward. For a bye: the team goes forward.
    function findSource(teamId: string, beforeRound: number): BNode | null {
      // Search in rounds before beforeRound, from latest to earliest
      for (let ri = roundNums.indexOf(beforeRound) - 1; ri >= 0; ri--) {
        const rNum = roundNums[ri];
        const rMatches = roundMap.get(rNum) ?? [];
        for (const m of rMatches) {
          const done = m.status === 'finished' || m.status === 'forfeit';
          if (done && getWinner(m) === teamId) {
            return buildNode(m);
          }
          // Also check if the team played in this match (even if not yet finished)
          if (!done && (m.teamAId === teamId || m.teamBId === teamId)) {
            return buildNode(m);
          }
        }
        // Check byes
        const byes = byesPerRound.get(rNum) ?? [];
        if (byes.includes(teamId)) {
          return { type: 'bye', teamId };
        }
      }
      return null;
    }

    const nodeCache = new Map<string, BNode>();

    function buildNode(m: Match): BNode {
      if (nodeCache.has(m.id)) return nodeCache.get(m.id)!;
      const round = m.knockoutRound ?? 0;
      const childA = findSource(m.teamAId, round);
      const childB = findSource(m.teamBId, round);
      const node: BNode = { type: 'match', match: m, childA, childB };
      nodeCache.set(m.id, node);
      return node;
    }

    // Build trees from the last round's matches (finals)
    const lastRound = roundNums[roundNums.length - 1];
    const lastMatches = roundMap.get(lastRound) ?? [];
    return lastMatches.map(m => buildNode(m));
  }

  // Render a tree node recursively
  const CONN_W = 20;
  const GAP = 3;

  const renderNode = (node: BNode): ReactElement => {
    if (node.type === 'bye') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', padding: `${GAP / 2}px 0` }}>
          <div style={{ width: 155, border: `1px dashed ${borderColor}`, borderRadius: 6, background: byeBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 7px', height: 40 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: textColor }}>{getTeamName(tournament, node.teamId)}</span>
            <span style={{ fontSize: 8, color: mutedColor, fontStyle: 'italic' }}>exempt</span>
          </div>
        </div>
      );
    }

    const m = node.match;
    const done = m.status === 'finished' || m.status === 'forfeit';
    const winnerId = done ? getWinner(m) : null;

    const mBox = (
      <div style={{ width: 155, border: `2px solid ${done ? '#22c55e' : borderColor}`, borderRadius: 6, overflow: 'hidden', background: cardBg, flexShrink: 0 }}>
        {[{ tid: m.teamAId, sc: m.scoreA, w: winnerId === m.teamAId }, { tid: m.teamBId, sc: m.scoreB, w: winnerId === m.teamBId }].map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 7px', height: 19, background: s.w ? winBg : 'transparent', borderBottom: i === 0 ? `1px solid ${borderColor}` : 'none' }}>
            <span style={{ fontSize: 10, fontWeight: s.w ? 700 : 400, color: textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{getTeamName(tournament, s.tid)}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: textColor }}>{done ? s.sc : ''}</span>
          </div>
        ))}
      </div>
    );

    const hasA = node.childA !== null;
    const hasB = node.childB !== null;

    if (!hasA && !hasB) {
      // Leaf match (first round, no sources)
      return <div style={{ display: 'flex', alignItems: 'center', padding: `${GAP / 2}px 0` }}>{mBox}</div>;
    }

    if (hasA && !hasB) {
      return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {renderNode(node.childA!)}
          <div style={{ width: CONN_W, display: 'flex', alignItems: 'center' }}><div style={{ width: '100%', borderTop: `1.5px solid ${lineColor}` }} /></div>
          {mBox}
        </div>
      );
    }

    if (!hasA && hasB) {
      return (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {renderNode(node.childB!)}
          <div style={{ width: CONN_W, display: 'flex', alignItems: 'center' }}><div style={{ width: '100%', borderTop: `1.5px solid ${lineColor}` }} /></div>
          {mBox}
        </div>
      );
    }

    // Both children
    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {renderNode(node.childA!)}
          {renderNode(node.childB!)}
        </div>
        <ConnectorSvg width={CONN_W} color={lineColor} />
        {mBox}
      </div>
    );
  };

  const renderLevel = (level: number) => {
    const trees = buildTree(level);
    if (trees.length === 0) return null;

    const color = LEVEL_COLORS[level % LEVEL_COLORS.length];

    // Check if final is done
    const finalNode = trees.length === 1 && trees[0].type === 'match' ? trees[0] : null;
    const finalDone = finalNode && (finalNode.match.status === 'finished' || finalNode.match.status === 'forfeit');

    return (
      <div key={level} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: level === 0 ? textColor : color, marginBottom: 6, borderLeft: level > 0 ? `3px solid ${color}` : 'none', paddingLeft: level > 0 ? 8 : 0 }}>
          {getLevelTitle(level)}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: GAP * 2 }}>
            {trees.map((node, i) => <div key={i}>{renderNode(node)}</div>)}
          </div>
          {finalDone && finalNode && (
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 10, justifyContent: 'center', alignSelf: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', textAlign: 'center', marginBottom: 3 }}>
                {level === 0 ? 'Vainqueur' : `${level * 2 + 1}e place`}
              </div>
              <div style={{ border: '2px solid #22c55e', borderRadius: 6, padding: '6px 10px', background: winBg, textAlign: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: textColor }}>{getTeamName(tournament, getWinner(finalNode.match))}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (levels.length === 0) return null;

  return (
    <div style={{ background: bg, borderRadius: 12, padding: 16, boxShadow: dark ? 'none' : '0 1px 3px rgba(0,0,0,0.1)', overflowX: 'auto' }}>
      {levels.map(level => renderLevel(level))}
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
