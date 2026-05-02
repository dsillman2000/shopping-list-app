import { describe, it, expect } from 'vitest';
import { applyBackendChanges } from '../src/lib/sync';
import { ShoppingItem, ShoppingItemCDC } from '../src/worker';

describe('Conflict Resolution (Concurrency)', () => {
  const baseItem: ShoppingItem = {
    id: '1',
    name: 'Milk',
    completed: false,
    deleted_at: null,
    updated_at: '2026-05-01T10:00:00.000Z',
  };

  it('should overwrite local state if backend change is newer', () => {
    const localItems = [baseItem];
    const backendChanges: ShoppingItemCDC[] = [{
      ...baseItem,
      name: 'Oat Milk',
      change: 'update',
      updated_at: '2026-05-01T11:00:00.000Z',
    }];

    const result = applyBackendChanges(localItems, backendChanges);
    expect(result[0].name).toBe('Oat Milk');
    expect(result[0].updated_at).toBe('2026-05-01T11:00:00.000Z');
  });

  it('should ignore backend change if local state is newer', () => {
    const localItems = [{
      ...baseItem,
      name: 'Soy Milk',
      updated_at: '2026-05-01T12:00:00.000Z',
    }];
    const backendChanges: ShoppingItemCDC[] = [{
      ...baseItem,
      name: 'Oat Milk',
      change: 'update',
      updated_at: '2026-05-01T11:00:00.000Z',
    }];

    const result = applyBackendChanges(localItems, backendChanges);
    expect(result[0].name).toBe('Soy Milk');
    expect(result[0].updated_at).toBe('2026-05-01T12:00:00.000Z');
  });

  it('should handle new items from backend', () => {
    const localItems: ShoppingItem[] = [];
    const newItem: ShoppingItemCDC = {
      id: '2',
      name: 'Bread',
      completed: false,
      deleted_at: null,
      change: 'create',
      updated_at: '2026-05-01T10:00:00.000Z',
    };

    const result = applyBackendChanges(localItems, [newItem]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});
