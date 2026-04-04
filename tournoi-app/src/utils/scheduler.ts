import type { Pool, Team, Match, Court, Rotation, KnockoutRound } from '../types/tournament';

function createMatch(teamAId: string, teamBId: string, poolId?: string, knockoutRound?: number): Match {
  return {
    id: crypto.randomUUID(),
    teamAId,
    teamBId,
    courtId: '',
    rotationId: '',
    poolId,
    knockoutRound,
    status: 'scheduled',
  };
}

export function generatePoolMatches(pool: Pool, teams: Team[]): Match[] {
  const poolTeamIds = teams
    .filter((t) => pool.teamIds.includes(t.id))
    .map((t) => t.id);

  const matches: Match[] = [];
  for (let i = 0; i < poolTeamIds.length; i++) {
    for (let j = i + 1; j < poolTeamIds.length; j++) {
      matches.push(createMatch(poolTeamIds[i], poolTeamIds[j], pool.id));
    }
  }
  return matches;
}

export function generateChampionshipMatches(teams: Team[]): Match[] {
  const matches: Match[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matches.push(createMatch(teams[i].id, teams[j].id));
    }
  }
  return matches;
}

export function generateKnockoutMatches(teams: Team[], round: number): KnockoutRound {
  const n = teams.length;
  if (n < 2) return { round, matches: [], byeTeamIds: teams.map(t => t.id) };

  // Calculate next power of 2
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(n)));
  const numByes = nextPow2 - n;

  // Byes go to the LAST seeds (so top seeds play, bottom seeds get byes)
  // This means the first (n - numByes) teams are paired, the rest get byes
  // Actually, distribute byes at the end of the bracket
  const playingCount = n - numByes; // teams that play in this round (always even)
  const byeTeams = teams.slice(playingCount); // these advance directly
  const playingTeams = teams.slice(0, playingCount);

  const matches: Match[] = [];
  for (let i = 0; i < playingTeams.length; i += 2) {
    matches.push(createMatch(playingTeams[i].id, playingTeams[i + 1].id, undefined, round));
  }

  return { round, matches, byeTeamIds: byeTeams.map(t => t.id) };
}

export function assignMatchesToRotations(matches: Match[], courts: Court[]): Rotation[] {
  const remaining = [...matches];
  const rotations: Rotation[] = [];
  let rotationNumber = 1;

  while (remaining.length > 0) {
    const rotationId = crypto.randomUUID();
    const rotationMatches: Match[] = [];
    const busyTeams = new Set<string>();

    for (let courtIndex = 0; courtIndex < courts.length; courtIndex++) {
      const matchIndex = remaining.findIndex(
        (m) => !busyTeams.has(m.teamAId) && !busyTeams.has(m.teamBId)
      );

      if (matchIndex === -1) break;

      const match = remaining.splice(matchIndex, 1)[0];
      match.courtId = courts[courtIndex].id;
      match.rotationId = rotationId;
      busyTeams.add(match.teamAId);
      busyTeams.add(match.teamBId);
      rotationMatches.push(match);
    }

    rotations.push({
      id: rotationId,
      number: rotationNumber,
      matches: rotationMatches,
    });

    rotationNumber++;
  }

  return rotations;
}
