# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Les consignes communes aux agents de code (conventions, règles d'implémentation, table des commandes, validation, réponses en français) sont dans AGENTS.md et s'appliquent ici :

@AGENTS.md

Ce fichier complète AGENTS.md sans le répéter. Les spécialistes qu'AGENTS.md cite (`architecte`, `frontend`…) sont des agents Codex définis dans `.codex/agents/` ; sous Claude Code, ne déléguer qu'aux sous-agents réellement disponibles.

## Commandes et vérifications

- Un seul test par nom : `npm run test:ci -- src/app/services/cache.service.spec.ts -t "fragment du nom"`.
- La CI (`.github/workflows/test.yml`) exécute seulement `npm ci` puis `npx vitest run` : ni build, ni Prettier.
- Les specs ne compilent aucun composant à part `App` (`app.spec.ts`) : seul `npm run build` (compilation AOT) détecte les erreurs de template et de liaison.
- `npm run build` utilise la configuration production : service worker (`ngsw-config.json`) et budgets bloquants (bundle initial 1,5 Mo, bundle `main` 1,25 Mo, 8 kB de styles par composant).

## Architecture

### Démarrage et routage

- `app.config.ts` : un `APP_INITIALIZER` appelle `AuthService.relog()` (token stocké → `GET /my/agent`) et renvoie vers `/register` en cas d'échec. `/spectate` (liens publics en lecture seule) saute cette étape et vit hors d'`AppShellComponent`.
- `provideSpaceTradersConfig()` est défini dans `services/cache.service.ts` ; il fournit `SPACETRADERS_CONFIG` (`core/config/spacetraders.config.ts`) : hôte, 2 requêtes/s, retries avec backoff sur 429/5xx, TTL par catégorie de cache.
- Seules des routes chargées par `loadComponent` importent `three` (systems, ships, codex, dashboard via les miniatures du codex). Une nouvelle page 3D doit l'être aussi, sinon Three.js entre dans le bundle initial.
- `AppShellComponent` instancie les services globaux (radio, raccourcis clavier, pont de notifications, thème de faction) et enregistre un instantané de session à chaque navigation (`SessionStore`).

### Couche API

- `SpaceTradersApiService` (`services/`) est la façade : une méthode par endpoint, mapping via `models/*` et invalidation des catégories de cache concernées avant chaque mutation (`this.api.invalidate('contracts')`).
- `ApiRequestService` (`core/api/`) met en cache les GET qui passent `cache: { category }`. La clé vaut `catégorie:endpoint:body` et `invalidate()` supprime par sous-chaîne.
- `SpaceTradersHttpTransportService` ajoute le bearer, passe par la file de `RateLimiterService`, réessaie, normalise les erreurs en `SpaceTradersApiError` puis appelle `ApiErrorHandlerService` : un 401 déclenche une déconnexion différée.
- Options de requête (`ApiRequestOptions`) : `requiresAuth: false` pour les endpoints publics, `bearerToken` pour imposer un token, `suppressGlobalHandler` pour éviter la déconnexion automatique, `suppressUi` pour le polling silencieux.
- `ApiErrorHandlerService` obtient `AuthService` à la demande via `Injector` pour casser le cycle AuthService → API → transport → gestionnaire d'erreurs ; un `inject(AuthService)` direct le rétablirait.
- `CacheService` double sa `Map` d'une persistance IndexedDB (`PersistentCacheService`, base `skamkraft-cache`) ; hors ligne, il sert les entrées expirées.
- L'API Explorer (`features/api-explorer/`) appelle n'importe quel endpoint via `SpaceTradersApiService.callEndpoint()` et les métadonnées générées `API_ENDPOINTS`.

### Compte, agent et tokens

- Le token de compte ne sert qu'à `POST /register`, passé via `bearerToken`, et n'est jamais stocké.
- Le token d'agent est géré par `TokenStorageService` : `sessionStorage` par défaut, `localStorage` avec « Remember me », sous `st_token`/`st_remember` (valeur inversée puis encodée en base64). La clé héritée `token` est migrée au démarrage.
- Les types `*Data` reprennent les réponses brutes de l'API ; l'interface consomme des types mappés (`Agent`, `ContractView`, `PlanetView`). `mapAgent` renomme les champs : `Agent.name` est le symbole de l'agent, `hq` son siège.

### État par agent

- Les données d'un agent sont persistées dans `localStorage` sous `<préfixe><Agent.name>` : préfixes `sk_…_` en général, `st_logbook_` et `st_flightrec_` pour les plus anciens. Changer une clé exige une migration.
- Un store se rattache à l'agent par `attach(agentName)`/`detach()`, appelés par `AuthService` (logbook, flight recorder) ou par un service ou composant qui observe `AgentStore.agent()` (notifications, onboarding), ou bien lit `AgentStore` dans son propre `effect()` (`SessionStore`).
- `AuthService.logout()` efface le token, vide les caches et la file de requêtes, puis détache les stores : un nouveau store par agent doit s'insérer dans ce schéma.

### Actions de jeu

- `features/systems/travel-plan.ts` calcule des étapes de voyage ; `TravelExecutorService` les exécute pour la carte du système comme pour l'autopilote. Une étape `surface` suspend l'exécution et rend la main à l'interface.
- `ShipActionsService` porte les actions ponctuelles de la carte (marché, chantier naval, scan, cargo, modules).
- `OrderRunnerService` (`features/automation/`) exécute en boucle les files d'ordres par vaisseau d'`OrderQueueStore`, persistées par agent, avec arrêt coopératif entre deux étapes.
- Toutes ces actions modifient le compte réel : les tests doivent tout simuler.

### Rendu 3D (`features/systems/`)

- `SystemMapComponent` (route `/systems`) orchestre `SystemMapStore` (système, planètes, vaisseaux) et `SystemViewModeStore`, une machine à états `flight → landing → surface → launch → flight` pilotée par `dispatch()`.
- `SystemFlightViewComponent` rend le vol orbital et le cockpit ; `PlanetSurfaceViewComponent` rend l'exploration de surface à la première personne (terrain par chunks, zones mine, grotte, marché, chantier…).
- `three/` sépare les builders (construction de meshes), les managers (état et mise à jour par frame), les moteurs (`system-orbit.engine.ts`, `ship-dynamics.engine.ts`) et les fonctions pures testées.
- `three/physics-units.ts` est la source unique des unités : simulation en km, 1 unité d'API = 10 000 km, 1 unité Three.js = 1 200 km. Convertir via `render-transform.ts`, jamais avec un facteur en dur.
- Le contenu généré dérive de graines stables calculées depuis les symboles (`three/planet-seed.ts`, `shared/seeded-random.ts`). Dans le rendu, `Math.random()` est réservé aux effets éphémères : secousses de caméra, particules, bruit radar.
- La scène se crée dans `ngAfterViewInit`, sous `NgZone.runOutsideAngular` ; revenir dans la zone avec `zone.run()` pour émettre un événement. `ngOnDestroy` annule le RAF, retire les écouteurs, déconnecte le `ResizeObserver` et dispose builders, managers, composer et renderer.
- `three/three-dispose.util.ts` libère aussi les textures des uniforms de `ShaderMaterial`. Le terrain est calculé dans un worker module (`three/terrain/terrain.worker.ts`), avec repli synchrone.

### Tests

- Vitest tourne sans le builder Angular : `vitest.config.ts` (jsdom, globals, `src/**/*.spec.ts`) et `src/test-setup.ts` (compilation JIT via `@angular/compiler`, initialisation de TestBed). Les specs, colocalisées, couvrent services, stores, guards et fonctions pures, dont la math 3D sans WebGL.
- Modèle pour la couche API : `services/spacetraders-api.service.spec.ts`, avec `provideHttpClientTesting`, une configuration de débit élevé et de retries courts, et un `CacheService` simulé.
- Les specs des stores persistants vident `localStorage` et `sessionStorage` dans `beforeEach`.

### Styles et TypeScript

- Tailwind 4 se configure en CSS dans `src/styles.css` : jetons `@theme` (couleurs `accent`, `phosphor`, `warn`, `danger`, police Pixellari) et classes partagées comme `.sk-btn`. Il n'y a pas de `tailwind.config.js` ; PostCSS passe par `.postcssrc.json`.
- `noPropertyAccessFromIndexSignature` est activé : lire une signature d'index avec des crochets (`headers['Authorization']`, `cacheTTL['default']`).

### Serveur MCP

- `mcp/spacetraders-server` (TypeScript 5.8 strict, modules Node16) construit son catalogue d'endpoints depuis la spec OpenAPI. Son outil `call_spacetraders_api` appelle l'API réelle avec `SPACETRADERS_TOKEN` : ne jamais s'en servir pour valider un changement.
- `.vscode/mcp.json` déclare ce serveur et celui de l'Angular CLI.
