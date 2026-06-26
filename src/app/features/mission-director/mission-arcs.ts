import { MissionArc } from './mission-director.models';

export const MISSION_ARCS: MissionArc[] = [
  {
    id: 'cosmic-supply',
    factionSymbol: 'COSMIC',
    title: 'Orbital Supply Chain',
    beats: [
      { contractType: 'PROCUREMENT', briefingId: 'procurement', debriefId: 'procurement-done' },
      { contractType: 'TRANSPORT', briefingId: 'transport', debriefId: 'transport-done' },
      { contractType: 'SHUTTLE', briefingId: 'shuttle', debriefId: 'shuttle-done' },
    ],
  },
  {
    id: 'void-recon',
    factionSymbol: 'VOID',
    title: 'Silent Reconnaissance',
    beats: [
      { contractType: 'SURVEY', briefingId: 'survey', debriefId: 'survey-done' },
      { contractType: 'TRANSPORT', briefingId: 'transport', debriefId: 'transport-done' },
    ],
  },
  {
    id: 'dominion-logistics',
    factionSymbol: 'DOMINION',
    title: 'Dominion Logistics',
    beats: [
      { contractType: 'PROCUREMENT', briefingId: 'procurement', debriefId: 'procurement-done' },
      { contractType: 'TRANSPORT', briefingId: 'transport', debriefId: 'transport-done' },
    ],
  },
];

export function arcForFaction(factionSymbol: string): MissionArc | undefined {
  return MISSION_ARCS.find((a) => a.factionSymbol === factionSymbol.toUpperCase());
}
