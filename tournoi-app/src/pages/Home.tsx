import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/tournamentStore';
import type { TournamentFormat, TournamentStatus } from '../types/tournament';

const formatLabels: Record<TournamentFormat, string> = {
  pools: 'Phases de poules',
  knockout: 'Elimination directe',
  pools_knockout: 'Poules + Elimination',
  championship: 'Championnat',
};

const statusLabels: Record<TournamentStatus, string> = {
  setup: 'Configuration',
  teams: 'Equipes',
  ready: 'Pret',
  in_progress: 'En cours',
  finished: 'Termine',
};

const statusColors: Record<TournamentStatus, { bg: string; text: string }> = {
  setup: { bg: '#fef3c7', text: '#92400e' },
  teams: { bg: '#dbeafe', text: '#1e40af' },
  ready: { bg: '#e0e7ff', text: '#3730a3' },
  in_progress: { bg: '#d1fae5', text: '#065f46' },
  finished: { bg: '#f3f4f6', text: '#374151' },
};

export default function Home() {
  const navigate = useNavigate();
  const { tournaments, setCurrentTournament, deleteTournament } = useTournamentStore();

  const handleCardClick = (id: string) => {
    setCurrentTournament(id);
    navigate(`/tournament/${id}`);
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (window.confirm(`Supprimer le tournoi "${name}" ? Cette action est irreversible.`)) {
      deleteTournament(id);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>
          <span style={styles.icon}>&#127942;</span> MTM
        </h1>
        <button style={styles.newButton} onClick={() => navigate('/tournament/new')}>
          + Nouveau tournoi
        </button>
      </div>

      {tournaments.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>&#127941;</div>
          <h2 style={styles.emptyTitle}>Aucun tournoi pour le moment</h2>
          <p style={styles.emptyText}>
            Creez votre premier tournoi et commencez a organiser vos competitions !
          </p>
          <button style={styles.newButton} onClick={() => navigate('/tournament/new')}>
            + Creer mon premier tournoi
          </button>
        </div>
      ) : (
        <div style={styles.list}>
          {tournaments.map((t) => (
            <div
              key={t.id}
              style={styles.card}
              onClick={() => handleCardClick(t.id)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = 'none';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
              }}
            >
              <div style={styles.cardTop}>
                <div style={{ flex: 1 }}>
                  <h3 style={styles.cardName}>{t.name}</h3>
                  <p style={styles.cardSport}>{t.sport}</p>
                </div>
                <span
                  style={{
                    ...styles.badge,
                    backgroundColor: statusColors[t.status].bg,
                    color: statusColors[t.status].text,
                  }}
                >
                  {statusLabels[t.status]}
                </span>
              </div>
              <div style={styles.cardBottom}>
                <div style={styles.cardMeta}>
                  <span style={styles.metaItem}>{formatLabels[t.format]}</span>
                  <span style={styles.metaDot}>&#183;</span>
                  <span style={styles.metaItem}>
                    {new Date(t.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span style={styles.metaDot}>&#183;</span>
                  <span style={styles.metaItem}>
                    {t.teams.length} equipe{t.teams.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  style={styles.deleteButton}
                  onClick={(e) => handleDelete(e, t.id, t.name)}
                  title="Supprimer"
                >
                  &#128465;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 40, marginBottom: 8 }}>
        Max Tournoi Management
      </p>
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
  },
  icon: {
    fontSize: 28,
  },
  newButton: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 20px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '60px 20px',
    backgroundColor: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: '#1e293b',
    margin: '0 0 8px',
  },
  emptyText: {
    color: '#64748b',
    margin: '0 0 24px',
    fontSize: 15,
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: '16px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  cardName: {
    fontSize: 17,
    fontWeight: 600,
    color: '#1e293b',
    margin: 0,
  },
  cardSport: {
    fontSize: 14,
    color: '#64748b',
    margin: '4px 0 0',
  },
  badge: {
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 20,
    whiteSpace: 'nowrap' as const,
  },
  cardBottom: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: '#94a3b8',
    flexWrap: 'wrap' as const,
  },
  metaItem: {},
  metaDot: {
    fontWeight: 700,
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 6,
    opacity: 0.6,
  },
};
