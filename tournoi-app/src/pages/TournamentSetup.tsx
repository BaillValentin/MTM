import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTournamentStore } from '../store/tournamentStore';
import type { TournamentFormat, TiebreakerCriteria } from '../types/tournament';

const formatOptions: { value: TournamentFormat; label: string }[] = [
  { value: 'pools', label: 'Phases de poules' },
  { value: 'knockout', label: 'Elimination directe' },
  { value: 'pools_knockout', label: 'Poules + Elimination' },
  { value: 'championship', label: 'Championnat' },
];

const tiebreakerOptions: { value: TiebreakerCriteria; label: string }[] = [
  { value: 'goal_difference', label: 'Difference de buts' },
  { value: 'goals_scored', label: 'Buts marques' },
  { value: 'head_to_head', label: 'Confrontation directe' },
  { value: 'wins', label: 'Nombre de victoires' },
];

export default function TournamentSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    tournaments,
    createTournament,
    updateTournament,
    addCourt,
    removeCourt,
    updateCourt,
  } = useTournamentStore();

  const isNew = !id || id === 'new';
  const existingTournament = !isNew ? tournaments.find((t) => t.id === id) : undefined;

  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('pools');
  const [matchDuration, setMatchDuration] = useState(10);
  const [win, setWin] = useState(3);
  const [draw, setDraw] = useState(1);
  const [loss, setLoss] = useState(0);
  const [tiebreakers, setTiebreakers] = useState<TiebreakerCriteria[]>(['goal_difference']);
  const [qualifiedPerPool, setQualifiedPerPool] = useState(2);
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]);
  const [newCourtName, setNewCourtName] = useState('');

  useEffect(() => {
    if (existingTournament) {
      setName(existingTournament.name);
      setSport(existingTournament.sport);
      setFormat(existingTournament.format);
      setMatchDuration(existingTournament.matchDuration);
      setWin(existingTournament.scoring.win);
      setDraw(existingTournament.scoring.draw);
      setLoss(existingTournament.scoring.loss);
      setTiebreakers(existingTournament.tiebreakers);
      setQualifiedPerPool(existingTournament.qualifiedPerPool ?? 2);
      setCourts(existingTournament.courts.map((c) => ({ id: c.id, name: c.name })));
    }
  }, [existingTournament]);

  const toggleTiebreaker = (value: TiebreakerCriteria) => {
    setTiebreakers((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  };

  const handleAddCourt = () => {
    const courtName = newCourtName.trim() || `Terrain ${courts.length + 1}`;
    if (existingTournament) {
      const courtId = addCourt(existingTournament.id, courtName);
      setCourts((prev) => [...prev, { id: courtId, name: courtName }]);
    } else {
      setCourts((prev) => [...prev, { id: crypto.randomUUID(), name: courtName }]);
    }
    setNewCourtName('');
  };

  const handleRemoveCourt = (courtId: string) => {
    if (existingTournament) {
      removeCourt(existingTournament.id, courtId);
    }
    setCourts((prev) => prev.filter((c) => c.id !== courtId));
  };

  const handleCourtNameChange = (courtId: string, newName: string) => {
    if (existingTournament) {
      updateCourt(existingTournament.id, courtId, { name: newName });
    }
    setCourts((prev) => prev.map((c) => (c.id === courtId ? { ...c, name: newName } : c)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const scoring = { win, draw, loss };

    if (isNew) {
      const newId = createTournament({
        name: name.trim(),
        sport: sport.trim(),
        format,
        matchDuration,
        scoring,
        tiebreakers,
        qualifiedPerPool: format === 'pools_knockout' ? qualifiedPerPool : undefined,
      });
      // Add courts to the newly created tournament
      courts.forEach((c) => {
        addCourt(newId, c.name);
      });
      navigate(`/tournament/${newId}/teams`);
    } else if (existingTournament) {
      updateTournament(existingTournament.id, {
        name: name.trim(),
        sport: sport.trim(),
        format,
        matchDuration,
        scoring,
        tiebreakers,
        qualifiedPerPool: format === 'pools_knockout' ? qualifiedPerPool : undefined,
      });
      if (existingTournament.status === 'in_progress' || existingTournament.status === 'finished') {
        navigate(`/tournament/${existingTournament.id}/play`);
      } else {
        navigate(`/tournament/${existingTournament.id}/teams`);
      }
    }
  };

  if (!isNew && !existingTournament) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#64748b', textAlign: 'center', marginTop: 60 }}>
          Tournoi introuvable.
        </p>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button style={styles.backButton} onClick={() => navigate('/')}>
            Retour a l'accueil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => navigate('/')}>
          &#8592; Retour
        </button>
        <h1 style={styles.title}>{isNew ? 'Nouveau tournoi' : 'Modifier le tournoi'}</h1>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Nom */}
        <div style={styles.card}>
          <label style={styles.label}>Nom du tournoi *</label>
          <input
            style={styles.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Tournoi inter-classes 2026"
            required
          />

          <label style={styles.label}>Sport</label>
          <input
            style={styles.input}
            type="text"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            placeholder="Ex: Football, Handball, Volleyball..."
          />

          <label style={styles.label}>Format</label>
          <select
            style={styles.select}
            value={format}
            onChange={(e) => setFormat(e.target.value as TournamentFormat)}
          >
            {formatOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {format === 'pools_knockout' && (
            <>
              <label style={styles.label}>Qualifies par poule</label>
              <input
                style={styles.input}
                type="number"
                min={1}
                value={qualifiedPerPool}
                onChange={(e) => setQualifiedPerPool(Number(e.target.value))}
              />
            </>
          )}

          <label style={styles.label}>Duree des matchs (minutes)</label>
          <input
            style={styles.input}
            type="number"
            min={1}
            value={matchDuration}
            onChange={(e) => setMatchDuration(Number(e.target.value))}
          />
        </div>

        {/* Bareme */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Bareme de points</h2>
          <div style={styles.row}>
            <div style={styles.fieldSmall}>
              <label style={styles.labelSmall}>Victoire</label>
              <input
                style={styles.input}
                type="number"
                value={win}
                onChange={(e) => setWin(Number(e.target.value))}
              />
            </div>
            <div style={styles.fieldSmall}>
              <label style={styles.labelSmall}>Nul</label>
              <input
                style={styles.input}
                type="number"
                value={draw}
                onChange={(e) => setDraw(Number(e.target.value))}
              />
            </div>
            <div style={styles.fieldSmall}>
              <label style={styles.labelSmall}>Defaite</label>
              <input
                style={styles.input}
                type="number"
                value={loss}
                onChange={(e) => setLoss(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Criteres de departage */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Criteres de departage</h2>
          <div style={styles.checkboxGroup}>
            {tiebreakerOptions.map((opt) => (
              <label key={opt.value} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={tiebreakers.includes(opt.value)}
                  onChange={() => toggleTiebreaker(opt.value)}
                  style={styles.checkbox}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Terrains */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Terrains</h2>
          {courts.length === 0 && (
            <p style={styles.hint}>Aucun terrain ajoute. Ajoutez au moins un terrain.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {courts.map((court) => (
              <div key={court.id} style={styles.courtRow}>
                <input
                  style={{ ...styles.input, flex: 1, marginBottom: 0 }}
                  type="text"
                  value={court.name}
                  onChange={(e) => handleCourtNameChange(court.id, e.target.value)}
                />
                <button
                  type="button"
                  style={styles.removeCourtButton}
                  onClick={() => handleRemoveCourt(court.id)}
                  title="Supprimer le terrain"
                >
                  &#10005;
                </button>
              </div>
            ))}
          </div>
          <div style={styles.addCourtRow}>
            <input
              style={{ ...styles.input, flex: 1, marginBottom: 0 }}
              type="text"
              placeholder={`Terrain ${courts.length + 1}`}
              value={newCourtName}
              onChange={(e) => setNewCourtName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCourt();
                }
              }}
            />
            <button type="button" style={styles.addCourtButton} onClick={handleAddCourt}>
              + Ajouter
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button type="button" style={styles.backButton} onClick={() => navigate('/')}>
            Annuler
          </button>
          <button type="submit" style={styles.submitButton}>
            Enregistrer et continuer &#8594;
          </button>
        </div>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '24px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: 700,
    margin: '0 auto',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1e293b',
    margin: '12px 0 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1e293b',
    margin: '0 0 14px',
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: '#475569',
    marginBottom: 6,
    marginTop: 14,
  },
  labelSmall: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    fontSize: 15,
    color: '#1e293b',
    outline: 'none',
    boxSizing: 'border-box' as const,
    marginBottom: 4,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    fontSize: 15,
    color: '#1e293b',
    backgroundColor: '#fff',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  row: {
    display: 'flex',
    gap: 12,
  },
  fieldSmall: {
    flex: 1,
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    color: '#1e293b',
    cursor: 'pointer',
  },
  checkbox: {
    width: 18,
    height: 18,
    accentColor: '#2563eb',
  },
  courtRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  removeCourtButton: {
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    color: '#dc2626',
    fontSize: 14,
    fontWeight: 600,
  },
  addCourtRow: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
  },
  addCourtButton: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  hint: {
    fontSize: 13,
    color: '#94a3b8',
    margin: '0 0 8px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 24px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
