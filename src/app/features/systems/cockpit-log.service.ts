import { Injectable, signal } from '@angular/core';

export interface CockpitLogLine {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class CockpitLogService {
  readonly logLines = signal<CockpitLogLine[]>([]);
  readonly actionPulse = signal(0);
  readonly loadingAction = signal<string | null>(null);

  private logSeq = 0;

  pushLog(text: string, tone: CockpitLogLine['tone'] = 'info'): void {
    const entry: CockpitLogLine = { id: ++this.logSeq, text, tone };
    this.logLines.update((lines) => [...lines, entry].slice(-20));
  }

  pulse(): void {
    this.actionPulse.update((n) => n + 1);
  }

  signalAction(message: string): void {
    this.pushLog(message, 'info');
    this.pulse();
  }

  actionLoading(key: string): boolean {
    return this.loadingAction() === key;
  }

  actionLogPrefix(key: string): string {
    const verb = key.split('-')[0];
    switch (verb) {
      case 'dock':
        return 'DOCKING SEQUENCE INITIATED';
      case 'orbit':
        return 'BREAKING TO ORBIT';
      case 'nav':
        return 'PLOTTING NAV COURSE';
      case 'warp':
        return 'SPOOLING WARP DRIVE';
      case 'jump':
        return 'CHARGING JUMP DRIVE';
      case 'refuel':
        return 'PUMPING FUEL';
      case 'extract':
        return 'EXTRACTION ARM ENGAGED';
      case 'siphon':
        return 'SIPHON ONLINE';
      case 'buy':
        return 'PURCHASE ORDER SENT';
      case 'sell':
        return 'SELL ORDER SENT';
      case 'jettison':
        return 'VENTING CARGO';
      case 'transfer':
        return 'TRANSFERRING CARGO';
      case 'flight':
        return 'ADJUSTING FLIGHT MODE';
      case 'chart':
        return 'CHARTING WAYPOINT';
      case 'repair':
        return 'REPAIR BAY ENGAGED';
      case 'scrap':
        return 'SCRAPPING HULL';
      case 'install':
        return 'INSTALLING HARDWARE';
      case 'remove':
        return 'REMOVING HARDWARE';
      case 'supply':
        return 'SUPPLYING MATERIALS';
      case 'patch':
        return 'PATCHING HULL';
      case 'purchase':
        return 'ACQUIRING SHIP';
      default:
        return 'EXECUTING COMMAND';
    }
  }
}
