import { MissionBriefing } from './mission-director.models';

const GENERIC: Record<string, MissionBriefing> = {
  procurement: {
    id: 'procurement',
    title: 'Supply Run',
    stakes: 'Procure goods and keep the faction supply lines intact.',
    debrief: 'Cargo secured. The quartermaster marks this delivery on the ledger.',
    voiceLine: 'Procurement authorized. Move fast — shelves are empty.',
  },
  transport: {
    id: 'transport',
    title: 'Convoy Leg',
    stakes: 'Move cargo through contested lanes without delay.',
    debrief: 'Shipment logged. Routing clears you for the next leg.',
    voiceLine: 'Transport window is narrow. Do not miss the slot.',
  },
  shuttle: {
    id: 'shuttle',
    title: 'Shuttle Relay',
    stakes: 'Short-hop relay between waypoints under faction watch.',
    debrief: 'Relay complete. Passenger manifest closed.',
    voiceLine: 'Shuttle clearance granted. Keep the timetable.',
  },
  survey: {
    id: 'survey',
    title: 'Field Survey',
    stakes: 'Chart anomalies and return telemetry before rivals do.',
    debrief: 'Survey data archived. Science desk sends thanks — quietly.',
    voiceLine: 'Survey package required on-site. Eyes open.',
  },
  'procurement-done': {
    id: 'procurement-done',
    title: 'Supply Run',
    stakes: '',
    debrief: 'Procurement closed. Standing improved with the faction.',
    voiceLine: 'Procurement complete. Well supplied.',
  },
  'transport-done': {
    id: 'transport-done',
    title: 'Convoy Leg',
    stakes: '',
    debrief: 'Convoy delivered. Next route is already queued.',
    voiceLine: 'Transport fulfilled. Convoy logged.',
  },
  'shuttle-done': {
    id: 'shuttle-done',
    title: 'Shuttle Relay',
    stakes: '',
    debrief: 'Shuttle relay signed off.',
    voiceLine: 'Shuttle relay complete.',
  },
  'survey-done': {
    id: 'survey-done',
    title: 'Field Survey',
    stakes: '',
    debrief: 'Survey filed. Cartography credits yours.',
    voiceLine: 'Survey complete. Data received.',
  },
};

const FACTION_VOICE: Record<string, Partial<Record<string, string>>> = {
  COSMIC: {
    procurement: 'Cosmic Union needs materiel. Fill the manifest — quietly.',
    transport: 'Union convoy lane is hot. Stay on bearing.',
  },
  VOID: {
    survey: 'Void Collective wants eyes on the ground. No chatter on open bands.',
    transport: 'Ghost the sensors. Deliver before dawn cycle.',
  },
  DOMINION: {
    procurement: 'Dominion requisitions are non-negotiable. Execute.',
    transport: 'Dominion freight moves on schedule. You are the schedule.',
  },
};

export function briefingFor(contractType: string, factionSymbol: string): MissionBriefing {
  const type = contractType.toUpperCase();
  const key = type === 'PROCUREMENT' ? 'procurement'
    : type === 'TRANSPORT' ? 'transport'
    : type === 'SHUTTLE' ? 'shuttle'
    : type === 'SURVEY' ? 'survey'
    : 'procurement';
  const base = GENERIC[key] ?? GENERIC['procurement'];
  const faction = factionSymbol.toUpperCase();
  const voiceOverride = FACTION_VOICE[faction]?.[key];
  return {
    ...base,
    voiceLine: voiceOverride ?? base.voiceLine,
    title: `${faction} · ${base.title}`,
  };
}

export function debriefFor(contractType: string, factionSymbol: string): MissionBriefing {
  const type = contractType.toUpperCase();
  const key = type === 'PROCUREMENT' ? 'procurement-done'
    : type === 'TRANSPORT' ? 'transport-done'
    : type === 'SHUTTLE' ? 'shuttle-done'
    : type === 'SURVEY' ? 'survey-done'
    : 'procurement-done';
  const base = GENERIC[key] ?? GENERIC['procurement-done'];
  return { ...base, title: `${factionSymbol.toUpperCase()} · ${base.title}` };
}

export function getBriefingById(id: string): MissionBriefing | undefined {
  return GENERIC[id];
}
