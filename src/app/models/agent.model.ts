export interface AgentData {
  symbol: string;
  credits: number;
  startingFaction: string;
  headquarters: string;
  shipCount: number;
}

export interface Agent {
  token: string;
  name: string;
  credits: number;
  faction: string;
  hq: string;
  ships_cpt: number;
}

export function mapAgent(data: AgentData, token = ''): Agent {
  return {
    token,
    name: data.symbol,
    credits: data.credits,
    faction: data.startingFaction,
    hq: data.headquarters,
    ships_cpt: data.shipCount,
  };
}

export function getAgentSystem(agent: Agent): string {
  const parts = agent.hq.split('-');
  return `${parts[0]}-${parts[1]}`;
}
