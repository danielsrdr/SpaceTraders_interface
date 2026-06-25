export interface ApiMeta {
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponse<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorBody {
  error?: {
    message?: string;
    code?: number;
    data?: unknown;
  };
}

export interface GameStatus {
  status: string;
  version: string;
  resetDate: string;
  description?: string;
  stats?: {
    accounts?: number;
    agents: number;
    ships: number;
    systems: number;
    waypoints: number;
  };
  serverResets?: { next: string; frequency: string };
  announcements?: Array<{ title: string; body: string }>;
}

export interface SupplyChainData {
  exportToImportMap: Record<string, string[]>;
}

export interface ShipQuote {
  transaction?: { totalPrice: number; waypointSymbol: string; shipSymbol: string };
}

export interface ShipMount {
  symbol: string;
  name: string;
  strength?: number;
  deposits?: unknown[];
}

export interface ShipModule {
  symbol: string;
  name: string;
  capacity?: number;
  range?: number;
}
