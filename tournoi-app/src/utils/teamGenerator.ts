import type { Player, Team } from '../types/tournament';

export function generateDefaultTeamNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Équipe ${i + 1}`);
}

export function shuffleTeams(
  players: Player[],
  numberOfTeams: number,
  teamNames?: string[]
): Team[] {
  const names = teamNames ?? generateDefaultTeamNames(numberOfTeams);

  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const teams: Team[] = names.map((name) => ({
    id: crypto.randomUUID(),
    name,
    players: [],
    poolId: undefined,
  }));

  shuffled.forEach((player, index) => {
    teams[index % numberOfTeams].players.push(player);
  });

  return teams;
}
