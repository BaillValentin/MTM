export type TournamentFormat = 'pools' | 'knockout' | 'pools_knockout' | 'championship';
export type MatchStatus = 'scheduled' | 'in_progress' | 'finished' | 'forfeit';
export type TournamentStatus = 'setup' | 'teams' | 'ready' | 'in_progress' | 'finished';
export type TiebreakerCriteria = 'goal_difference' | 'goals_scored' | 'head_to_head' | 'wins';

export interface Player {
  id: string;
  firstName: string;
  className?: string;
}

export interface Team {
  id: string;
  name: string;
  players: Player[];
  poolId?: string;
}

export interface Court {
  id: string;
  name: string;
}

export interface Match {
  id: string;
  teamAId: string;
  teamBId: string;
  courtId: string;
  rotationId: string;
  poolId?: string;
  knockoutRound?: number;
  consolationLevel?: number; // 0 or undefined = main, 1 = consolante, 2 = consolante de consolante, etc.
  scoreA?: number;
  scoreB?: number;
  status: MatchStatus;
}

export interface Rotation {
  id: string;
  number: number;
  matches: Match[];
}

export interface Pool {
  id: string;
  name: string;
  teamIds: string[];
}

export interface KnockoutRound {
  round: number;
  matches: Match[];
  byeTeamIds?: string[];
  consolationLevel?: number;
}

export interface ScoringConfig {
  win: number;
  draw: number;
  loss: number;
}

export interface Tournament {
  id: string;
  name: string;
  sport: string;
  format: TournamentFormat;
  courts: Court[];
  matchDuration: number;
  scoring: ScoringConfig;
  tiebreakers: TiebreakerCriteria[];
  teams: Team[];
  pools: Pool[];
  knockoutRounds: KnockoutRound[];
  rotations: Rotation[];
  status: TournamentStatus;
  createdAt: string;
  qualifiedPerPool?: number;
}

export interface TeamStanding {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}
