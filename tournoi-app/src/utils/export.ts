import jsPDF from 'jspdf';
import type { Tournament, TeamStanding } from '../types/tournament';

export function getTeamName(tournament: Tournament, teamId: string): string {
  const team = tournament.teams.find((t) => t.id === teamId);
  return team ? team.name : 'Équipe inconnue';
}

function getCourtName(tournament: Tournament, courtId: string): string {
  const court = tournament.courts.find((c) => c.id === courtId);
  return court ? court.name : 'Terrain inconnu';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportTournamentPDF(
  tournament: Tournament,
  standings: Map<string, TeamStanding[]>
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = 14;
  let y = 20;

  const checkPageBreak = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 20;
    }
  };

  // Titre
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(tournament.name, pageWidth / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Sport : ${tournament.sport}`, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // Équipes et joueurs
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Équipes', marginLeft, y);
  y += 8;

  doc.setFontSize(10);
  for (const team of tournament.teams) {
    checkPageBreak(16);
    doc.setFont('helvetica', 'bold');
    doc.text(team.name, marginLeft, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    if (team.players.length > 0) {
      const playerNames = team.players
        .map((p) => p.firstName + (p.className ? ` (${p.className})` : ''))
        .join(', ');
      const lines = doc.splitTextToSize(playerNames, pageWidth - marginLeft - marginRight);
      doc.text(lines, marginLeft + 4, y);
      y += lines.length * 4.5;
    }
    y += 3;
  }

  // Planning des rotations
  y += 5;
  checkPageBreak(20);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Planning des matchs', marginLeft, y);
  y += 8;

  doc.setFontSize(10);
  for (const rotation of tournament.rotations) {
    checkPageBreak(12 + rotation.matches.length * 6);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rotation ${rotation.number}`, marginLeft, y);
    y += 6;
    doc.setFont('helvetica', 'normal');

    for (const match of rotation.matches) {
      checkPageBreak(6);
      const courtName = getCourtName(tournament, match.courtId);
      const teamA = getTeamName(tournament, match.teamAId);
      const teamB = getTeamName(tournament, match.teamBId);
      const score =
        match.status === 'finished' || match.status === 'forfeit'
          ? ` (${match.scoreA ?? 0} - ${match.scoreB ?? 0})`
          : '';
      doc.text(`${courtName} : ${teamA} vs ${teamB}${score}`, marginLeft + 4, y);
      y += 5;
    }
    y += 4;
  }

  // Classements
  y += 5;
  checkPageBreak(20);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Classements', marginLeft, y);
  y += 10;

  const drawStandingsTable = (standingsList: TeamStanding[], title?: string) => {
    if (title) {
      checkPageBreak(20);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(title, marginLeft, y);
      y += 7;
    }

    const headers = ['#', 'Équipe', 'J', 'V', 'N', 'D', 'BP', 'BC', 'Diff', 'Pts'];
    const colWidths = [8, 42, 12, 12, 12, 12, 14, 14, 14, 14];
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const startX = (pageWidth - tableWidth) / 2;

    checkPageBreak(8 + standingsList.length * 6);

    // En-tête
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(60, 60, 60);
    doc.rect(startX, y - 4, tableWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    let x = startX;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x + colWidths[i] / 2, y, { align: 'center' });
      x += colWidths[i];
    }
    doc.setTextColor(0, 0, 0);
    y += 5;

    // Lignes
    doc.setFont('helvetica', 'normal');
    standingsList.forEach((s, index) => {
      checkPageBreak(6);
      if (index % 2 === 0) {
        doc.setFillColor(240, 240, 240);
        doc.rect(startX, y - 3.5, tableWidth, 5, 'F');
      }
      const row = [
        String(index + 1),
        getTeamName(tournament, s.teamId),
        String(s.played),
        String(s.wins),
        String(s.draws),
        String(s.losses),
        String(s.goalsFor),
        String(s.goalsAgainst),
        String(s.goalDifference),
        String(s.points),
      ];
      x = startX;
      for (let i = 0; i < row.length; i++) {
        const align = i === 1 ? 'left' : 'center';
        const textX = i === 1 ? x + 1 : x + colWidths[i] / 2;
        doc.text(row[i], textX, y, { align });
        x += colWidths[i];
      }
      y += 5;
    });
    y += 5;
  };

  if (tournament.pools.length > 0) {
    for (const pool of tournament.pools) {
      const poolStandings = standings.get(pool.id);
      if (poolStandings && poolStandings.length > 0) {
        drawStandingsTable(poolStandings, pool.name);
      }
    }
  } else {
    const generalStandings = standings.get('general') || standings.values().next().value;
    if (generalStandings && generalStandings.length > 0) {
      drawStandingsTable(generalStandings, 'Classement général');
    }
  }

  const safeName = tournament.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${safeName}_resultats.pdf`);
}

export function exportResultsCSV(tournament: Tournament, standings: TeamStanding[]): void {
  const headers = ['Rang', 'Équipe', 'J', 'V', 'N', 'D', 'BP', 'BC', 'Diff', 'Pts'];
  const BOM = '\uFEFF';

  const rows = standings.map((s, index) => {
    return [
      index + 1,
      `"${getTeamName(tournament, s.teamId).replace(/"/g, '""')}"`,
      s.played,
      s.wins,
      s.draws,
      s.losses,
      s.goalsFor,
      s.goalsAgainst,
      s.goalDifference,
      s.points,
    ].join(',');
  });

  const csv = BOM + headers.join(',') + '\n' + rows.join('\n') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const safeName = tournament.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadBlob(blob, `${safeName}_classement.csv`);
}
