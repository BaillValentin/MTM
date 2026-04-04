import type { Match, ScoringConfig, TeamStanding, TiebreakerCriteria } from '../types/tournament';

export function calculateStandings(
  matches: Match[],
  teamIds: string[],
  scoring: ScoringConfig
): TeamStanding[] {
  const standingsMap = new Map<string, TeamStanding>();

  for (const id of teamIds) {
    standingsMap.set(id, {
      teamId: id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  }

  const finishedMatches = matches.filter(
    (m) => m.status === 'finished' && m.scoreA != null && m.scoreB != null
  );

  for (const match of finishedMatches) {
    const standingA = standingsMap.get(match.teamAId);
    const standingB = standingsMap.get(match.teamBId);
    if (!standingA || !standingB) continue;

    const scoreA = match.scoreA!;
    const scoreB = match.scoreB!;

    standingA.played++;
    standingB.played++;
    standingA.goalsFor += scoreA;
    standingA.goalsAgainst += scoreB;
    standingB.goalsFor += scoreB;
    standingB.goalsAgainst += scoreA;

    if (scoreA > scoreB) {
      standingA.wins++;
      standingA.points += scoring.win;
      standingB.losses++;
      standingB.points += scoring.loss;
    } else if (scoreA < scoreB) {
      standingB.wins++;
      standingB.points += scoring.win;
      standingA.losses++;
      standingA.points += scoring.loss;
    } else {
      standingA.draws++;
      standingA.points += scoring.draw;
      standingB.draws++;
      standingB.points += scoring.draw;
    }
  }

  for (const standing of standingsMap.values()) {
    standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
  }

  return Array.from(standingsMap.values());
}

function getHeadToHeadPoints(
  teamA: string,
  teamB: string,
  matches: Match[]
): number {
  let pointsA = 0;
  const h2h = matches.filter(
    (m) =>
      m.status === 'finished' &&
      m.scoreA != null &&
      m.scoreB != null &&
      ((m.teamAId === teamA && m.teamBId === teamB) ||
        (m.teamAId === teamB && m.teamBId === teamA))
  );

  for (const m of h2h) {
    const isA = m.teamAId === teamA;
    const scoreSelf = isA ? m.scoreA! : m.scoreB!;
    const scoreOther = isA ? m.scoreB! : m.scoreA!;
    if (scoreSelf > scoreOther) pointsA += 3;
    else if (scoreSelf === scoreOther) pointsA += 1;
  }

  return pointsA;
}

export function sortStandings(
  standings: TeamStanding[],
  tiebreakers: TiebreakerCriteria[],
  matches: Match[]
): TeamStanding[] {
  return [...standings].sort((a, b) => {
    const pointsDiff = b.points - a.points;
    if (pointsDiff !== 0) return pointsDiff;

    for (const criteria of tiebreakers) {
      let diff = 0;
      switch (criteria) {
        case 'goal_difference':
          diff = b.goalDifference - a.goalDifference;
          break;
        case 'goals_scored':
          diff = b.goalsFor - a.goalsFor;
          break;
        case 'wins':
          diff = b.wins - a.wins;
          break;
        case 'head_to_head': {
          const h2hA = getHeadToHeadPoints(a.teamId, b.teamId, matches);
          const h2hB = getHeadToHeadPoints(b.teamId, a.teamId, matches);
          diff = h2hB - h2hA;
          break;
        }
      }
      if (diff !== 0) return diff;
    }

    return 0;
  });
}
