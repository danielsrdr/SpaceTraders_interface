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
import { ApiExplorerStore, ApiRequestRecord } from './api-explorer.store';
import { ApiHistoryPanelComponent } from './api-history-panel.component';
import {
  buildAngularCall,
  buildCurl,
  buildFetch,
  copyText,
} from './api-snippet.util';
import { JsonTreeComponent } from './json-tree.component';

@Component({
  selector: 'app-api-explorer',
  imports: [FormsModule, ApiHistoryPanelComponent, JsonTreeComponent],
  templateUrl: './api-explorer.component.html',
})
export class ApiExplorerComponent implements OnInit {
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);
  private readonly api = inject(SpaceTradersApiService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly agentStore = inject(AgentStore);
  readonly explorerStore = inject(ApiExplorerStore);

  readonly tags = API_ENDPOINT_TAGS;
  readonly allEndpoints = API_ENDPOINTS;
  readonly selectedTag = signal<string>('all');
  readonly search = signal('');
  readonly selectedEndpoint = signal<ApiEndpointMeta | null>(null);
  readonly loadingId = signal<string | null>(null);
  readonly lastResult = signal<unknown>(null);
  readonly lastStatus = signal<number | null>(null);
  readonly lastDurationMs = signal<number | null>(null);
  readonly responseCollapsed = signal(false);
  readonly snippetTab = signal<'curl' | 'fetch' | 'angular'>('curl');

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

  readonly activeRecord = computed(() => this.explorerStore.selectedRecord());

  readonly snippetText = computed(() => {
    const record = this.activeRecord();
    if (!record) return '';
    const token = this.tokenStorage.getToken();
    switch (this.snippetTab()) {
      case 'curl':
        return buildCurl(record, token);
      case 'fetch':
        return buildFetch(record, token);
      case 'angular':
        return buildAngularCall(record);
      default:
        return '';
    }
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
    this.clearResponse();
  }

  selectEndpoint(endpoint: ApiEndpointMeta): void {
    this.selectedEndpoint.set(endpoint);
    this.clearResponse();

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

  replayRecord(record: ApiRequestRecord): void {
    const endpoint = API_ENDPOINTS.find((e) => this.endpointKey(e) === record.endpointKey);
    if (!endpoint) {
      this.snackbar.show('Endpoint no longer in catalog', 'warning');
      return;
    }
    this.selectedEndpoint.set(endpoint);
    this.pathParamValues.set({ ...record.pathParams });
    this.queryParamValues.set({ ...record.query });
    this.bodyText.set(record.body != null ? JSON.stringify(record.body, null, 2) : '{}');
    this.lastResult.set(record.response);
    this.lastStatus.set(record.status);
    this.lastDurationMs.set(record.durationMs);
    this.explorerStore.select(record.id);
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

      const result = await this.api.callEndpoint(endpoint, {
        pathParams: this.pathParamValues(),
        query: this.queryParamValues(),
        body,
      });

      this.lastResult.set(result.data);
      this.lastStatus.set(result.status);
      this.lastDurationMs.set(result.durationMs);

      this.explorerStore.add({
        timestamp: Date.now(),
        endpointKey: key,
        method: endpoint.method,
        path: endpoint.path,
        operationId: endpoint.operationId,
        pathParams: { ...this.pathParamValues() },
        query: { ...this.queryParamValues() },
        body,
        status: result.status,
        durationMs: result.durationMs,
        response: result.data,
        error: result.status >= 400 ? String((result.data as { error?: string })?.error ?? 'Error') : undefined,
      });

      if (result.status >= 400) {
        this.snackbar.show('Request failed — see response', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      this.lastResult.set({ error: message });
      this.lastStatus.set(0);
      this.snackbar.show(message, 'error');
    } finally {
      this.loadingId.set(null);
    }
  }

  async copyResponse(): Promise<void> {
    const text = JSON.stringify(this.lastResult(), null, 2);
    if (await copyText(text)) {
      this.snackbar.show('Response copied', 'success');
    }
  }

  async copySnippet(): Promise<void> {
    if (await copyText(this.snippetText())) {
      this.snackbar.show('Snippet copied', 'success');
    }
  }

  clearHistory(): void {
    this.explorerStore.clearHistory();
    this.clearResponse();
  }

  private clearResponse(): void {
    this.lastResult.set(null);
    this.lastStatus.set(null);
    this.lastDurationMs.set(null);
  }
}
