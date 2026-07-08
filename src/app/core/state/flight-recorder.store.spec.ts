import { TestBed } from '@angular/core/testing';
import { FlightRecorderStore } from './flight-recorder.store';
import { ShipData } from '../../models/ship.model';

const AGENT = 'Recorder-Pilot';
const STORAGE_KEY = `st_flightrec_${AGENT}`;

function voyageShip(symbol: string, departureTime: string): ShipData {
  return {
    symbol,
    nav: {
      systemSymbol: 'X1-TEST',
      waypointSymbol: 'X1-TEST-2',
      status: 'IN_TRANSIT',
      flightMode: 'CRUISE',
      route: {
        origin: {
          symbol: 'X1-TEST-1',
          type: 'PLANET',
          systemSymbol: 'X1-TEST',
          x: 0,
          y: 0,
        },
        destination: {
          symbol: 'X1-TEST-2',
          type: 'PLANET',
          systemSymbol: 'X1-TEST',
          x: 10,
          y: 0,
        },
        departureTime,
        arrival: '2024-06-01T02:00:00.000Z',
      },
    },
    registration: { name: symbol, factionSymbol: 'COSMIC', role: 'FABRICATOR' },
    crew: { current: 1, capacity: 1, required: 1, morale: 100 },
    frame: {
      name: 'Frame',
      description: '',
      fuelCapacity: 100,
      condition: 100,
      requirements: { power: 1, crew: 1 },
    },
    reactor: {
      name: 'Reactor',
      description: '',
      condition: 100,
      powerOutput: 1,
      requirements: { crew: 1 },
    },
    fuel: { current: 50, capacity: 100, consumed: { amount: 0, timestamp: '' } },
  };
}

describe('FlightRecorderStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [FlightRecorderStore],
    });
  });

  it('records completed voyages and persists them', () => {
    const store = TestBed.inject(FlightRecorderStore);
    store.attach(AGENT);
    store.recordFromShip(voyageShip('SHIP-1', '2024-06-01T00:00:00.000Z'));

    expect(store.count()).toBe(1);
    expect(store.voyages()[0]?.ship).toBe('SHIP-1');
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toHaveLength(1);
  });

  it('skips duplicate ship and departure combinations', () => {
    const store = TestBed.inject(FlightRecorderStore);
    store.attach(AGENT);
    const ship = voyageShip('SHIP-1', '2024-06-01T00:00:00.000Z');
    store.recordFromShip(ship);
    store.recordFromShip(ship);
    expect(store.count()).toBe(1);
  });

  it('caps stored voyages at 60', () => {
    const store = TestBed.inject(FlightRecorderStore);
    store.attach(AGENT);
    for (let i = 0; i < 65; i++) {
      store.recordFromShip(
        voyageShip('SHIP-1', new Date(Date.UTC(2024, 5, 1, 0, i, 0)).toISOString()),
      );
    }
    expect(store.count()).toBe(60);
  });

  it('reloads voyages on attach', () => {
    const store = TestBed.inject(FlightRecorderStore);
    store.attach(AGENT);
    store.recordFromShip(voyageShip('SHIP-2', '2024-06-01T00:00:00.000Z'));
    store.detach();

    const store2 = TestBed.inject(FlightRecorderStore);
    store2.attach(AGENT);
    expect(store2.count()).toBe(1);
  });

  it('clear removes persisted voyages', () => {
    const store = TestBed.inject(FlightRecorderStore);
    store.attach(AGENT);
    store.recordFromShip(voyageShip('SHIP-1', '2024-06-01T00:00:00.000Z'));
    store.clear();
    expect(store.count()).toBe(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]');
  });
});
