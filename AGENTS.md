# Consignes de code — Skamkraft

Skamkraft est une interface SpaceTraders : Angular 22, TypeScript, Tailwind CSS 4,
RxJS et Three.js. Le serveur MCP facultatif est un paquet TypeScript séparé.
Les agents définis dans `.codex/agents/` aident au développement du projet.

## Travailler avec les agents

Le chat principal coordonne la demande, attribue les fichiers, intègre les changements
et donne la réponse finale. Utiliser les spécialistes lorsqu'un travail indépendant
peut avancer en parallèle ; traiter directement les petits changements simples.

| Agent | Mission | Périmètre habituel |
| --- | --- | --- |
| `architecte` | Comprendre les dépendances et préparer un changement transversal, en lecture seule | Routes, composants, services, stores, API |
| `frontend` | Implémenter l'interface Angular et les interactions | Écrans, templates, composants partagés, styles |
| `spacetraders` | Implémenter les contrats de données et la logique métier | API, auth, cache, stores, modèles, automatisation du jeu, MCP |
| `threejs` | Implémenter et optimiser le rendu et les contrôles 3D | Scènes, builders, shaders, vol, surfaces et viewers |
| `qualite` | Vérifier le comportement et les régressions ; écrire les tests confiés | Tests, reproduction et revue du diff |

Avant une délégation, donner l'objectif, les fichiers attribués, les interfaces à
respecter et les critères de validation. Un fichier modifié a un seul responsable
à la fois. Les périmètres habituels servent au routage ; l'attribution explicite
du coordinateur prime. Attendre les changements dont on dépend avant d'intégrer.
Tous les agents partagent le checkout : conserver les modifications de l'utilisateur
et des autres agents. Le coordinateur peut reprendre les responsabilités d'un agent
indisponible sans bloquer la tâche.

## Repères dans le code

- `src/app/features/` : fonctionnalités, écrans et logique propre à chaque domaine.
- `src/app/shared/` : composants, services d'interface et utilitaires communs.
- `src/app/core/state/` : stores Angular avec signals.
- `src/app/core/auth/`, `core/api/`, `core/config/` : session et couche API.
- `src/app/services/` : façade SpaceTraders, tokens, cache et limite de débit.
- `src/app/models/` : types et mappers des données SpaceTraders.
- `src/app/features/systems/three/` : rendu, physique et mondes procéduraux.
- `mcp/spacetraders-server/` : serveur MCP avec ses propres dépendances et build.
- `assets/` et `public/` : ressources statiques référencées dans `angular.json`.

## Règles d'implémentation

- Suivre les conventions du fichier et de ses voisins : standalone, `inject()`,
  `signal()`/`computed()`, `@if`/`@for` avec `track`, et `OnPush` là où il est utilisé.
- Réutiliser les services, stores et modèles existants ; garder la logique métier
  hors des templates et éviter les accès HTTP qui contournent le transport partagé.
- Préserver la chaîne `SpaceTradersApiService` → `ApiRequestService` →
  `SpaceTradersHttpTransportService`, la gestion du débit, les erreurs et le cache.
- Conserver les conventions de stockage des tokens et la distinction compte/agent.
  Ne jamais écrire de vrais secrets dans le dépôt, les fixtures ou les sorties.
- Valider avec des mocks. Les vérifications de code ne doivent pas effectuer
  d'actions sur un compte SpaceTraders réel.
- Préserver le style existant et l'accessibilité des parcours modifiés.
- Pour la 3D, conserver les unités, les graines déterministes et la gestion du
  cycle de vie : RAF, écouteurs, workers et ressources GPU.
- Les métadonnées `src/app/models/api-endpoints.data.ts` sont générées depuis
  `mcp/SpaceTraders.json` par `mcp/generate-endpoints.mjs`.
- Faire des changements ciblés, sans refonte ou mise à jour de dépendances étrangère
  à la demande. Formater seulement les fichiers modifiés avec `.prettierrc`.

## Validation

Prérequis du projet : Node.js 22+ et npm 11+. Si les dépendances manquent, utiliser
`npm ci` à la racine. Le paquet MCP nécessite ses propres dépendances.

| Commande | Usage |
| --- | --- |
| `npm start` | Serveur Angular local sur `http://localhost:4200` |
| `npm run build` | Build de production, vérification TypeScript et templates |
| `npm run test:ci -- chemin/du/fichier.spec.ts` | Tests Vitest ciblés |
| `npm run test:ci` | Suite Vitest, également utilisée par la CI |
| `npx prettier --check <fichiers-modifiés>` | Formatage des fichiers concernés |
| `npm ci --prefix mcp/spacetraders-server` | Installation reproductible du paquet MCP |
| `npm run mcp:build` | Compilation du serveur MCP |
| `npm run generate:api-endpoints` | Régénération des métadonnées API |

Choisir les validations selon le risque et la portée. Pour un bug ou de la nouvelle
logique, préférer un test de régression qui vérifie le comportement. Pour des retouches
visuelles simples, vérifier le rendu sans ajouter de tests artificiels. Les tests
Vitest racine ne couvrent pas le paquet MCP ; un build ne prouve pas le rendu WebGL.
Une modification des seules consignes d'agents ne nécessite pas de build Angular.

Dans le compte rendu, préciser le comportement obtenu, les fichiers importants,
les commandes réellement exécutées et toute vérification impossible. Répondre à
l'utilisateur en français, sauf demande contraire.
