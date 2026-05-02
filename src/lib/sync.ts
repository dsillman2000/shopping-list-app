import { ShoppingItem, ShoppingItemCDC } from '../worker';

/**
 * Function to apply changes from backend to local state with conflict resolution.
 * 
 * Uses timestamp-based "Last Write Wins" resolution:
 * - If an item is new, it's added.
 * - If an item exists, the backend change is only applied if its updated_at 
 *   timestamp is strictly newer than the local item's updated_at timestamp.
 */
export const applyBackendChanges = (items: ShoppingItem[], backendChanges: ShoppingItemCDC[]): ShoppingItem[] => {
  if (!backendChanges || backendChanges.length === 0) return items;
  
  console.log(`Applying ${backendChanges.length} changes from backend to local state`);
  
  // Process each change from the backend
  return backendChanges.reduce((updatedItems, change) => {
    // For create operations or items that don't exist locally
    const existingItemIndex = updatedItems.findIndex(item => item.id === change.id);
    
    if (existingItemIndex === -1) {
      // This is a new item we don't have locally
      if (change.change === 'create') {
        // Only add if it's not deleted
        if (!change.deleted_at) {
          return [...updatedItems, {
            id: change.id,
            name: change.name,
            completed: change.completed,
            deleted_at: change.deleted_at,
            updated_at: change.updated_at
          }];
        }
      }
      return updatedItems;
    } else {
      // Update existing item - Conflict Resolution Logic
      return updatedItems.map(item => {
        if (item.id === change.id) {
          // Compare timestamps: Only update if backend change is newer than local state
          const backendUpdatedAt = new Date(change.updated_at).getTime();
          const localUpdatedAt = new Date(item.updated_at).getTime();
          
          if (backendUpdatedAt > localUpdatedAt) {
            console.log(`Updating item ${item.id} with newer backend change`);
            return { 
              ...item, 
              name: change.name, 
              completed: change.completed,
              deleted_at: change.deleted_at,
              updated_at: change.updated_at
            };
          } else {
            console.log(`Skipping backend change for item ${item.id} (local state is newer)`);
            return item;
          }
        }
        return item;
      });
    }
  }, items);
};
