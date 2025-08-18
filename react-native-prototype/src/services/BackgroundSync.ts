// Background sync service for React Native
import BackgroundJob from 'react-native-background-job';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SyncQueueItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retryCount: number;
}

class BackgroundSyncService {
  private static instance: BackgroundSyncService;
  private isRunning = false;
  private syncInterval: NodeJS.Timeout | null = null;

  static getInstance(): BackgroundSyncService {
    if (!BackgroundSyncService.instance) {
      BackgroundSyncService.instance = new BackgroundSyncService();
    }
    return BackgroundSyncService.instance;
  }

  async init(): Promise<void> {
    console.log('BackgroundSyncService initialized');
    
    // Start background job for periodic sync
    this.startBackgroundSync();
  }

  private startBackgroundSync(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    
    // Configure background job
    BackgroundJob.on('background', () => {
      console.log('App went to background, starting sync job');
      this.performBackgroundSync();
    });

    BackgroundJob.on('foreground', () => {
      console.log('App came to foreground, syncing immediately');
      this.syncNow();
    });

    // Periodic sync when app is active
    this.syncInterval = setInterval(() => {
      this.syncNow();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private async performBackgroundSync(): Promise<void> {
    try {
      console.log('Performing background sync...');
      
      // Get pending sync items
      const pendingItems = await this.getPendingSyncItems();
      
      if (pendingItems.length === 0) {
        console.log('No pending sync items');
        return;
      }

      // Process items with timeout for background execution
      const syncPromise = this.processSyncItems(pendingItems);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Background sync timeout')), 25000)
      );

      await Promise.race([syncPromise, timeoutPromise]);
      console.log('Background sync completed');
      
    } catch (error) {
      console.error('Background sync failed:', error);
    }
  }

  async syncNow(): Promise<void> {
    try {
      const pendingItems = await this.getPendingSyncItems();
      if (pendingItems.length > 0) {
        await this.processSyncItems(pendingItems);
      }
    } catch (error) {
      console.error('Immediate sync failed:', error);
    }
  }

  private async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    try {
      const queueData = await AsyncStorage.getItem('sync_queue');
      return queueData ? JSON.parse(queueData) : [];
    } catch (error) {
      console.error('Failed to get pending sync items:', error);
      return [];
    }
  }

  private async processSyncItems(items: SyncQueueItem[]): Promise<void> {
    const processed: string[] = [];
    
    for (const item of items) {
      try {
        await this.syncItem(item);
        processed.push(item.id);
      } catch (error) {
        console.error(`Failed to sync item ${item.id}:`, error);
        
        // Increment retry count
        item.retryCount += 1;
        
        // Remove items that have failed too many times
        if (item.retryCount > 5) {
          processed.push(item.id);
          console.warn(`Removing item ${item.id} after 5 failed attempts`);
        }
      }
    }

    // Remove processed items from queue
    if (processed.length > 0) {
      const remainingItems = items.filter(item => !processed.includes(item.id));
      await AsyncStorage.setItem('sync_queue', JSON.stringify(remainingItems));
    }
  }

  private async syncItem(item: SyncQueueItem): Promise<void> {
    // This would integrate with your Firebase sync logic
    console.log(`Syncing item ${item.id} of type ${item.type}`);
    
    switch (item.type) {
      case 'create':
        // await firebaseService.createSession(item.data);
        break;
      case 'update':
        // await firebaseService.updateSession(item.data.id, item.data);
        break;
      case 'delete':
        // await firebaseService.deleteSession(item.data.id);
        break;
    }
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async addToSyncQueue(type: 'create' | 'update' | 'delete', data: any): Promise<void> {
    try {
      const queueItems = await this.getPendingSyncItems();
      
      const newItem: SyncQueueItem = {
        id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        data,
        timestamp: Date.now(),
        retryCount: 0,
      };

      queueItems.push(newItem);
      await AsyncStorage.setItem('sync_queue', JSON.stringify(queueItems));
      
      console.log(`Added ${type} operation to sync queue`);
      
      // Try immediate sync if online
      this.syncNow();
      
    } catch (error) {
      console.error('Failed to add item to sync queue:', error);
    }
  }

  async getSyncStatus(): Promise<{
    pendingCount: number;
    lastSyncTime?: number;
    isOnline: boolean;
  }> {
    try {
      const pendingItems = await this.getPendingSyncItems();
      const lastSync = await AsyncStorage.getItem('last_sync_time');
      
      return {
        pendingCount: pendingItems.length,
        lastSyncTime: lastSync ? parseInt(lastSync) : undefined,
        isOnline: true, // Would check actual network status
      };
    } catch (error) {
      return {
        pendingCount: 0,
        isOnline: false,
      };
    }
  }

  async clearSyncQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem('sync_queue');
      console.log('Sync queue cleared');
    } catch (error) {
      console.error('Failed to clear sync queue:', error);
    }
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    BackgroundJob.stop();
    this.isRunning = false;
    console.log('BackgroundSyncService stopped');
  }
}

export default BackgroundSyncService;
