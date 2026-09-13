import { PoItemsTableComponent, PoLineItem } from './po-items-table.component';

describe('PoItemsTableComponent – Wave 1 quantity workflow', () => {
  let component: PoItemsTableComponent;
  let changed: Array<{ index: number; item: PoLineItem }>;

  const baseItem = (): PoLineItem => ({
    materialId: 1,
    description: 'Copper Tube',
    itemCode: 'CT-1',
    unit: 'M',
    cost: 10,
    rate: 12,
    discount: 0,
    qty: 1,
    total: 10,
  });

  beforeEach(() => {
    component = new PoItemsTableComponent();
    component.items = [baseItem()];
    changed = [];
    component.itemChanged.subscribe((event) => changed.push(event));
  });

  it('accepts quantities up to 9999999', () => {
    component.onQtyChange(0, '9999999');

    expect(component.items[0].qty).toBe(9999999);
    expect(changed.length).toBe(1);
    expect(changed[0].item.qty).toBe(9999999);
  });

  it('accepts 1000000 which used to be rejected by the old 999999 cap', () => {
    component.onQtyChange(0, '1000000');

    expect(component.items[0].qty).toBe(1000000);
  });

  it('rejects quantities above 9999999', () => {
    component.onQtyChange(0, '10000000');

    expect(component.items[0].qty).toBe(1);
    expect(changed.length).toBe(0);
  });

  it('rejects zero and non-integer qty', () => {
    component.onQtyChange(0, '0');
    component.onQtyChange(0, '12.5');

    expect(component.items[0].qty).toBe(1);
    expect(changed.length).toBe(0);
  });
});
