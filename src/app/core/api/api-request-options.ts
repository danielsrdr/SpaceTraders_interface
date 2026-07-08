export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  requiresAuth?: boolean;
  bearerToken?: string;
  cache?: { category: string };
  suppressGlobalHandler?: boolean;
  suppressUi?: boolean;
}

export interface CacheConfig {
  category: string;
}
