import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Tournament,
  TournamentFormat,
  TournamentStatus,
  Team,
  Player,
  Court,
  Match,
  MatchStatus,
  Rotation,
  Pool,
  KnockoutRound,
  ScoringConfig,
  TiebreakerCriteria,
} from '../types/tournament';

interface TournamentState {
  tournaments: Tournament[];
  currentTournamentId: string | null;

  getCurrentTournament: () => Tournament | undefined;

  createTournament: (data: {
    name: string;
    sport: string;
    format: TournamentFormat;
    matchDuration: number;
    scoring: ScoringConfig;
    tiebreakers: TiebreakerCriteria[];
    qualifiedPerPool?: number;
  }) => string;
  updateTournament: (id: string, data: Partial<Omit<Tournament, 'id' | 'createdAt'>>) => void;
  deleteTournament: (id: string) => void;
  setCurrentTournament: (id: string | null) => void;

  addTeam: (tournamentId: string, name: string) => string;
  removeTeam: (tournamentId: string, teamId: string) => void;
  updateTeam: (tournamentId: string, teamId: string, data: Partial<Omit<Team, 'id'>>) => void;

  addPlayer: (tournamentId: string, teamId: string, player: Omit<Player, 'id'>) => string;
  removePlayer: (tournamentId: string, teamId: string, playerId: string) => void;

  addCourt: (tournamentId: string, name: string) => string;
  removeCourt: (tournamentId: string, courtId: string) => void;
  updateCourt: (tournamentId: string, courtId: string, data: Partial<Omit<Court, 'id'>>) => void;

  updateMatch: (
    tournamentId: string,
    matchId: string,
    data: { scoreA?: number; scoreB?: number; status?: MatchStatus }
  ) => void;

  setRotations: (tournamentId: string, rotations: Rotation[]) => void;
  setPools: (tournamentId: string, pools: Pool[]) => void;
  setKnockoutRounds: (tournamentId: string, knockoutRounds: KnockoutRound[]) => void;

  startTournament: (tournamentId: string) => void;
  finishTournament: (tournamentId: string) => void;
}

function updateTournamentInList(
  tournaments: Tournament[],
  tournamentId: string,
  updater: (t: Tournament) => Tournament
): Tournament[] {
  return tournaments.map((t) => (t.id === tournamentId ? updater(t) : t));
}

export const useTournamentStore = create<TournamentState>()(
  persist(
    (set, get) => ({
      tournaments: [],
      currentTournamentId: null,

      getCurrentTournament: () => {
        const { tournaments, currentTournamentId } = get();
        return tournaments.find((t) => t.id === currentTournamentId);
      },

      createTournament: (data) => {
        const id = crypto.randomUUID();
        const tournament: Tournament = {
          id,
          name: data.name,
          sport: data.sport,
          format: data.format,
          courts: [],
          matchDuration: data.matchDuration,
          scoring: data.scoring,
          tiebreakers: data.tiebreakers,
          teams: [],
          pools: [],
          knockoutRounds: [],
          rotations: [],
          status: 'setup',
          createdAt: new Date().toISOString(),
          qualifiedPerPool: data.qualifiedPerPool,
        };
        set((state) => ({
          tournaments: [...state.tournaments, tournament],
          currentTournamentId: id,
        }));
        return id;
      },

      updateTournament: (id, data) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, id, (t) => ({
            ...t,
            ...data,
          })),
        }));
      },

      deleteTournament: (id) => {
        set((state) => ({
          tournaments: state.tournaments.filter((t) => t.id !== id),
          currentTournamentId:
            state.currentTournamentId === id ? null : state.currentTournamentId,
        }));
      },

      setCurrentTournament: (id) => {
        set({ currentTournamentId: id });
      },

      addTeam: (tournamentId, name) => {
        const teamId = crypto.randomUUID();
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            teams: [...t.teams, { id: teamId, name, players: [] }],
          })),
        }));
        return teamId;
      },

      removeTeam: (tournamentId, teamId) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            teams: t.teams.filter((team) => team.id !== teamId),
            pools: t.pools.map((pool) => ({
              ...pool,
              teamIds: pool.teamIds.filter((id) => id !== teamId),
            })),
          })),
        }));
      },

      updateTeam: (tournamentId, teamId, data) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            teams: t.teams.map((team) =>
              team.id === teamId ? { ...team, ...data } : team
            ),
          })),
        }));
      },

      addPlayer: (tournamentId, teamId, playerData) => {
        const playerId = crypto.randomUUID();
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            teams: t.teams.map((team) =>
              team.id === teamId
                ? { ...team, players: [...team.players, { id: playerId, ...playerData }] }
                : team
            ),
          })),
        }));
        return playerId;
      },

      removePlayer: (tournamentId, teamId, playerId) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            teams: t.teams.map((team) =>
              team.id === teamId
                ? { ...team, players: team.players.filter((p) => p.id !== playerId) }
                : team
            ),
          })),
        }));
      },

      addCourt: (tournamentId, name) => {
        const courtId = crypto.randomUUID();
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            courts: [...t.courts, { id: courtId, name }],
          })),
        }));
        return courtId;
      },

      removeCourt: (tournamentId, courtId) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            courts: t.courts.filter((c) => c.id !== courtId),
          })),
        }));
      },

      updateCourt: (tournamentId, courtId, data) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            courts: t.courts.map((c) =>
              c.id === courtId ? { ...c, ...data } : c
            ),
          })),
        }));
      },

      updateMatch: (tournamentId, matchId, data) => {
        const updateMatchInList = (matches: Match[]): Match[] =>
          matches.map((m) => (m.id === matchId ? { ...m, ...data } : m));

        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            rotations: t.rotations.map((r) => ({
              ...r,
              matches: updateMatchInList(r.matches),
            })),
            knockoutRounds: t.knockoutRounds.map((kr) => ({
              ...kr,
              matches: updateMatchInList(kr.matches),
            })),
          })),
        }));
      },

      setRotations: (tournamentId, rotations) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            rotations,
          })),
        }));
      },

      setPools: (tournamentId, pools) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            pools,
          })),
        }));
      },

      setKnockoutRounds: (tournamentId, knockoutRounds) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            knockoutRounds,
          })),
        }));
      },

      startTournament: (tournamentId) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            status: 'in_progress' as TournamentStatus,
          })),
        }));
      },

      finishTournament: (tournamentId) => {
        set((state) => ({
          tournaments: updateTournamentInList(state.tournaments, tournamentId, (t) => ({
            ...t,
            status: 'finished' as TournamentStatus,
          })),
        }));
      },
    }),
    {
      name: 'tournament-storage',
    }
  )
);

interface SavedTeam {
  id: string;
  name: string;
  players: Player[];
}

interface SavedTeamsState {
  savedTeams: SavedTeam[];
  saveTeam: (team: SavedTeam) => void;
  saveTeams: (teams: SavedTeam[]) => void;
  removeSavedTeam: (id: string) => void;
  clearSavedTeams: () => void;
}

export const useSavedTeamsStore = create<SavedTeamsState>()(
  persist(
    (set) => ({
      savedTeams: [],
      saveTeam: (team) =>
        set((state) => ({
          savedTeams: state.savedTeams.some((t) => t.id === team.id)
            ? state.savedTeams.map((t) => (t.id === team.id ? team : t))
            : [...state.savedTeams, team],
        })),
      saveTeams: (teams) =>
        set((state) => {
          const existing = new Map(state.savedTeams.map((t) => [t.id, t]));
          teams.forEach((t) => existing.set(t.id, t));
          return { savedTeams: Array.from(existing.values()) };
        }),
      removeSavedTeam: (id) =>
        set((state) => ({ savedTeams: state.savedTeams.filter((t) => t.id !== id) })),
      clearSavedTeams: () => set({ savedTeams: [] }),
    }),
    { name: 'saved-teams-storage' }
  )
);
