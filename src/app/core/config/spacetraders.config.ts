import { InjectionToken } from '@angular/core';

export interface SpaceTradersConfig {
  host: string;
  timing: number;
  rateLimit: { requestsPerSecond: number; burstLimit: number };
  retry: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    retryableStatuses: number[];
  };
  cacheTTL: Record<string, number>;
  pagination: { defaultLimit: number; maxLimit: number };
}

export const SPACETRADERS_CONFIG = new InjectionToken<SpaceTradersConfig>('SPACETRADERS_CONFIG');

export const defaultSpaceTradersConfig: SpaceTradersConfig = {
  host: 'https://api.spacetraders.io/v2',
  timing: 500,
  rateLimit: { requestsPerSecond: 2, burstLimit: 10 },
  retry: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    retryableStatuses: [429, 500, 502, 503, 504],
  },
  cacheTTL: {
    systems: 3600000,
    waypoints: 1800000,
    markets: 60000,
    shipyards: 300000,
    agent: 30000,
    contracts: 60000,
    ships: 10000,
    factions: 86400000,
    default: 60000,
  },
  pagination: { defaultLimit: 20, maxLimit: 20 },
};
