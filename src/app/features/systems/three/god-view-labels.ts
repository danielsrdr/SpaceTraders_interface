import { PerspectiveCamera, Vector3 } from 'three';
import { hasTrait, PlanetView } from '../../../models/system.model';
import { isDockableWaypoint, resolveWaypointType } from '../planet-helpers';
import { GodViewFilter, isWaypointVisibleInFilter, type GodMarkerContext } from './god-view-markers.builder';

export type LabelPriority = 'high' | 'normal' | 'low';
export type LabelAccent = 'market' | 'shipyard' | null;

export interface PlanetScreenLabel {
  name: string;
  fullName: string;
  x: number;
  y: number;
  visible: boolean;
  priority: LabelPriority;
  accent: LabelAccent;
  traits: string[];
  shipCount: number;
  type: string;
}

export interface LabelLayoutEntry {
  planet: PlanetView;
  worldPosition: Vector3;
  radius: number;
}

export interface LabelLayoutOptions {
  filter: GodViewFilter;
  focusPlanetName: string | null;
  selectedPlanetName: string | null;
  hoveredPlanetName: string | null;
  shipCounts: Map<string, number>;
}

interface ScreenCandidate {
  planet: PlanetView;
  fullName: string;
  abbreviated: string;
  x: number;
  y: number;
  score: number;
  priority: LabelPriority;
  accent: LabelAccent;
  traits: string[];
  shipCount: number;
  type: string;
  width: number;
  height: number;
}

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const tempProject = new Vector3();

export function abbreviateWaypointName(name: string, planet: PlanetView): string {
  const parts = name.split('-');
  const suffix = parts.length > 1 ? parts[parts.length - 1]! : name;
  if (hasTrait(planet, 'MARKETPLACE')) return `M·${suffix}`;
  if (hasTrait(planet, 'SHIPYARD')) return `S·${suffix}`;
  if (resolveWaypointType(planet.type) === 'JUMP_GATE') return `J·${suffix}`;
  return suffix;
}

function labelAccent(planet: PlanetView): LabelAccent {
  if (hasTrait(planet, 'MARKETPLACE')) return 'market';
  if (hasTrait(planet, 'SHIPYARD')) return 'shipyard';
  return null;
}

function priorityTier(score: number): LabelPriority {
  if (score >= 80) return 'high';
  if (score >= 40) return 'normal';
  return 'low';
}

function computePriorityScore(planet: PlanetView, options: LabelLayoutOptions): number {
  let score = 0;
  if (planet.name === options.focusPlanetName) score += 100;
  if (planet.name === options.selectedPlanetName) score += 90;
  if (planet.name === options.hoveredPlanetName) score += 200;
  const ships = options.shipCounts.get(planet.name) ?? 0;
  if (ships > 0) score += 70 + ships * 5;
  if (hasTrait(planet, 'MARKETPLACE')) score += 60;
  if (hasTrait(planet, 'SHIPYARD')) score += 55;
  if (resolveWaypointType(planet.type) === 'JUMP_GATE') score += 50;
  if (isDockableWaypoint(planet)) score += 35;
  const resolved = resolveWaypointType(planet.type);
  if (resolved === 'PLANET' || resolved === 'GAS_GIANT') score += 25;
  if (resolved === 'MOON' || resolved === 'ORBITAL_STATION') score += 15;
  if (resolved === 'ASTEROID' || resolved === 'ASTEROID_FIELD' || resolved === 'DEBRIS_FIELD') score += 5;
  return score;
}

function estimateLabelSize(text: string, priority: LabelPriority): { width: number; height: number } {
  const charWidth = priority === 'low' ? 5.5 : 6.5;
  const height = priority === 'low' ? 14 : 16;
  return { width: Math.max(28, text.length * charWidth + 14), height };
}

function rectsOverlap(a: ScreenRect, b: ScreenRect, padding = 4): boolean {
  return !(
    a.right + padding < b.left ||
    a.left - padding > b.right ||
    a.top - padding > b.bottom ||
    a.bottom + padding < b.top
  );
}

function toRect(x: number, y: number, width: number, height: number): ScreenRect {
  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - height,
    bottom: y,
  };
}

export function computeLabelLayout(
  entries: LabelLayoutEntry[],
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
  options: LabelLayoutOptions,
): PlanetScreenLabel[] {
  if (!viewportWidth || !viewportHeight || !entries.length) return [];

  const ctx: GodMarkerContext = {
    filter: options.filter,
    focusPlanetName: options.focusPlanetName,
    selectedPlanetName: options.selectedPlanetName,
    shipCounts: options.shipCounts,
  };

  const candidates: ScreenCandidate[] = [];

  for (const entry of entries) {
    if (!isWaypointVisibleInFilter(entry.planet, ctx)) continue;

    tempProject.copy(entry.worldPosition);
    tempProject.y += entry.radius * 0.35;
    tempProject.project(camera);

    const onScreen =
      tempProject.z < 1 &&
      tempProject.x >= -1.05 &&
      tempProject.x <= 1.05 &&
      tempProject.y >= -1.05 &&
      tempProject.y <= 1.05;
    if (!onScreen) continue;

    const x = (tempProject.x * 0.5 + 0.5) * viewportWidth;
    const y = (-tempProject.y * 0.5 + 0.5) * viewportHeight;
    const score = computePriorityScore(entry.planet, options);
    const priority = priorityTier(score);
    const abbreviated = abbreviateWaypointName(entry.planet.name, entry.planet);
    const { width, height } = estimateLabelSize(abbreviated, priority);
    const traits =
      entry.planet.traits?.map((t) => t.symbol).filter(Boolean) ?? [];

    candidates.push({
      planet: entry.planet,
      fullName: entry.planet.name,
      abbreviated,
      x,
      y,
      score,
      priority,
      accent: labelAccent(entry.planet),
      traits,
      shipCount: options.shipCounts.get(entry.planet.name) ?? 0,
      type: entry.planet.type,
      width,
      height,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const placed: ScreenRect[] = [];
  const labels: PlanetScreenLabel[] = [];

  for (const candidate of candidates) {
    const forceShow = candidate.planet.name === options.hoveredPlanetName;
    let x = candidate.x;
    let y = candidate.y - 4;

    let rect = toRect(x, y, candidate.width, candidate.height);
    let collides = !forceShow && placed.some((p) => rectsOverlap(rect, p));

    if (collides) {
      for (let offset = 1; offset <= 3 && collides; offset++) {
        y = candidate.y - 4 - offset * (candidate.height + 2);
        rect = toRect(x, y, candidate.width, candidate.height);
        collides = placed.some((p) => rectsOverlap(rect, p));
      }
    }

    if (collides && !forceShow) continue;

    placed.push(rect);
    labels.push({
      name: candidate.abbreviated,
      fullName: candidate.fullName,
      x,
      y,
      visible: true,
      priority: candidate.priority,
      accent: candidate.accent,
      traits: candidate.traits,
      shipCount: candidate.shipCount,
      type: candidate.type,
    });
  }

  return labels;
}
