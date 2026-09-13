import { StockRealtimeService } from './stock-realtime.service';

describe('StockRealtimeService', () => {
  it('does not query or emit when no material ids are provided', async () => {
    const query = jest.fn();
    const emitStockUpdated = jest.fn();
    const service = new StockRealtimeService(
      { query } as any,
      { get: () => ({ emitStockUpdated }) } as any,
    );

    await service.publish([0, null, undefined, Number.NaN]);

    expect(query).not.toHaveBeenCalled();
    expect(emitStockUpdated).not.toHaveBeenCalled();
  });
});
