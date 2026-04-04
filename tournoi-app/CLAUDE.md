# MTM — Max Tournoi Management

## Projet

PWA de gestion de tournois sportifs scolaires (collège/lycée/UNSS). Fonctionne hors-ligne, sans serveur. Déployé sur GitHub Pages.

- **Repo** : https://github.com/BaillValentin/MTM
- **URL prod** : https://baillvalentin.github.io/MTM/
- **Utilisateur** : prof d'EPS, utilise l'app sur smartphone pendant les cours

## Stack technique

- **React 19 + TypeScript + Vite 8** (dans le sous-dossier `tournoi-app/`)
- **Zustand** : state management avec persistence localStorage (clé `tournament-storage` pour les tournois, `saved-teams-storage` pour les équipes sauvegardées)
- **react-router-dom** avec **HashRouter** (obligatoire pour GitHub Pages)
- **jsPDF** : export PDF côté client
- **vite-plugin-pwa** : Service Worker, manifest, mode hors-ligne (`registerType: autoUpdate`, `skipWaiting`, `clientsClaim`)
- **Pas de CSS séparé** : tout en style inline React
- **Charte graphique** : fond `#f5f5f5`, cartes blanches `border-radius: 12px`, bleu `#2563eb`, rouge `#dc2626`, texte `#1e293b`

## Structure des fichiers

```
tournoi-app/
├── .github/workflows/deploy.yml  (à la racine du repo git, pas dans tournoi-app)
├── vite.config.ts          # base: '/MTM/', PWA config
├── index.html              # lang="fr", meta PWA, meta viewport
├── src/
│   ├── main.tsx            # Point d'entrée, pas d'import CSS
│   ├── App.tsx             # HashRouter + toutes les routes
│   ├── types/
│   │   └── tournament.ts   # Tous les types : Tournament, Team, Player, Match, Rotation, Pool, KnockoutRound, TeamStanding, ScoringConfig, etc.
│   ├── store/
│   │   └── tournamentStore.ts  # useTournamentStore (Zustand + persist) + useSavedTeamsStore
│   ├── pages/
│   │   ├── Home.tsx            # Liste des tournois, bouton créer
│   │   ├── TournamentSetup.tsx # Config tournoi (nom, sport, format, terrains, barème, départage)
│   │   ├── TeamSetup.tsx       # Gestion équipes (manuel + tirage au sort + équipes sauvegardées)
│   │   ├── Schedule.tsx        # Page principale pendant le tournoi : timer, saisie scores, bracket, rotations, export
│   │   ├── Rankings.tsx        # Classements par poule ou général
│   │   └── BigScreen.tsx       # Vue vidéoprojecteur fond sombre
│   ├── components/
│   │   └── BracketView.tsx     # Arbre éliminatoire récursif (basé sur les team IDs, pas l'index)
│   └── utils/
│       ├── scheduler.ts        # Génération matchs (poules, championship, knockout avec byes) + répartition rotations
│       ├── rankings.ts         # Calcul classements (paramétrable : points V/N/D, critères départage)
│       ├── teamGenerator.ts    # Tirage au sort (Fisher-Yates)
│       └── export.ts           # Export PDF (jsPDF) et CSV
```

## Fonctionnalités implémentées

### Formats de tournoi
- **Phases de poules** (`pools`) : round-robin par poule
- **Élimination directe** (`knockout`) : bracket avec byes si nombre impair
- **Poules + Élimination** (`pools_knockout`) : poules puis phase éliminatoire avec qualifiés
- **Championnat** (`championship`) : tous contre tous

### Système de knockout
- **Byes** : si le nombre d'équipes n'est pas une puissance de 2, les dernières équipes sont exemptées du 1er tour (padding au prochain power-of-2)
- **Consolantes récursives** : `Match.consolationLevel` (0 = principal, 1 = consolante, 2 = consolante de consolante, etc.). Les perdants de chaque niveau jouent entre eux au niveau suivant.
- **Un seul bouton "Tour suivant"** qui avance tous les brackets d'un coup (vainqueurs → tour suivant, perdants → consolante)
- **Cascade sur modification** : modifier un score knockout supprime tous les tours suivants + toutes les consolantes générées depuis
- **Bracket visuel** : arbre récursif qui suit les team IDs (pas l'indexation positionnelle). Chaque niveau de consolante a sa couleur.
- **`KnockoutRound.consolationLevel`** et **`KnockoutRound.byeTeamIds`** : stockés dans le store pour le matching fiable

### Autres
- **Timer global** : compte à rebours basé sur la durée des matchs, alerte à la fin
- **Saisie scores** : directe (pas de bouton "démarrer"), 0-0 par défaut, bouton "Valider" et "Modifier" après validation
- **Équipes sauvegardées** : persistées dans un store séparé (`useSavedTeamsStore`), réutilisables entre tournois
- **Vue grand écran** : fond sombre `#0f172a`, polices grandes, bracket inclus, classements, rafraîchissement reactif
- **Export** : PDF (planning + résultats + classements) et CSV
- **Barème paramétrable** : points V/N/D (défaut 3/1/0), critères de départage configurables

## Routes (HashRouter)

```
#/                              → Home (liste des tournois)
#/tournament/new                → TournamentSetup (création)
#/tournament/:id                → Redirect selon statut
#/tournament/:id/setup          → TournamentSetup (édition)
#/tournament/:id/teams          → TeamSetup
#/tournament/:id/play           → Schedule
#/tournament/:id/classements    → Rankings
#/tournament/:id/bigscreen      → BigScreen
```

## Déploiement

- **GitHub Pages** avec **GitHub Actions** (source : GitHub Actions, pas "deploy from branch")
- Le repo git est `TOURNOI/`, le projet est dans `TOURNOI/tournoi-app/`
- Le workflow `.github/workflows/deploy.yml` est à la racine du repo git
- `vite.config.ts` : `base: '/MTM/'`
- `npm ci --legacy-peer-deps` nécessaire (conflit vite-plugin-pwa / vite 8)

## Modèle de données clés

```typescript
Match {
  consolationLevel?: number;  // 0 = principal, 1+ = consolante
  knockoutRound?: number;     // numéro du tour
  poolId?: string;            // si match de poule
}

KnockoutRound {
  round: number;
  matches: Match[];
  byeTeamIds?: string[];      // équipes exemptées
  consolationLevel?: number;  // niveau de consolante
}

Tournament.status: 'setup' | 'teams' | 'ready' | 'in_progress' | 'finished'
```

## Points d'attention

- `HashRouter` obligatoire (GitHub Pages ne gère pas le routing SPA)
- `window.open` pour le grand écran utilise le hash : `${window.location.pathname}#/tournament/${id}/bigscreen`
- Les matchs knockout sont reliés par **team ID** dans le bracket (pas par index positionnel)
- Zustand persist fait des copies des objets → ne pas se fier aux références, toujours utiliser `kr.consolationLevel` (pas `kr.matches[0].consolationLevel`)
- `generateKnockoutMatches` pad au prochain power-of-2 avec des byes
- Le store `useSavedTeamsStore` est séparé de `useTournamentStore` (clé localStorage différente)
