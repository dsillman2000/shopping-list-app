"use client";

/**
 * Shopping List Component with CDC (Change Data Capture) Pattern
 * 
 * This component maintains two data stores in localStorage:
 * 1. 'shopping-list-items' - The current state of all shopping list items
 * 2. 'shopping-list-items-cdc' - A log of all changes made to items
 * 
 * The CDC pattern enables efficient synchronization with a server by only
 * sending changes since the last sync, instead of the entire state.
 * 
 * Currently, this implementation tracks changes locally without connecting
 * to a backend. When ready, these changes can be sent to the Cloudflare D1 backend.
 */

import React, { useState, useEffect } from 'react';
import { v7 as uuidv7 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, ArrowUpDown, Trash2, CheckCircle, Circle, CircleCheckBig, X } from 'lucide-react';
import { ShoppingItem, ShoppingItemCDC } from '@/worker';
import { API_CONFIG } from '../config/api-config';


type SortDirection = 'none' | 'asc' | 'desc';

// Local storage keys
const STORAGE_KEY = 'shopping-list-items';
const CDC_STORAGE_KEY = 'shopping-list-items-cdc';
const CDC_LAST_SEQUENCE_NUMBER_KEY = 'shopping-list-items-cdc-last-sequence-number';

// Live interaction timer constants
const AUTO_REFRESH_INTERVAL = 60000; // 60 seconds
const DEBOUNCE_INTERVAL = 8000; // 8 seconds
const SYNC_SIMULATION_TIME = 1500; // 1.5 seconds to simulate sync operation
const DEBOUNCE_SECONDS = Math.ceil(DEBOUNCE_INTERVAL / 1000); // Seconds value for countdown

// Placeholder for last known sequence number from backend
const getLastSequenceNumber = (): number => {
  try {
    const storedSequence = localStorage.getItem(CDC_LAST_SEQUENCE_NUMBER_KEY);
    return storedSequence ? parseInt(storedSequence, 10) : 0;
  } catch (error) {
    console.error('Error loading last sequence number:', error);
    return 0;
  }
};

// Store the last sequence number we've seen
const saveLastSequenceNumber = (sequenceNumber: number): void => {
  try {
    localStorage.setItem(CDC_LAST_SEQUENCE_NUMBER_KEY, sequenceNumber.toString());
  } catch (error) {
    console.error('Error saving last sequence number:', error);
  }
};

// API endpoint base URL from configuration
const API_BASE_URL = API_CONFIG.BASE_URL;

// Function to apply changes from backend to local state
const applyBackendChanges = (items: ShoppingItem[], backendChanges: ShoppingItemCDC[]): ShoppingItem[] => {
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
            deleted_at: change.deleted_at
          }];
        }
      }
      return updatedItems;
    } else {
      // Update existing item
      return updatedItems.map(item => 
        item.id === change.id 
          ? { ...item, 
              name: change.name, 
              completed: change.completed,
              deleted_at: change.deleted_at 
            }
          : item
      );
    }
  }, items);
};

// Function to send CDC changes to the backend
const sendChangesToBackend = async (changes: ShoppingItemCDC[]): Promise<number | null> => {
  // Skip sending if there are no changes
  if (!changes || changes.length === 0) return null;
  
  try {
    console.log(`Sending ${changes.length} changes to backend`);
    
    // Make the API call to post changes
    const response = await fetch(`${API_BASE_URL}/changes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ changes }),
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Changes sent successfully:', data);
    
    // Return the last sequence number from the response
    return data.sequence_number || null;
  } catch (error) {
    console.error('Error sending changes to backend:', error);
    return null;
  }
};

// Function to fetch changes from backend using real API
const fetchChangesFromBackend = async (): Promise<{ changes: ShoppingItemCDC[], max_sequence: number }> => {
  try {
    // Get the last sequence number we've seen
    const lastSequence = getLastSequenceNumber();
    console.log(`Fetching changes after sequence ${lastSequence}`);
    
    // Make the API call to get changes since our last known sequence
    const response = await fetch(`${API_BASE_URL}/changes?after_sequence=${lastSequence}`);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Received changes from backend:', data);
    
    return {
      changes: data.changes || [],
      max_sequence: data.max_sequence || lastSequence
    };
  } catch (error) {
    console.error('Error fetching changes from backend:', error);
    // Return empty result on error, maintaining the last sequence number
    return {
      changes: [],
      max_sequence: getLastSequenceNumber()
    };
  }
};

// Helper functions for localStorage operations
const saveItemsToLocalStorage = (items: ShoppingItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

const loadItemsFromLocalStorage = (): ShoppingItem[] => {
  try {
    const storedItems = localStorage.getItem(STORAGE_KEY);
    return storedItems ? JSON.parse(storedItems) : [];
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return [];
  }
};

// CDC Helper functions for tracking changes
const saveCdcToLocalStorage = (changes: ShoppingItemCDC[]) => {
  try {
    localStorage.setItem(CDC_STORAGE_KEY, JSON.stringify(changes));
  } catch (error) {
    console.error('Error saving CDC to localStorage:', error);
  }
};

/**
 * Sort CDC changes using a consistent order:
 * 1. By ID (alphabetically) - groups all changes for the same item together
 * 2. By change type - places 'create' operations before 'update' operations
 * 
 * This ensures that:
 * - Changes for the same item are grouped together
 * - The 'create' operation always comes before any 'update' operations
 * - The log maintains a consistent, deterministic order
 */
const sortCdcChanges = (changes: ShoppingItemCDC[]): ShoppingItemCDC[] => {
  return [...changes].sort((a, b) => {
    // First sort by ID to group all changes for the same item
    if (a.id !== b.id) return a.id.localeCompare(b.id);
    
    // Then ensure 'create' operations come before 'update' operations
    return a.change === 'create' ? -1 : b.change === 'create' ? 1 : 0;
  });
};

const loadCdcFromLocalStorage = (): ShoppingItemCDC[] => {
  try {
    const storedChanges = localStorage.getItem(CDC_STORAGE_KEY);
    const changes = storedChanges ? JSON.parse(storedChanges) : [];
    
    // Ensure changes are properly sorted
    return sortCdcChanges(changes);
  } catch (error) {
    console.error('Error loading CDC from localStorage:', error);
    return [];
  }
};

// Helper to add a change to the CDC log and sort properly
const addCdcChange = (changes: ShoppingItemCDC[], newChange: ShoppingItemCDC): ShoppingItemCDC[] => {
  // If a CDC change is already in the queue with the same change type and ID, replace it.
  if (changes.some(change => change.id === newChange.id && change.change === newChange.change)) {
    const updatedChanges = changes.map(change => {
      if (change.id === newChange.id && change.change === newChange.change) {
        return newChange;
      }
      return change;
    });
    
    // Sort the updated changes
    return sortCdcChanges(updatedChanges);
  }
  
  // Otherwise, append the new change to the queue and sort
  return sortCdcChanges([...changes, newChange]);
};



const ShoppingList: React.FC = () => {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [cdcChanges, setCdcChanges] = useState<ShoppingItemCDC[]>([]);
  const [newItem, setNewItem] = useState('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('none');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'pending' | 'syncing' | 'polling'>('idle');
  // Set initial countdown based on debounce seconds
  const [syncCountdown, setSyncCountdown] = useState<number>(DEBOUNCE_SECONDS);
  // Track page visibility
  const [isPageVisible, setIsPageVisible] = useState<boolean>(true);
  
  // References to store various timer IDs and state tracking
  const syncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = React.useRef<boolean>(false);
  const syncStatusOwnerRef = React.useRef<'polling' | 'manual' | 'timer' | null>(null);
  
  // Keep track of last sequence number for polling
  const [lastSequenceNumber, setLastSequenceNumber] = useState<number>(() => getLastSequenceNumber());

  const clearDeletedItems = () => {
    setItems(prevItems => prevItems.filter(item => !item.deleted_at));
  };
  
  // Function to poll the backend for changes
  const pollForChanges = async () => {
    // If we're already polling or page is not visible, don't start another poll
    if (isPollingRef.current || !isPageVisible) return;
    
    try {
      // Set polling flag
      isPollingRef.current = true;
      
      // Only update status if we're in idle state (don't interrupt other states)
      if (syncStatus === 'idle') {
        // Mark that the polling process owns the sync status
        syncStatusOwnerRef.current = 'polling';
        // Use 'syncing' status for consistency with manual syncing
        setSyncStatus('syncing');
      }
      
      console.log('Polling for changes from backend...');
      const response = await fetchChangesFromBackend();
      
      // Update our last known sequence number if the server has a higher one
      if (response.max_sequence > lastSequenceNumber) {
        setLastSequenceNumber(response.max_sequence);
        saveLastSequenceNumber(response.max_sequence);
      }
      
      // Apply any changes from the backend
      if (response.changes && response.changes.length > 0) {
        console.log('Applying changes from backend:', response.changes);
        // Apply changes to local items state
        setItems(prevItems => applyBackendChanges(prevItems, response.changes));
      }
    } catch (error) {
      console.error('Error polling for changes:', error);
    } finally {
      // Clear polling flag
      isPollingRef.current = false;
      
      // Only reset the status if polling still owns it
      if (syncStatusOwnerRef.current === 'polling') {
        setSyncStatus('idle');
        syncStatusOwnerRef.current = null;
      }
    }
  };
  
  // Function to start the polling interval
  const startPolling = () => {
    // Only start polling if page is visible and we don't already have a polling interval
    if (!isPageVisible) {
      console.log('Not starting polling because page is not visible');
      return;
    }
    
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    // Start a new polling interval that runs according to AUTO_REFRESH_INTERVAL
    pollingIntervalRef.current = setInterval(pollForChanges, AUTO_REFRESH_INTERVAL);
    console.log('Started polling for backend changes');
  };
  
  // Function to stop the polling interval
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('Stopped polling for backend changes');
    }
  };
  
  // Function to manually trigger sync
  const syncNow = () => {
    // Clear any existing timers
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    
    // Only sync if there are changes
    if (cdcChanges.length > 0) {
      // Mark that manual sync owns the sync status
      syncStatusOwnerRef.current = 'manual';
      setSyncStatus('syncing');
      setSyncCountdown(0);
      
      // Perform real sync with backend
      const syncWithBackend = async () => {
        try {
          console.log('Manual sync started with', cdcChanges.length, 'changes');
          
          // Send local changes to backend
          const sequenceNumber = await sendChangesToBackend(cdcChanges);
          
          // If successful, update the last sequence number and clear CDC changes
          if (sequenceNumber !== null) {
            console.log('Manual sync completed, last sequence:', sequenceNumber);
            saveLastSequenceNumber(sequenceNumber);
            setLastSequenceNumber(sequenceNumber);
            setCdcChanges([]);
            clearDeletedItems();
          } else {
            console.warn('Sync failed, keeping CDC changes for retry');
          }
          
          // Clear ownership and set to idle before polling
          syncStatusOwnerRef.current = null;
          setSyncStatus('idle');
          setSyncCountdown(DEBOUNCE_SECONDS);
          
          // After sync completes, immediately poll for new changes from backend
          await pollForChanges();
          
          // Then start regular polling again
          startPolling();
        } catch (error) {
          console.error('Error during manual sync:', error);
          syncStatusOwnerRef.current = null;
          setSyncStatus('idle');
        }
      };
      
      // Start the sync process
      syncWithBackend();
    }
  };
  
  // Load items and CDC changes from localStorage on component mount
  useEffect(() => {
    const storedItems = loadItemsFromLocalStorage();
    const storedChanges = loadCdcFromLocalStorage();
    setItems(storedItems);
    setCdcChanges(storedChanges);
    
    // Do an initial poll on mount
    pollForChanges();
    
    // Start polling if we don't have any pending changes
    if (storedChanges.length === 0) {
      startPolling();
    }
    
    // Clean up polling on unmount
    return () => {
      stopPolling();
    };
  }, []);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      console.log(`Page visibility changed: ${isVisible ? 'visible' : 'hidden'}`);
      setIsPageVisible(isVisible);
      
      if (isVisible) {
        // Page became visible again - check for changes
        console.log('Page is visible - starting polling and doing immediate poll');
        
        // If we don't have pending changes, start polling again
        if (cdcChanges.length === 0) {
          startPolling();
          // Do an immediate poll to catch up on changes
          pollForChanges();
        }
      } else {
        // Page is hidden - stop polling and cancel sync timers
        console.log('Page is hidden - stopping polling and sync timers');
        stopPolling();
        
        // Don't cancel sync timers if we have pending changes
        // This ensures changes are still synced even when tab is not active
        if (cdcChanges.length === 0 && syncTimerRef.current) {
          clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }
      }
    };
    
    // Set up event listener
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Initial check
    handleVisibilityChange();
    
    // Clean up
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cdcChanges.length]); // Dependency on cdcChanges.length to react to changes
  
  // Save items to localStorage whenever they change
  useEffect(() => {
    saveItemsToLocalStorage(items);
  }, [items]);
  
  // Save CDC changes to localStorage whenever they change
  useEffect(() => {
    saveCdcToLocalStorage(cdcChanges);
    
    // If there are no changes, we're in idle state
    if (cdcChanges.length === 0) {
      setSyncStatus('idle');
      setSyncCountdown(DEBOUNCE_SECONDS);
      
      // Start polling for backend changes when we have no pending changes
      startPolling();
      return;
    }
    
    // Stop polling when we have pending changes
    stopPolling();
    
    // Set status to pending - waiting for settle
    setSyncStatus('pending');
    setSyncCountdown(DEBOUNCE_SECONDS); // Reset countdown based on debounce interval
    
    // Clear any existing timers
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    
    // Start the countdown interval
    countdownIntervalRef.current = setInterval(() => {
      setSyncCountdown(prevCount => {
        if (prevCount <= 1) {
          // Clear the interval when we reach 0
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prevCount - 1;
      });
    }, DEBOUNCE_INTERVAL);
    
    // Set a new timer using the debounce interval constant
    syncTimerRef.current = setTimeout(() => {
      // After the DEBOUNCE_INTERVAL period with no changes, set status to syncing
      syncStatusOwnerRef.current = 'timer';
      setSyncStatus('syncing');
      
      // Perform real sync with backend
      const syncWithBackend = async () => {
        try {
          console.log('Auto sync started with', cdcChanges.length, 'changes');
          
          // Send local changes to backend
          const sequenceNumber = await sendChangesToBackend(cdcChanges);
          
          // If successful, update the last sequence number and clear CDC changes
          if (sequenceNumber !== null) {
            console.log('Auto sync completed, last sequence:', sequenceNumber);
            saveLastSequenceNumber(sequenceNumber);
            setLastSequenceNumber(sequenceNumber);
            setCdcChanges([]);
            clearDeletedItems();
          } else {
            console.warn('Auto sync failed, keeping CDC changes for retry');
          }
          
          // Clear ownership and set to idle before polling
          syncStatusOwnerRef.current = null;
          setSyncStatus('idle');
          setSyncCountdown(DEBOUNCE_SECONDS);
          
          // After sync completes, immediately poll for new changes from backend
          await pollForChanges();
          
          // Then start regular polling again
          startPolling();
        } catch (error) {
          console.error('Error during auto sync:', error);
          syncStatusOwnerRef.current = null;
          setSyncStatus('idle');
        }
      };
      
      // Start the sync process
      syncWithBackend();
    }, DEBOUNCE_INTERVAL); // Wait for changes to settle
    
    // Clean up function to clear the timers when unmounting or when cdcChanges updates again
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      // Stop polling when unmounting or when CDC changes
      stopPolling();
    };
  }, [cdcChanges]);

  const addItem = () => {
    if (newItem.trim()) {
      const id = uuidv7();
      const name = newItem.trim();
      
      // Create the new item for the main list
      const newItemObj: ShoppingItem = {
        id,
        name,
        completed: false,
        deleted_at: null,
      };
      
      // Create the CDC change record
      const cdcChange: ShoppingItemCDC = {
        id,
        change: 'create',
        name,
        completed: false,
        deleted_at: null
      };
      
      // Update both states
      setItems(prevItems => [...prevItems, newItemObj]);
      setCdcChanges(prevChanges => addCdcChange(prevChanges, cdcChange));
      
      setNewItem('');
    }
  };

  const toggleItem = (id: string) => {
    // Update the main items list
    setItems(prevItems => {
      const updatedItems = prevItems.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, completed: !item.completed };
          
          // Create a CDC change record
          const cdcChange: ShoppingItemCDC = {
            change: 'update',
            ...updatedItem,
          };
          
          // Update CDC changes
          setCdcChanges(prevChanges => addCdcChange(prevChanges, cdcChange));
          
          return updatedItem;
        }
        return item;
      });
      
      return updatedItems;
    });
  };

  const removeItem = (id: string) => {
    // Update the main items list
    setItems(prevItems => {
      const updatedItems = prevItems.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, deleted_at: new Date().toISOString() };
          
          // Create a CDC change record for the deletion (as an update with deleted_at set)
          const cdcChange: ShoppingItemCDC = {
            change: 'update',
            ...updatedItem,
          };
          
          // Update CDC changes
          setCdcChanges(prevChanges => addCdcChange(prevChanges, cdcChange));
          
          return updatedItem;
        }
        return item;
      });
      
      return updatedItems;
    });
  };

  const clearCompleted = () => {
    items.filter(item => item.completed).map(item => item.id).forEach(id => removeItem(id));
  };

  const clearAll = () => {
    items.filter(item => !item.deleted_at).map(item => item.id).forEach(id => removeItem(id));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addItem();
    }
  };

  const handleSort = () => {
    setSortDirection(current => {
      if (current === 'none') return 'asc';
      if (current === 'asc') return 'desc';
      return 'none';
    });
  };

  const startEditing = (item: ShoppingItem) => {
    setEditingItemId(item.id);
    setEditingName(item.name);
  };

  const saveEditing = () => {
    if (editingItemId && editingName.trim()) {
      // Update the main items list
      setItems(prevItems => {
        const updatedItems = prevItems.map(item => {
          if (item.id === editingItemId) {
            const updatedItem = { ...item, name: editingName.trim() };
            
            // Create a CDC change record
            const cdcChange: ShoppingItemCDC = {
              change: 'update',
              ...updatedItem,
            };
            
            // Update CDC changes
            setCdcChanges(prevChanges => addCdcChange(prevChanges, cdcChange));
            
            return updatedItem;
          }
          return item;
        });
        
        return updatedItems;
      });
    }
    setEditingItemId(null);
    setEditingName('');
  };

  const cancelEditing = () => {
    setEditingItemId(null);
    setEditingName('');
  };

  const handleEditKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEditing();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  // Sort and visible items based on status
  let sortedVisibleItems = items.filter(item => !item.deleted_at);
  if (sortDirection !== 'none') {
    sortedVisibleItems = sortedVisibleItems.sort((a, b) => {
      if (sortDirection === 'asc') {
        return (a.completed === b.completed) ? 0 : a.completed ? 1 : -1;
      } else {
        return (a.completed === b.completed) ? 0 : a.completed ? -1 : 1;
      }
    });
  }

  const completedCount = items.filter(item => item.completed && !item.deleted_at).length;
  const totalCount = items.filter(item => !item.deleted_at).length;
  const hasCompletedItems = completedCount > 0;
  const hasItems = totalCount > 0;

  // Determine status indicator properties
  const getStatusDetails = () => {
    if (syncStatus === 'syncing' || syncStatus === 'polling') {
      // Combined state for any database interaction (syncing or polling)
      return { color: 'bg-blue-500', label: 'Syncing', animate: true };
    } else if (syncStatus === 'pending' || (syncStatus === 'idle' && cdcChanges.length > 0)) {
      return { color: 'bg-amber-500', label: 'Modified', animate: syncStatus === 'pending' };
    } else {
      return { color: 'bg-green-500', label: 'Synced', animate: false };
    }
  };
  
  const { color, label, animate } = getStatusDetails();
  
  return (
    <Card className="w-full max-w-6xl mx-auto relative">
      {/* Status dot indicator */}
      <div 
        className="absolute top-3 right-3 z-10 group"
        onClick={syncStatus === 'idle' && cdcChanges.length > 0 ? syncNow : undefined}
        style={{ cursor: syncStatus === 'idle' && cdcChanges.length > 0 ? 'pointer' : 'default' }}
      >
        {/* For syncing state (both polling and syncing), we use a ping animation with an inner dot */}
        {syncStatus === 'polling' || syncStatus === 'syncing' ? (
          <div className="relative h-4 w-4">
            <div className="absolute inset-0 rounded-full bg-blue-500 opacity-70 animate-ping"></div>
            <div className="absolute inset-0 rounded-full bg-blue-500 shadow-md border border-white" title={label}></div>
          </div>
        ) : (
          <div 
            className={`h-4 w-4 rounded-full ${color} shadow-md border border-white ${animate ? 'animate-pulse' : ''}`}
            title={label}
          />
        )}
        
        {/* Tooltip on hover */}
        <div className="hidden group-hover:block absolute right-0 mt-1 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow-lg whitespace-nowrap transition-opacity z-20">
          {label}
        </div>
      </div>
      
      <CardHeader className="pb-3">
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Add Item Section */}
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Add an item..."
            className="flex-1 text-sm"
          />
          <Button onClick={addItem} size="icon" className="h-10 w-10">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Action Buttons */}
        {hasItems && (
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button 
              variant="outline" 
              onClick={clearCompleted}
              disabled={!hasCompletedItems}
              className="flex items-center gap-1 text-xs h-8 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
              size="sm"
            >
              <CheckCircle className="h-3 w-3" />
              Clear Completed ({completedCount})
            </Button>
            <Button 
              variant="outline" 
              onClick={clearAll}
              className="flex items-center gap-1 text-xs h-8 px-3 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              size="sm"
            >
              <Trash2 className="h-3 w-3" />
              Clear All
            </Button>
          </div>
        )}

        {/* Data Table */}
        <div className="overflow-x-auto rounded-md border text-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24 cursor-pointer px-2 py-2" onClick={handleSort}>
                  <div className="flex items-center gap-1 text-xs">
                    Status
                    <ArrowUpDown className="h-3 w-3" />
                    {sortDirection === 'asc' && <span className="text-xs">↑</span>}
                    {sortDirection === 'desc' && <span className="text-xs">↓</span>}
                  </div>
                </TableHead>
                <TableHead className="px-2 py-2 text-xs">Item Name</TableHead>
                <TableHead className="w-20 px-2 py-2 text-center text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedVisibleItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-6 text-gray-500 text-sm">
                    Your shopping list is empty. Add some items above!
                  </TableCell>
                </TableRow>
              ) : (
                sortedVisibleItems.map((item) => (
                  <TableRow 
                    key={item.id}
                    className={item.completed ? 'bg-green-50' : ''}
                  >
                    <TableCell className="px-2 py-2">
                      <div 
                        className="flex justify-center cursor-pointer hover:bg-gray-100 rounded transition-colors p-1"
                        onClick={() => toggleItem(item.id)}
                        title="Click to toggle status"
                      >
                        {item.completed ? (
                          <CircleCheckBig className="h-5 w-5 text-green-400" />
                        ) : (
                          <Circle className="h-5 w-5 text-gray-300" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {editingItemId === item.id ? (
                        <Input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={handleEditKeyPress}
                          onBlur={saveEditing}
                          autoFocus
                          className={`text-sm h-7 ${
                            item.completed ? 'line-through text-gray-500' : 'text-gray-900'
                          }`}
                        />
                      ) : (
                        <div 
                          className={`text-sm cursor-pointer px-2 py-1 rounded hover:bg-gray-100 transition-colors ${
                            item.completed ? 'line-through text-gray-500' : 'text-gray-900'
                          }`}
                          onClick={() => startEditing(item)}
                          title="Click to edit"
                        >
                          {item.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(item.id)}
                          className="text-xs h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                          title="Delete item"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary */}
        {hasItems && (
          <div className="text-xs text-gray-600 text-center px-2">
            {totalCount} items • {completedCount} completed • {totalCount - completedCount} pending
            {sortDirection !== 'none' && ` • Sorted by status ${sortDirection === 'asc' ? '(Pending → Completed)' : '(Completed → Pending)'}`}
            <div className="text-xs text-blue-600 mt-1">
              💡 Click on item names to edit them • Click on status icons to toggle completion
            </div>
          </div>
        )}
        
        {/* No detailed footer - status is shown with the dot */}
      </CardContent>
    </Card>
  );
};

export default ShoppingList;