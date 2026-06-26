import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SPACETRADERS_CONFIG } from '../core/config/spacetraders.config';
import { CacheService } from './cache.service';
import { RateLimiterService } from './rate-limiter.service';
import { TokenStorageService } from './token-storage.service';
import {
  ApiResponse,
  GameStatus,
  ShipModule,
  ShipMount,
  ShipQuote,
  SupplyChainData,
} from '../models/api.model';
import { ApiEndpointMeta } from '../models/api-endpoints.data';
import { AgentData, mapAgent } from '../models/agent.model';
import { ContractData, mapContract } from '../models/contract.model';
import { FactionData } from '../models/faction.model';
import {
  ExtractionResult,
  MarketTransaction,
  ShipCargo,
  ShipCooldown,
  ShipData,
  ShipNav,
  ShipNavFlightMode,
  SiphonResult,
} from '../models/ship.model';
import { SystemData, WaypointData, MarketData, ShipyardData, JumpGateData, ConstructionData, ScannedWaypoint } from '../models/system.model';

export interface CallEndpointOptions {
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface CallEndpointResult {
  data: unknown;
  status: number;
  durationMs: number;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  requiresAuth?: boolean;
  bearerToken?: string;
}

interface CacheConfig {
  category: string;
}

export interface ShipNavActionResult {
  nav: ShipNav;
  fuel: ShipData['fuel'];
}

@Injectable({ providedIn: 'root' })
export class SpaceTradersApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(SPACETRADERS_CONFIG);
  private readonly cache = inject(CacheService);
  private readonly rateLimiter = inject(RateLimiterService);
  private readonly tokenStorage = inject(TokenStorageService);

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {},
    cacheConfig: CacheConfig | null = null,
  ): Promise<T> {
    const { method = 'GET', body = null, requiresAuth = true, bearerToken } = options;

    if (method === 'GET' && cacheConfig) {
      const cacheKey = this.cache.generateKey(cacheConfig.category, endpoint, JSON.stringify(body ?? ''));
      const cached = this.cache.get<T>(cacheKey);
      if (cached) return cached;
    }

    const token = bearerToken ?? (requiresAuth ? this.tokenStorage.getToken() : null);
    if (requiresAuth && !token) {
      throw new Error('Authentication required. Please login first.');
    }

    const result = await this.rateLimiter.enqueue(async () => {
      return this.withRetry(async () => {
        const headers: Record<string, string> = {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const needsBody = ['POST', 'PATCH', 'PUT'].includes(method);
        const url = `${this.config.host}${endpoint}`;

        try {
          const response = await firstValueFrom(
            this.http.request<T>(method, url, {
              headers,
              body: body ? body : needsBody ? {} : undefined,
              observe: 'body',
            }),
          );
          return response as T;
        } catch (error) {
          if (error instanceof HttpErrorResponse) {
            const message = error.error?.error?.message ?? `HTTP ${error.status}`;
            const err = new Error(message) as Error & { status?: number };
            err.status = error.status;
            throw err;
          }
          throw error;
        }
      });
    });

    if (method === 'GET' && cacheConfig) {
      const cacheKey = this.cache.generateKey(cacheConfig.category, endpoint, JSON.stringify(body ?? ''));
      this.cache.set(cacheKey, result, cacheConfig.category);
    }

    return result;
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    const { maxRetries, baseDelay, maxDelay, retryableStatuses } = this.config.retry;
    let lastError: Error & { status?: number } | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error & { status?: number };
        const status = lastError.status;
        const isRetryable = status && retryableStatuses.includes(status);
        if (!isRetryable || attempt === maxRetries) throw lastError;
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError;
  }

  async getAgent() {
    const response = await this.request<ApiResponse<AgentData>>('/my/agent', {}, { category: 'agent' });
    const token = this.tokenStorage.getToken() ?? '';
    return mapAgent(response.data, token);
  }

  async register(symbol: string, faction: string, accountToken: string) {
    const response = await this.request<ApiResponse<{ agent: AgentData; token: string }>>(
      '/register',
      { method: 'POST', body: { symbol, faction }, requiresAuth: false, bearerToken: accountToken },
    );
    return mapAgent(response.data.agent, response.data.token);
  }

  async getFactions(page = 1, limit = 20) {
    const response = await this.request<ApiResponse<FactionData[]>>(
      `/factions?page=${page}&limit=${limit}`,
      { requiresAuth: false },
      { category: 'factions' },
    );
    return response.data;
  }

  async getAllFactions(): Promise<FactionData[]> {
    const all: FactionData[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await this.request<ApiResponse<FactionData[]>>(
        `/factions?page=${page}&limit=20`,
        { requiresAuth: false },
      );
      all.push(...response.data);
      const totalPages = Math.ceil((response.meta?.total ?? 0) / 20);
      hasMore = page < totalPages;
      page++;
    }
    return all;
  }

  async getAgents(page = 1, limit = 20) {
    return this.request<ApiResponse<AgentData[]>>(
      `/agents?page=${page}&limit=${limit}`,
      { requiresAuth: false },
    );
  }

  async getAllAgents(): Promise<AgentData[]> {
    const all: AgentData[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await this.getAgents(page, 20);
      all.push(...response.data);
      const totalPages = Math.ceil((response.meta?.total ?? 0) / 20);
      hasMore = page < totalPages;
      page++;
      if (hasMore) await new Promise((r) => setTimeout(r, this.config.timing));
    }
    return all;
  }

  async getContracts(page = 1, limit = 10) {
    const response = await this.request<ApiResponse<ContractData[]>>(
      `/my/contracts?page=${page}&limit=${limit}`,
      {},
      { category: 'contracts' },
    );
    return response.data.map(mapContract);
  }

  async acceptContract(contractId: string) {
    this.cache.invalidate('contracts');
    this.cache.invalidate('agent');
    return this.request(`/my/contracts/${contractId}/accept`, { method: 'POST' });
  }

  async negotiateContract(shipSymbol: string) {
    this.cache.invalidate('contracts');
    const response = await this.request<ApiResponse<ContractData>>(
      `/my/ships/${shipSymbol}/negotiate/contract`,
      { method: 'POST' },
    );
    return mapContract(response.data);
  }

  async getAllShips(): Promise<ShipData[]> {
    const all: ShipData[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await this.request<ApiResponse<ShipData[]>>(
        `/my/ships?page=${page}&limit=20`,
      );
      all.push(...response.data);
      const totalPages = Math.ceil((response.meta?.total ?? 0) / 20);
      hasMore = page < totalPages;
      page++;
    }
    return all;
  }

  async getShip(shipSymbol: string) {
    const response = await this.request<ApiResponse<ShipData>>(`/my/ships/${shipSymbol}`);
    return response.data;
  }

  async getShipCargo(shipSymbol: string) {
    const response = await this.request<ApiResponse<ShipCargo>>(`/my/ships/${shipSymbol}/cargo`);
    return response.data;
  }

  async getSystem(symbol: string) {
    const response = await this.request<ApiResponse<SystemData>>(
      `/systems/${symbol}`,
      {},
      { category: 'systems' },
    );
    return response.data;
  }

  async getSystems(page = 1, limit = 1) {
    return this.request<ApiResponse<SystemData[]>>(`/systems?page=${page}&limit=${limit}`);
  }

  async getWaypoints(
    systemSymbol: string,
    page = 1,
    limit = 20,
    type?: string,
    traits?: string,
  ) {
    let query = `/systems/${systemSymbol}/waypoints?page=${page}&limit=${limit}`;
    if (type) query += `&type=${encodeURIComponent(type)}`;
    if (traits) query += `&traits=${encodeURIComponent(traits)}`;
    return this.request<ApiResponse<WaypointData[]>>(query, {}, { category: 'waypoints' });
  }

  async getAllWaypoints(systemSymbol: string, type?: string, traits?: string): Promise<WaypointData[]> {
    const all: WaypointData[] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const response = await this.getWaypoints(systemSymbol, page, 20, type, traits);
      all.push(...response.data);
      const totalPages = Math.ceil((response.meta?.total ?? 0) / 20);
      hasMore = page < totalPages;
      page++;
      if (hasMore) await new Promise((r) => setTimeout(r, this.config.timing));
    }
    return all;
  }

  async getWaypoint(systemSymbol: string, waypointSymbol: string) {
    const response = await this.request<ApiResponse<WaypointData>>(
      `/systems/${systemSymbol}/waypoints/${waypointSymbol}`,
      {},
      { category: 'waypoints' },
    );
    return response.data;
  }

  async getMarket(systemSymbol: string, waypointSymbol: string) {
    const response = await this.request<ApiResponse<MarketData>>(
      `/systems/${systemSymbol}/waypoints/${waypointSymbol}/market`,
      {},
      { category: 'markets' },
    );
    return response.data;
  }

  async getShipyard(systemSymbol: string, waypointSymbol: string) {
    const response = await this.request<ApiResponse<ShipyardData>>(
      `/systems/${systemSymbol}/waypoints/${waypointSymbol}/shipyard`,
      {},
      { category: 'shipyards' },
    );
    return response.data;
  }

  async getJumpGate(systemSymbol: string, waypointSymbol: string) {
    const response = await this.request<ApiResponse<JumpGateData>>(
      `/systems/${systemSymbol}/waypoints/${waypointSymbol}/jump-gate`,
      {},
      { category: 'waypoints' },
    );
    return response.data;
  }

  async getConstruction(systemSymbol: string, waypointSymbol: string) {
    const response = await this.request<ApiResponse<ConstructionData>>(
      `/systems/${systemSymbol}/waypoints/${waypointSymbol}/construction`,
      {},
      { category: 'waypoints' },
    );
    return response.data;
  }

  async supplyConstruction(
    systemSymbol: string,
    waypointSymbol: string,
    shipSymbol: string,
    tradeSymbol: string,
    units: number,
  ) {
    this.cache.invalidate('waypoints');
    return this.request<ApiResponse<{ construction: ConstructionData; cargo: unknown }>>(
      `/systems/${systemSymbol}/waypoints/${waypointSymbol}/construction/supply`,
      { method: 'POST', body: { shipSymbol, tradeSymbol, units } },
    );
  }

  async navigateShip(shipSymbol: string, waypointSymbol: string) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<ShipNavActionResult>>(
      `/my/ships/${shipSymbol}/navigate`,
      { method: 'POST', body: { waypointSymbol } },
    );
  }

  async orbitShip(shipSymbol: string, waypointSymbol?: string) {
    this.cache.invalidate('ships');
    const body = waypointSymbol ? { orbit: { waypointSymbol } } : {};
    return this.request<ApiResponse<{ nav: ShipData['nav'] }>>(
      `/my/ships/${shipSymbol}/orbit`,
      { method: 'POST', body },
    );
  }

  async dockShip(shipSymbol: string) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<{ nav: ShipData['nav'] }>>(
      `/my/ships/${shipSymbol}/dock`,
      { method: 'POST' },
    );
  }

  async warpShip(shipSymbol: string, waypointSymbol: string) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<ShipNavActionResult>>(
      `/my/ships/${shipSymbol}/warp`,
      { method: 'POST', body: { waypointSymbol } },
    );
  }

  async jumpShip(shipSymbol: string, waypointSymbol: string) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<ShipNavActionResult>>(
      `/my/ships/${shipSymbol}/jump`,
      { method: 'POST', body: { waypointSymbol } },
    );
  }

  async refuelShip(shipSymbol: string, units: number, fromShipSymbol?: string) {
    this.cache.invalidate('ships');
    this.cache.invalidate('agent');
    const body: { units: number; fromShipSymbol?: string } = { units };
    if (fromShipSymbol) body.fromShipSymbol = fromShipSymbol;
    return this.request<ApiResponse<{ agent: AgentData; fuel: ShipData['fuel']; transaction?: MarketTransaction }>>(
      `/my/ships/${shipSymbol}/refuel`,
      { method: 'POST', body },
    );
  }

  async extractResources(shipSymbol: string) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<ExtractionResult>>(
      `/my/ships/${shipSymbol}/extract`,
      { method: 'POST' },
    );
  }

  async siphonResources(shipSymbol: string) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<SiphonResult>>(
      `/my/ships/${shipSymbol}/siphon`,
      { method: 'POST' },
    );
  }

  async surveyWaypoint(shipSymbol: string) {
    this.cache.invalidate('waypoints');
    return this.request<ApiResponse<{ surveys: unknown[]; cooldown: unknown }>>(
      `/my/ships/${shipSymbol}/survey`,
      { method: 'POST' },
    );
  }

  async purchaseCargo(shipSymbol: string, symbol: string, units: number) {
    this.cache.invalidate('ships');
    this.cache.invalidate('agent');
    this.cache.invalidate('markets');
    return this.request<ApiResponse<{ agent: AgentData; cargo: ShipCargo; transaction: MarketTransaction }>>(
      `/my/ships/${shipSymbol}/purchase`,
      { method: 'POST', body: { symbol, units } },
    );
  }

  async sellCargo(shipSymbol: string, symbol: string, units: number) {
    this.cache.invalidate('ships');
    this.cache.invalidate('agent');
    this.cache.invalidate('markets');
    return this.request<ApiResponse<{ agent: AgentData; cargo: ShipCargo; transaction: MarketTransaction }>>(
      `/my/ships/${shipSymbol}/sell`,
      { method: 'POST', body: { symbol, units } },
    );
  }

  async purchaseShipAtShipyard(shipSymbol: string, shipType: string, waypointSymbol: string) {
    this.cache.invalidate('ships');
    this.cache.invalidate('agent');
    return this.request<ApiResponse<{ agent: AgentData; ship: ShipData }>>(
      `/my/ships/${shipSymbol}/purchase/ship`,
      { method: 'POST', body: { shipType, waypointSymbol } },
    );
  }

  async patchShip(shipSymbol: string) {
    this.cache.invalidate('ships');
    this.cache.invalidate('agent');
    return this.request<ApiResponse<{ agent: AgentData; ship: ShipData }>>(
      `/my/ships/${shipSymbol}/patch`,
      { method: 'POST' },
    );
  }

  async jettisonCargo(shipSymbol: string, symbol: string, units: number) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<{ cargo: ShipCargo }>>(
      `/my/ships/${shipSymbol}/jettison`,
      { method: 'POST', body: { symbol, units } },
    );
  }

  async chartWaypoint(shipSymbol: string) {
    this.cache.invalidate('waypoints');
    this.cache.invalidate('agent');
    return this.request<ApiResponse<{ chart: unknown; waypoint: WaypointData; agent: AgentData }>>(
      `/my/ships/${shipSymbol}/chart`,
      { method: 'POST' },
    );
  }

  async scanSystems(shipSymbol: string) {
    this.cache.invalidate('systems');
    return this.request<ApiResponse<{ cooldown: unknown; systems: SystemData[] }>>(
      `/my/ships/${shipSymbol}/scan/systems`,
      { method: 'POST' },
    );
  }

  async scanWaypoints(shipSymbol: string) {
    this.cache.invalidate('waypoints');
    return this.request<ApiResponse<{ cooldown: unknown; waypoints: ScannedWaypoint[] }>>(
      `/my/ships/${shipSymbol}/scan/waypoints`,
      { method: 'POST' },
    );
  }

  async scanSurface(shipSymbol: string) {
    this.cache.invalidate('waypoints');
    return this.request<ApiResponse<{ cooldown: unknown; deposits: unknown[] }>>(
      `/my/ships/${shipSymbol}/scan/surface`,
      { method: 'POST' },
    );
  }

  async getStatus(): Promise<GameStatus> {
    return this.request<GameStatus>('/', { requiresAuth: false }, { category: 'status' });
  }

  async getFaction(symbol: string): Promise<FactionData> {
    const response = await this.request<ApiResponse<FactionData>>(
      `/factions/${encodeURIComponent(symbol)}`,
      { requiresAuth: false },
      { category: 'factions' },
    );
    return response.data;
  }

  async getAgentBySymbol(symbol: string): Promise<AgentData> {
    const response = await this.request<ApiResponse<AgentData>>(
      `/agents/${encodeURIComponent(symbol)}`,
      { requiresAuth: false },
    );
    return response.data;
  }

  async getContract(contractId: string): Promise<ContractData> {
    const response = await this.request<ApiResponse<ContractData>>(
      `/my/contracts/${encodeURIComponent(contractId)}`,
      {},
      { category: 'contracts' },
    );
    return response.data;
  }

  async deliverContract(
    contractId: string,
    shipSymbol: string,
    tradeSymbol: string,
    units: number,
  ) {
    this.cache.invalidate('contracts');
    this.cache.invalidate('ships');
    return this.request<ApiResponse<{ contract: ContractData }>>(
      `/my/contracts/${encodeURIComponent(contractId)}/deliver`,
      { method: 'POST', body: { shipSymbol, tradeSymbol, units } },
    );
  }

  async fulfillContract(contractId: string) {
    this.cache.invalidate('contracts');
    this.cache.invalidate('agent');
    const response = await this.request<ApiResponse<{ contract: ContractData; agent: AgentData }>>(
      `/my/contracts/${encodeURIComponent(contractId)}/fulfill`,
      { method: 'POST' },
    );
    return mapContract(response.data.contract);
  }

  async purchaseShip(shipType: string, waypointSymbol: string) {
    this.cache.invalidate('ships');
    this.cache.invalidate('agent');
    return this.request<ApiResponse<{ agent: AgentData; ship: ShipData }>>(
      '/my/ships',
      { method: 'POST', body: { shipType, waypointSymbol } },
    );
  }

  async refineShip(shipSymbol: string, produce: string) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<{ cargo: ShipCargo }>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/refine`,
      { method: 'POST', body: { produce } },
    );
  }

  async getShipCooldown(shipSymbol: string): Promise<ShipCooldown | null> {
    const response = await this.request<ApiResponse<ShipCooldown> | null>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/cooldown`,
    );
    return response?.data ?? null;
  }

  async getShipNav(shipSymbol: string): Promise<ShipNav> {
    const response = await this.request<ApiResponse<ShipNav>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/nav`,
    );
    return response.data;
  }

  async patchShipNav(shipSymbol: string, flightMode: ShipNavFlightMode) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<{ nav: ShipNav; fuel: ShipData['fuel'] }>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/nav`,
      { method: 'PATCH', body: { flightMode } },
    );
  }

  async extractWithSurvey(shipSymbol: string, survey: unknown) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<ExtractionResult>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/extract/survey`,
      { method: 'POST', body: survey },
    );
  }

  async scanShips(shipSymbol: string) {
    return this.request<ApiResponse<{ cooldown: unknown; ships: unknown[] }>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/scan/ships`,
      { method: 'POST' },
    );
  }

  async transferCargo(
    fromShipSymbol: string,
    toShipSymbol: string,
    tradeSymbol: string,
    units: number,
  ) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<{ cargo: ShipCargo }>>(
      `/my/ships/${encodeURIComponent(fromShipSymbol)}/transfer`,
      { method: 'POST', body: { shipSymbol: toShipSymbol, tradeSymbol, units } },
    );
  }

  async getMounts(shipSymbol: string): Promise<ShipMount[]> {
    const response = await this.request<ApiResponse<ShipMount[]>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/mounts`,
    );
    return response.data ?? [];
  }

  async installMount(shipSymbol: string, symbol: string) {
    this.cache.invalidate('ships');
    this.cache.invalidate('agent');
    return this.request<ApiResponse<{ agent: AgentData; mounts: ShipMount[]; cargo: ShipCargo }>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/mounts/install`,
      { method: 'POST', body: { symbol } },
    );
  }

  async removeMount(shipSymbol: string, symbol: string) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<{ cargo: ShipCargo }>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/mounts/remove`,
      { method: 'POST', body: { symbol } },
    );
  }

  async getRepairQuote(shipSymbol: string) {
    const response = await this.request<ApiResponse<ShipQuote>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/repair`,
    );
    return response.data;
  }

  async repairShip(shipSymbol: string) {
    this.cache.invalidate('ships');
    this.cache.invalidate('agent');
    return this.request<ApiResponse<{ agent: AgentData; ship: ShipData }>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/repair`,
      { method: 'POST' },
    );
  }

  async getScrapValue(shipSymbol: string) {
    const response = await this.request<ApiResponse<ShipQuote>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/scrap`,
    );
    return response.data;
  }

  async scrapShip(shipSymbol: string) {
    this.cache.invalidate('ships');
    this.cache.invalidate('agent');
    return this.request<ApiResponse<{ agent: AgentData }>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/scrap`,
      { method: 'POST' },
    );
  }

  async getShipModules(shipSymbol: string): Promise<ShipModule[]> {
    const response = await this.request<ApiResponse<ShipModule[]>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/modules`,
    );
    return response.data ?? [];
  }

  async installShipModule(shipSymbol: string, symbol: string) {
    this.cache.invalidate('ships');
    this.cache.invalidate('agent');
    return this.request<ApiResponse<{ agent: AgentData; modules: ShipModule[]; cargo: ShipCargo }>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/modules/install`,
      { method: 'POST', body: { symbol } },
    );
  }

  async removeShipModule(shipSymbol: string, symbol: string) {
    this.cache.invalidate('ships');
    return this.request<ApiResponse<{ cargo: ShipCargo }>>(
      `/my/ships/${encodeURIComponent(shipSymbol)}/modules/remove`,
      { method: 'POST', body: { symbol } },
    );
  }

  async getSupplyChain(): Promise<SupplyChainData> {
    const response = await this.request<ApiResponse<SupplyChainData>>(
      '/market/supply-chain',
      { requiresAuth: false },
      { category: 'supply-chain' },
    );
    return response.data;
  }

  resolveEndpointPath(template: string, pathParams: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) =>
      encodeURIComponent(pathParams[key] ?? ''),
    );
  }

  private invalidateForMutation(path: string): void {
    if (path.includes('/ships')) this.cache.invalidate('ships');
    if (path.includes('/contracts')) this.cache.invalidate('contracts');
    if (path.includes('/agent') || path.includes('/purchase') || path.includes('/repair') || path.includes('/scrap')) {
      this.cache.invalidate('agent');
    }
    if (path.includes('/waypoints') || path.includes('/chart') || path.includes('/survey') || path.includes('/scan')) {
      this.cache.invalidate('waypoints');
    }
    if (path.includes('/systems')) this.cache.invalidate('systems');
    if (path.includes('/market')) this.cache.invalidate('markets');
  }

  async callEndpoint(endpoint: ApiEndpointMeta, options: CallEndpointOptions = {}): Promise<CallEndpointResult> {
    let path = this.resolveEndpointPath(endpoint.path, options.pathParams ?? {});
    if (options.query) {
      const qs = Object.entries(options.query)
        .filter(([, v]) => v.trim() !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      if (qs) path += `?${qs}`;
    }

    const method = endpoint.method;
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      this.invalidateForMutation(path);
    }

    const needsBody = ['POST', 'PATCH', 'PUT'].includes(method);
    const started = performance.now();
    try {
      const data = await this.request(path, {
        method,
        body: needsBody ? (options.body ?? {}) : undefined,
        requiresAuth: endpoint.requiresAuth,
      });
      return { data, status: 200, durationMs: Math.round(performance.now() - started) };
    } catch (error) {
      const err = error as Error & { status?: number };
      return {
        data: { error: err.message },
        status: err.status ?? 0,
        durationMs: Math.round(performance.now() - started),
      };
    }
  }

  clearCaches(): void {
    this.cache.clear();
    this.rateLimiter.clearQueue();
  }
}
