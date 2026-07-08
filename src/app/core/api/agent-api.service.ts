import { inject, Injectable } from '@angular/core';
import { ApiResponse } from '../../models/api.model';
import { AgentData, mapAgent } from '../../models/agent.model';
import { TokenStorageService } from '../../services/token-storage.service';
import { ApiRequestService } from './api-request.service';

@Injectable({ providedIn: 'root' })
export class AgentApiService {
  private readonly api = inject(ApiRequestService);
  private readonly tokenStorage = inject(TokenStorageService);

  async getAgent() {
    const response = await this.api.request<ApiResponse<AgentData>>(
      '/my/agent',
      { cache: { category: 'agent' }, suppressGlobalHandler: true },
    );
    const token = this.tokenStorage.getToken() ?? '';
    return mapAgent(response.data, token);
  }

  async register(symbol: string, faction: string, accountToken: string) {
    const response = await this.api.request<ApiResponse<{ agent: AgentData; token: string }>>(
      '/register',
      {
        method: 'POST',
        body: { symbol, faction },
        requiresAuth: false,
        bearerToken: accountToken,
        suppressGlobalHandler: true,
      },
    );
    return mapAgent(response.data.agent, response.data.token);
  }
}
