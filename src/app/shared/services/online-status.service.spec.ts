import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { OnlineStatusService } from './online-status.service';

describe('OnlineStatusService', () => {
  let service: OnlineStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OnlineStatusService],
    });
    service = TestBed.inject(OnlineStatusService);
  });

  it('reflects navigator.onLine in isOnline()', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    expect(service.isOnline()).toBe(true);
    expect(service.online()).toBe(true);
  });

  it('updates the online signal when browser events fire', () => {
    window.dispatchEvent(new Event('offline'));
    expect(service.isOnline()).toBe(false);
    expect(service.online()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(service.isOnline()).toBe(true);
    expect(service.online()).toBe(true);
  });
});
