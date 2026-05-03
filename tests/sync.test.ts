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

describe('Compaction', () => {
  const existingItems: ShoppingItem[] = [
    {
      id: '1',
      name: 'Milk',
      completed: false,
      deleted_at: null,
      updated_at: '2026-05-01T10:00:00.000Z',
    },
    {
      id: '2',
      name: 'Bread',
      completed: true,
      deleted_at: null,
      updated_at: '2026-05-01T09:00:00.000Z',
    },
  ];

  it('should clear local state when compact change is received', () => {
    const compactChange: ShoppingItemCDC = {
      id: 'compact',
      name: '',
      completed: false,
      deleted_at: null,
      change: 'compact',
      updated_at: '2026-05-01T12:00:00.000Z',
    };

    const result = applyBackendChanges(existingItems, [compactChange]);
    expect(result).toHaveLength(0);
  });

  it('should rebuild local state deterministically after compact followed by creates', () => {
    const changes: ShoppingItemCDC[] = [
      {
        id: 'compact',
        name: '',
        completed: false,
        deleted_at: null,
        change: 'compact',
        updated_at: '2026-05-01T12:00:00.000Z',
      },
      {
        id: '1',
        name: 'Milk',
        completed: false,
        deleted_at: null,
        change: 'create',
        updated_at: '2026-05-01T12:00:01.000Z',
      },
      {
        id: '2',
        name: 'Eggs',
        completed: false,
        deleted_at: null,
        change: 'create',
        updated_at: '2026-05-01T12:00:02.000Z',
      },
      {
        id: '3',
        name: 'Butter',
        completed: true,
        deleted_at: null,
        change: 'create',
        updated_at: '2026-05-01T12:00:03.000Z',
      },
    ];

    const result = applyBackendChanges(existingItems, changes);

    expect(result).toHaveLength(3);
    expect(result.map(item => item.id)).toEqual(['1', '2', '3']);
    expect(result.map(item => item.name)).toEqual(['Milk', 'Eggs', 'Butter']);
    expect(result.find(item => item.id === '3')?.completed).toBe(true);
  });

  it('should not add deleted items after compact', () => {
    const changes: ShoppingItemCDC[] = [
      {
        id: 'compact',
        name: '',
        completed: false,
        deleted_at: null,
        change: 'compact',
        updated_at: '2026-05-01T12:00:00.000Z',
      },
      {
        id: '1',
        name: 'Milk',
        completed: false,
        deleted_at: '2026-05-01T11:00:00.000Z',
        change: 'create',
        updated_at: '2026-05-01T12:00:01.000Z',
      },
      {
        id: '2',
        name: 'Bread',
        completed: false,
        deleted_at: null,
        change: 'create',
        updated_at: '2026-05-01T12:00:02.000Z',
      },
    ];

    const result = applyBackendChanges(existingItems, changes);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});
