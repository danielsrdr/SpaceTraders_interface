import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgentStore } from '../../core/state/agent.store';
import { getAgentSystem } from '../../models/agent.model';
import {
  API_ENDPOINTS,
  API_ENDPOINT_TAGS,
  ApiEndpointMeta,
} from '../../models/api-endpoints.data';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { TokenStorageService } from '../../services/token-storage.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';

@Component({
  selector: 'app-api-explorer',
  imports: [FormsModule],
  templateUrl: './api-explorer.component.html',
})
export class ApiExplorerComponent implements OnInit {
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);
  private readonly api = inject(SpaceTradersApiService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly agentStore = inject(AgentStore);

  readonly tags = API_ENDPOINT_TAGS;
  readonly allEndpoints = API_ENDPOINTS;
  readonly selectedTag = signal<string>('all');
  readonly search = signal('');
  readonly selectedEndpoint = signal<ApiEndpointMeta | null>(null);
  readonly loadingId = signal<string | null>(null);
  readonly responseText = signal<string>('');

  readonly pathParamValues = signal<Record<string, string>>({});
  readonly queryParamValues = signal<Record<string, string>>({});
  readonly bodyText = signal<string>('{}');

  private defaultShipSymbol = '';

  readonly filteredEndpoints = computed(() => {
    const tag = this.selectedTag();
    const q = this.search().trim().toLowerCase();
    let list = tag === 'all' ? API_ENDPOINTS : API_ENDPOINTS.filter((e) => e.tag === tag);
    if (q) {
      list = list.filter(
        (e) =>
          e.path.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.operationId.toLowerCase().includes(q),
      );
    }
    return list;
  });

  readonly groupedCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const tag of API_ENDPOINT_TAGS) {
      counts[tag] = API_ENDPOINTS.filter((e) => e.tag === tag).length;
    }
    return counts;
  });

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
    void this.loadDefaults();
  }

  private async loadDefaults(): Promise<void> {
    try {
      const ships = await this.api.getAllShips();
      this.defaultShipSymbol = ships[0]?.symbol ?? '';
    } catch {
      this.defaultShipSymbol = '';
    }
  }

  endpointKey(endpoint: ApiEndpointMeta): string {
    return `${endpoint.method}:${endpoint.path}`;
  }

  methodClass(method: string): string {
    switch (method) {
      case 'GET':
        return 'text-sky-300';
      case 'POST':
        return 'text-emerald-300';
      case 'PATCH':
        return 'text-amber-300';
      case 'PUT':
        return 'text-orange-300';
      case 'DELETE':
        return 'text-rose-300';
      default:
        return 'text-white';
    }
  }

  selectTag(tag: string): void {
    this.selectedTag.set(tag);
    this.selectedEndpoint.set(null);
    this.responseText.set('');
  }

  selectEndpoint(endpoint: ApiEndpointMeta): void {
    this.selectedEndpoint.set(endpoint);
    this.responseText.set('');

    const agent = this.agentStore.agent();
    const pathDefaults: Record<string, string> = {};
    for (const param of endpoint.pathParams) {
      if (param === 'shipSymbol') pathDefaults[param] = this.defaultShipSymbol;
      else if (param === 'contractId') pathDefaults[param] = '';
      else if (param === 'systemSymbol' && agent) pathDefaults[param] = getAgentSystem(agent);
      else if (param === 'factionSymbol' && agent) pathDefaults[param] = agent.faction;
      else if (param === 'symbol' && agent) pathDefaults[param] = agent.name;
      else pathDefaults[param] = '';
    }
    this.pathParamValues.set(pathDefaults);

    const queryDefaults: Record<string, string> = {};
    for (const param of endpoint.queryParams) {
      queryDefaults[param] = param === 'page' ? '1' : param === 'limit' ? '20' : '';
    }
    this.queryParamValues.set(queryDefaults);
    this.bodyText.set('{}');
  }

  updatePathParam(name: string, value: string): void {
    this.pathParamValues.update((current) => ({ ...current, [name]: value }));
  }

  updateQueryParam(name: string, value: string): void {
    this.queryParamValues.update((current) => ({ ...current, [name]: value }));
  }

  async tryEndpoint(endpoint: ApiEndpointMeta): Promise<void> {
    const key = this.endpointKey(endpoint);
    this.loadingId.set(key);

    if (endpoint.requiresAuth && !this.tokenStorage.getToken()) {
      this.snackbar.show('Login required for this endpoint', 'error');
      this.loadingId.set(null);
      return;
    }

    try {
      const needsBody = ['POST', 'PATCH', 'PUT'].includes(endpoint.method);
      let body: unknown = undefined;
      if (needsBody) {
        const raw = this.bodyText().trim();
        body = raw ? JSON.parse(raw) : {};
      }

      const data = await this.api.callEndpoint(endpoint, {
        pathParams: this.pathParamValues(),
        query: this.queryParamValues(),
        body,
      });

      this.responseText.set(JSON.stringify({ data }, null, 2));
    } catch (error) {
      const err = error as Error & { status?: number };
      this.responseText.set(
        JSON.stringify({ status: err.status, error: err.message ?? 'Request failed' }, null, 2),
      );
      this.snackbar.show(err.message ?? 'Request failed', 'error');
    } finally {
      this.loadingId.set(null);
    }
  }
}
