import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AgentData } from '../../models/agent.model';

function synthesizeHqGhost(agent: AgentData, selfSymbol: string) {
  if (agent.symbol === selfSymbol) return null;
  const hq = agent.headquarters;
  if (!hq) return null;
  const systemSymbol = hq.split('-').slice(0, 2).join('-');
  return {
    symbol: `GHOST-HQ-${agent.symbol}`,
    nav: { systemSymbol, waypointSymbol: hq, status: 'DOCKED' },
    registration: { factionSymbol: agent.startingFaction },
  };
}

describe('GhostFleetService helpers', () => {
  it('synthesizes HQ ghost and filters self', () => {
    const agent: AgentData = {
      symbol: 'RIVAL',
      credits: 5000,
      startingFaction: 'COSMIC',
      headquarters: 'X1-Y1-Z1',
      shipCount: 2,
    };
    const ghost = synthesizeHqGhost(agent, 'ME');
    expect(ghost?.symbol).toBe('GHOST-HQ-RIVAL');
    expect(ghost?.nav.systemSymbol).toBe('X1-Y1');
    expect(synthesizeHqGhost(agent, 'RIVAL')).toBeNull();
  });
});
