import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { ReplaySubject } from 'rxjs';
import { getAccessToken } from './auth-storage';
import { getApiBaseUrl } from './api-client';

export interface StockRealtimeItem {
  materialId: number;
  onHandStock: number;
  reservedQty: number;
  availableQty: number;
}

@Injectable({ providedIn: 'root' })
export class StockRealtimeService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly updatesSubject = new ReplaySubject<StockRealtimeItem[]>(1);
  readonly updates$ = this.updatesSubject.asObservable();

  constructor(private readonly ngZone: NgZone) {}

  connect(): void {
    const token = getAccessToken();
    if (!token) {
      this.disconnect();
      return;
    }

    if (this.socket?.connected) {
      return;
    }

    this.disconnect();
    this.socket = io(`${getApiBaseUrl()}/stock`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.ngZone.run(() => {
        console.debug('[stock] socket connected', this.socket?.id);
      });
    });

    this.socket.on('connect_error', (error) => {
      this.ngZone.run(() => {
        console.warn('[stock] socket connect_error', error.message);
      });
    });

    this.socket.on('stock.updated', (payload: { items?: StockRealtimeItem[] }) => {
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (items.length === 0) {
        return;
      }
      this.ngZone.run(() => {
        this.updatesSubject.next(items);
      });
    });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.updatesSubject.complete();
  }
}
