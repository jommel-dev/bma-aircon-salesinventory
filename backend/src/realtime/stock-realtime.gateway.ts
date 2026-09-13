import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';

export type StockRealtimeItem = {
  materialId: number;
  onHandStock: number;
  reservedQty: number;
  availableQty: number;
};

@WebSocketGateway({
  namespace: '/stock',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class StockRealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(StockRealtimeGateway.name);

  constructor(private readonly configService: ConfigService) {}

  handleConnection(client: Socket): void {
    const token = this.extractToken(client);
    const secret = this.configService.get<string>('JWT_SECRET', 'dev-secret');

    if (!token) {
      this.logger.warn(`Stock socket rejected ${client.id}: missing token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = verify(token, secret);
      if (!payload || typeof payload !== 'object') {
        this.logger.warn(`Stock socket rejected ${client.id}: invalid payload`);
        client.disconnect(true);
        return;
      }
      client.data.user = payload;
      this.logger.log(`Stock socket connected ${client.id}`);
    } catch {
      this.logger.warn(`Stock socket rejected ${client.id}: invalid or expired token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // no-op: socket.io tracks connected clients
  }

  emitStockUpdated(items: StockRealtimeItem[]): void {
    if (!this.server || items.length === 0) {
      return;
    }
    this.server.emit('stock.updated', { items });
    this.logger.log(
      `Emitted stock.updated for ${items.length} material(s): ${items
        .map((item) => `${item.materialId}=${item.onHandStock}`)
        .join(', ')}`,
    );
  }

  private extractToken(client: Socket): string | null {
    const authToken = String(client.handshake.auth?.token ?? '').trim();
    if (authToken) {
      return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
    }

    const header = String(client.handshake.headers?.authorization ?? '').trim();
    if (header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    const queryToken = String(client.handshake.query?.token ?? '').trim();
    return queryToken || null;
  }
}
