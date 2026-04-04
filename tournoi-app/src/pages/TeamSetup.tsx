import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTournamentStore, useSavedTeamsStore } from '../store/tournamentStore';
import { shuffleTeams } from '../utils/teamGenerator';
import {
  generatePoolMatches,
  generateChampionshipMatches,
  generateKnockoutMatches,
  assignMatchesToRotations,
} from '../utils/scheduler';
import type { Player, Pool } from '../types/tournament';

type Mode = 'manual' | 'shuffle';

export default function TeamSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tournament = useTournamentStore((s) => s.tournaments.find((t) => t.id === id));
  const {
    addTeam,
    removeTeam,
    updateTeam,
    addPlayer,
    removePlayer,
    setPools,
    setRotations,
    setKnockoutRounds,
    startTournament,
  } = useTournamentStore();

  const { savedTeams, saveTeams, removeSavedTeam } = useSavedTeamsStore();
  const [mode, setMode] = useState<Mode>('manual');
  const [showSaved, setShowSaved] = useState(false);

  // Manual mode state
  const [newTeamName, setNewTeamName] = useState('');
  const [playerInputs, setPlayerInputs] = useState<Record<string, { firstName: string; className: string }>>({});

  // Shuffle mode state
  const [playersText, setPlayersText] = useState('');
  const [numberOfTeams, setNumberOfTeams] = useState(2);

  if (!id || !tournament) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={{ color: '#64748b', textAlign: 'center' as const }}>Tournoi introuvable.</p>
          <button style={styles.btnPrimary} onClick={() => navigate('/')}>
            Retour a l'accueil
          </button>
        </div>
      </div>
    );
  }

  const totalPlayers = tournament.teams.reduce((sum, t) => sum + t.players.length, 0);

  // --- Manual mode handlers ---

  const handleAddTeam = () => {
    const name = newTeamName.trim();
    if (!name) return;
    addTeam(id, name);
    setNewTeamName('');
  };

  const handleRemoveTeam = (teamId: string, teamName: string) => {
    if (window.confirm(`Supprimer l'equipe "${teamName}" et tous ses joueurs ?`)) {
      removeTeam(id, teamId);
    }
  };

  const handleTeamNameChange = (teamId: string, name: string) => {
    updateTeam(id, teamId, { name });
  };

  const getPlayerInput = (teamId: string) =>
    playerInputs[teamId] || { firstName: '', className: '' };

  const setPlayerInput = (teamId: string, data: { firstName: string; className: string }) => {
    setPlayerInputs((prev) => ({ ...prev, [teamId]: data }));
  };

  const handleAddPlayer = (teamId: string) => {
    const input = getPlayerInput(teamId);
    const firstName = input.firstName.trim();
    if (!firstName) return;
    addPlayer(id, teamId, {
      firstName,
      className: input.className.trim() || undefined,
    });
    setPlayerInput(teamId, { firstName: '', className: '' });
  };

  const handleRemovePlayer = (teamId: string, playerId: string) => {
    removePlayer(id, teamId, playerId);
  };

  // --- Shuffle mode handlers ---

  const handleShuffle = () => {
    if (numberOfTeams < 2) {
      alert('Il faut au moins 2 equipes.');
      return;
    }

    const lines = playersText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      alert('Ajoutez au moins un joueur.');
      return;
    }

    if (tournament.teams.length > 0) {
      if (!window.confirm('Des equipes existent deja. Le tirage au sort va les remplacer. Continuer ?')) {
        return;
      }
    }

    // Parse players
    const players: Player[] = lines.map((line) => {
      const parts = line.split('-').map((p) => p.trim());
      return {
        id: crypto.randomUUID(),
        firstName: parts[0],
        className: parts[1] || undefined,
      };
    });

    // Shuffle
    const newTeams = shuffleTeams(players, numberOfTeams);

    // Remove existing teams
    for (const t of [...tournament.teams]) {
      removeTeam(id, t.id);
    }

    // Add new teams via store
    for (const team of newTeams) {
      const teamId = addTeam(id, team.name);
      for (const player of team.players) {
        addPlayer(id, teamId, {
          firstName: player.firstName,
          className: player.className,
        });
      }
    }
  };

  // --- Launch tournament ---

  const canLaunch = tournament.teams.length >= 2;

  const handleLaunch = () => {
    if (!canLaunch) return;

    const { teams, courts, format } = tournament;

    if (courts.length === 0) {
      alert('Aucun terrain configure. Retournez a la configuration pour ajouter des terrains.');
      return;
    }

    if (format === 'pools' || format === 'pools_knockout') {
      const input = prompt(
        `Nombre de poules ? (${teams.length} equipes, ${courts.length} terrain(s))`,
        String(Math.min(courts.length, Math.floor(teams.length / 2)))
      );
      if (!input) return;
      const numPools = parseInt(input, 10);
      if (isNaN(numPools) || numPools < 1 || numPools > Math.floor(teams.length / 2)) {
        alert('Nombre de poules invalide.');
        return;
      }

      // Create pools - distribute teams evenly
      const pools: Pool[] = Array.from({ length: numPools }, (_, i) => ({
        id: crypto.randomUUID(),
        name: `Poule ${String.fromCharCode(65 + i)}`,
        teamIds: [] as string[],
      }));

      teams.forEach((team, idx) => {
        pools[idx % numPools].teamIds.push(team.id);
      });

      setPools(id, pools);

      // Generate matches for each pool then assign rotations
      const allMatches = pools.flatMap((pool) => generatePoolMatches(pool, teams));
      const rotations = assignMatchesToRotations(allMatches, courts);
      setRotations(id, rotations);
    } else if (format === 'championship') {
      const matches = generateChampionshipMatches(teams);
      const rotations = assignMatchesToRotations(matches, courts);
      setRotations(id, rotations);
    } else if (format === 'knockout') {
      const knockoutRound = generateKnockoutMatches(teams, 1);
      const rotations = assignMatchesToRotations(knockoutRound.matches, courts);
      setKnockoutRounds(id, [knockoutRound]);
      setRotations(id, rotations);
    }

    startTournament(id);
    navigate(`/tournament/${id}/play`);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>{tournament.name} - Equipes</h1>

      {/* Toggle mode */}
      <div style={styles.toggleRow}>
        <button
          style={mode === 'manual' ? styles.toggleActive : styles.toggleInactive}
          onClick={() => setMode('manual')}
        >
          Creation manuelle
        </button>
        <button
          style={mode === 'shuffle' ? styles.toggleActive : styles.toggleInactive}
          onClick={() => setMode('shuffle')}
        >
          Tirage au sort
        </button>
      </div>

      {/* ===== MANUAL MODE ===== */}
      {mode === 'manual' && (
        <div>
          {/* Add team */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Ajouter une equipe</h2>
            <div style={styles.inputRow}>
              <input
                style={styles.input}
                placeholder="Nom de l'equipe"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
              />
              <button style={styles.btnPrimary} onClick={handleAddTeam}>
                Ajouter l'equipe
              </button>
            </div>
          </div>

          {/* Team cards */}
          {tournament.teams.map((team) => {
            const pi = getPlayerInput(team.id);
            return (
              <div key={team.id} style={styles.card}>
                <div style={styles.teamHeader}>
                  <input
                    style={styles.teamNameInput}
                    value={team.name}
                    onChange={(e) => handleTeamNameChange(team.id, e.target.value)}
                  />
                  <button
                    style={styles.btnDanger}
                    onClick={() => handleRemoveTeam(team.id, team.name)}
                    title="Supprimer l'equipe"
                  >
                    Supprimer
                  </button>
                </div>

                {/* Players list */}
                {team.players.length > 0 && (
                  <ul style={styles.playerList}>
                    {team.players.map((player) => (
                      <li key={player.id} style={styles.playerItem}>
                        <span style={styles.playerName}>
                          {player.firstName}
                          {player.className && (
                            <span style={styles.playerClass}> - {player.className}</span>
                          )}
                        </span>
                        <button
                          style={styles.btnRemovePlayer}
                          onClick={() => handleRemovePlayer(team.id, player.id)}
                          title="Supprimer le joueur"
                        >
                          &#10005;
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Add player */}
                <div style={styles.addPlayerRow}>
                  <input
                    style={{ ...styles.input, flex: 2 }}
                    placeholder="Prenom"
                    value={pi.firstName}
                    onChange={(e) =>
                      setPlayerInput(team.id, { ...pi, firstName: e.target.value })
                    }
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer(team.id)}
                  />
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    placeholder="Classe (optionnel)"
                    value={pi.className}
                    onChange={(e) =>
                      setPlayerInput(team.id, { ...pi, className: e.target.value })
                    }
                    onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer(team.id)}
                  />
                  <button
                    style={styles.btnSmallPrimary}
                    onClick={() => handleAddPlayer(team.id)}
                  >
                    + Joueur
                  </button>
                </div>
              </div>
            );
          })}

          {tournament.teams.length === 0 && (
            <div style={{ ...styles.card, textAlign: 'center' as const }}>
              <p style={{ color: '#94a3b8', margin: 0 }}>Aucune equipe pour le moment.</p>
            </div>
          )}
        </div>
      )}

      {/* ===== SHUFFLE MODE ===== */}
      {mode === 'shuffle' && (
        <div>
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Liste des joueurs</h2>
            <p style={styles.hint}>
              Un joueur par ligne. Format : "Prenom" ou "Prenom - Classe"
            </p>
            <textarea
              style={styles.textarea}
              rows={10}
              placeholder={"Lucas\nEmma - 6eA\nNoah - 5eB\nLea"}
              value={playersText}
              onChange={(e) => setPlayersText(e.target.value)}
            />
          </div>

          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Nombre d'equipes</h2>
            <div style={styles.inputRow}>
              <input
                style={{ ...styles.input, maxWidth: 120 }}
                type="number"
                min={2}
                value={numberOfTeams}
                onChange={(e) => setNumberOfTeams(Math.max(2, parseInt(e.target.value) || 2))}
              />
              <button style={styles.btnPrimary} onClick={handleShuffle}>
                Tirer au sort
              </button>
            </div>
          </div>

          {/* Show resulting teams (same display as manual) */}
          {tournament.teams.length > 0 && (
            <>
              <h2 style={{ ...styles.sectionTitle, marginTop: 24, marginBottom: 12 }}>
                Resultat du tirage
              </h2>
              {tournament.teams.map((team) => {
                const pi = getPlayerInput(team.id);
                return (
                  <div key={team.id} style={styles.card}>
                    <div style={styles.teamHeader}>
                      <input
                        style={styles.teamNameInput}
                        value={team.name}
                        onChange={(e) => handleTeamNameChange(team.id, e.target.value)}
                      />
                      <button
                        style={styles.btnDanger}
                        onClick={() => handleRemoveTeam(team.id, team.name)}
                        title="Supprimer l'equipe"
                      >
                        Supprimer
                      </button>
                    </div>

                    {team.players.length > 0 && (
                      <ul style={styles.playerList}>
                        {team.players.map((player) => (
                          <li key={player.id} style={styles.playerItem}>
                            <span style={styles.playerName}>
                              {player.firstName}
                              {player.className && (
                                <span style={styles.playerClass}> - {player.className}</span>
                              )}
                            </span>
                            <button
                              style={styles.btnRemovePlayer}
                              onClick={() => handleRemovePlayer(team.id, player.id)}
                              title="Supprimer le joueur"
                            >
                              &#10005;
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div style={styles.addPlayerRow}>
                      <input
                        style={{ ...styles.input, flex: 2 }}
                        placeholder="Prenom"
                        value={pi.firstName}
                        onChange={(e) =>
                          setPlayerInput(team.id, { ...pi, firstName: e.target.value })
                        }
                        onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer(team.id)}
                      />
                      <input
                        style={{ ...styles.input, flex: 1 }}
                        placeholder="Classe (optionnel)"
                        value={pi.className}
                        onChange={(e) =>
                          setPlayerInput(team.id, { ...pi, className: e.target.value })
                        }
                        onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer(team.id)}
                      />
                      <button
                        style={styles.btnSmallPrimary}
                        onClick={() => handleAddPlayer(team.id)}
                      >
                        + Joueur
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ===== SAVED TEAMS ===== */}
      {tournament.teams.length > 0 && (
        <div style={{ ...styles.card, marginTop: 16 }}>
          <button
            style={styles.btnPrimary}
            onClick={() => {
              saveTeams(tournament.teams.map(t => ({ id: t.id, name: t.name, players: t.players })));
              alert('Equipes sauvegardees !');
            }}
          >
            Sauvegarder ces equipes
          </button>
        </div>
      )}

      {savedTeams.length > 0 && (
        <div style={{ ...styles.card, marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={styles.sectionTitle}>Equipes enregistrees ({savedTeams.length})</h2>
            <button style={styles.btnSmallPrimary} onClick={() => setShowSaved(!showSaved)}>
              {showSaved ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          {showSaved && (
            <div>
              {savedTeams.map(st => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 14, color: '#1e293b', fontWeight: 500 }}>
                    {st.name} ({st.players.length} joueurs)
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={{ ...styles.btnSmallPrimary, padding: '4px 10px', fontSize: 12 }}
                      onClick={() => {
                        const teamId = addTeam(id, st.name);
                        for (const p of st.players) {
                          addPlayer(id, teamId, { firstName: p.firstName, className: p.className });
                        }
                      }}
                    >
                      Charger
                    </button>
                    <button
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                      onClick={() => removeSavedTeam(st.id)}
                    >
                      &#10005;
                    </button>
                  </div>
                </div>
              ))}
              <button
                style={{ ...styles.btnPrimary, marginTop: 10, width: '100%' }}
                onClick={() => {
                  if (tournament.teams.length > 0 && !window.confirm('Cela va ajouter toutes les equipes enregistrees. Continuer ?')) return;
                  for (const st of savedTeams) {
                    const teamId = addTeam(id, st.name);
                    for (const p of st.players) {
                      addPlayer(id, teamId, { firstName: p.firstName, className: p.className });
                    }
                  }
                }}
              >
                Charger toutes les equipes
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== FOOTER ===== */}
      <div style={styles.summaryCard}>
        <p style={styles.summaryText}>
          {tournament.teams.length} equipe{tournament.teams.length !== 1 ? 's' : ''} &middot;{' '}
          {totalPlayers} joueur{totalPlayers !== 1 ? 's' : ''} au total
        </p>
      </div>

      <div style={styles.footerButtons}>
        <button
          style={styles.btnSecondary}
          onClick={() => navigate(`/tournament/${id}/setup`)}
        >
          Retour a la configuration
        </button>
        <button
          style={canLaunch ? styles.btnPrimary : styles.btnDisabled}
          disabled={!canLaunch}
          onClick={handleLaunch}
        >
          Lancer le tournoi
        </button>
      </div>
    </div>
  );
}

/* ===== STYLES ===== */

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '24px 16px 80px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: 700,
    margin: '0 auto',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1e293b',
    margin: '0 0 20px',
  },

  // Toggle
  toggleRow: {
    display: 'flex',
    gap: 0,
    marginBottom: 20,
    borderRadius: 10,
    overflow: 'hidden',
    border: '2px solid #2563eb',
  },
  toggleActive: {
    flex: 1,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#fff',
  },
  toggleInactive: {
    flex: 1,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: '#fff',
    color: '#2563eb',
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: '16px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1e293b',
    margin: '0 0 12px',
  },
  hint: {
    fontSize: 13,
    color: '#94a3b8',
    margin: '0 0 8px',
  },

  // Inputs
  inputRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    outline: 'none',
    color: '#1e293b',
    minWidth: 0,
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    outline: 'none',
    color: '#1e293b',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },

  // Team header
  teamHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  teamNameInput: {
    flex: 1,
    padding: '6px 10px',
    fontSize: 15,
    fontWeight: 600,
    border: '1px solid transparent',
    borderRadius: 6,
    color: '#1e293b',
    background: 'transparent',
    outline: 'none',
    transition: 'border-color 0.15s',
  },

  // Players
  playerList: {
    listStyle: 'none',
    margin: '0 0 10px',
    padding: 0,
  },
  playerItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 8px',
    borderBottom: '1px solid #f1f5f9',
  },
  playerName: {
    fontSize: 14,
    color: '#1e293b',
  },
  playerClass: {
    color: '#94a3b8',
    fontSize: 13,
  },
  btnRemovePlayer: {
    background: 'none',
    border: 'none',
    color: '#dc2626',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 6px',
    borderRadius: 4,
    fontWeight: 700,
  },
  addPlayerRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },

  // Buttons
  btnPrimary: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  btnSmallPrimary: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  btnDanger: {
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  btnSecondary: {
    backgroundColor: '#fff',
    color: '#1e293b',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  btnDisabled: {
    backgroundColor: '#cbd5e1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'not-allowed',
    whiteSpace: 'nowrap' as const,
  },

  // Footer
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: '12px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center' as const,
  },
  summaryText: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: '#1e293b',
  },
  footerButtons: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap' as const,
  },
};
