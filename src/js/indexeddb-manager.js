/**
 * IndexedDB Manager - Handles large file storage for manga data
 * Used for storing image blobs that are too large for sessionStorage
 */

class IndexedDBManager {
    constructor() {
        this.dbName = 'MangaReader';
        this.version = 1;
        this.db = null;
        this.storeName = 'mangaSeries';
    }

    /**
     * Initialize IndexedDB
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store for manga series
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'name' });
                    store.createIndex('uploadDate', 'uploadDate', { unique: false });
                }
            };
        });
    }

    /**
     * Store manga series data
     */
    async storeSeries(name, files) {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const seriesData = {
                name: name,
                files: files,
                uploadDate: Date.now(),
                expiresAt: Date.now() + (24 * 60 * 60 * 1000) // Expire after 24 hours
            };
            
            console.log(`Storing series "${name}" in IndexedDB with data:`, {
                images: files?.images?.length,
                matched: files?.matched?.length,
                size: JSON.stringify(seriesData).length
            });
            
            const request = store.put(seriesData);
            
            request.onsuccess = () => {
                console.log(`Series "${name}" stored successfully in IndexedDB`);
                // Don't resolve immediately, wait for transaction to complete
            };
            
            request.onerror = () => {
                console.error('Failed to store series:', request.error);
                reject(request.error);
            };
            
            // Wait for the entire transaction to complete
            transaction.oncomplete = () => {
                console.log(`Transaction completed for series "${name}"`);
                resolve();
            };
            
            transaction.onerror = () => {
                console.error('Transaction failed:', transaction.error);
                reject(transaction.error);
            };
        });
    }

    /**
     * Retrieve manga series data
     */
    async getSeries(name) {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(name);
            
            request.onsuccess = () => {
                const result = request.result;
                
                console.log(`IndexedDB lookup for "${name}":`, result ? 'found' : 'not found');
                
                if (result) {
                    // Check if data has expired
                    if (result.expiresAt < Date.now()) {
                        console.log(`Series "${name}" has expired, removing...`);
                        this.deleteSeries(name);
                        resolve(null);
                        return;
                    }
                    
                    console.log(`Series "${name}" retrieved from IndexedDB`, {
                        images: result.files?.images?.length,
                        matched: result.files?.matched?.length
                    });
                    resolve(result);
                } else {
                    console.log(`Series "${name}" not found in IndexedDB`);
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                console.error('Failed to retrieve series:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Delete manga series data
     */
    async deleteSeries(name) {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(name);
            
            request.onsuccess = () => {
                console.log(`Series "${name}" deleted from IndexedDB`);
                resolve();
            };
            
            request.onerror = () => {
                console.error('Failed to delete series:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Clean up expired series
     */
    async cleanupExpired() {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.openCursor();
            
            const now = Date.now();
            let deletedCount = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                
                if (cursor) {
                    const series = cursor.value;
                    
                    if (series.expiresAt < now) {
                        cursor.delete();
                        deletedCount++;
                    }
                    
                    cursor.continue();
                } else {
                    if (deletedCount > 0) {
                        console.log(`Cleaned up ${deletedCount} expired series`);
                    }
                    resolve(deletedCount);
                }
            };
            
            request.onerror = () => {
                console.error('Failed to cleanup expired series:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get storage usage information
     */
    async getStorageInfo() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return { available: 'unknown', used: 'unknown' };
        }

        try {
            const estimate = await navigator.storage.estimate();
            return {
                available: estimate.quota,
                used: estimate.usage,
                percentage: estimate.quota ? Math.round((estimate.usage / estimate.quota) * 100) : 0
            };
        } catch (error) {
            console.error('Failed to get storage estimate:', error);
            return { available: 'unknown', used: 'unknown' };
        }
    }

    /**
     * List all stored series (for debugging)
     */
    async listAllSeries() {
        if (!this.db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAllKeys();
            
            request.onsuccess = () => {
                console.log('All stored series keys:', request.result);
                resolve(request.result);
            };
            
            request.onerror = () => {
                console.error('Failed to list series:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Check if IndexedDB is supported
     */
    static isSupported() {
        return 'indexedDB' in window;
    }
}

// Create global instance
const indexedDBManager = new IndexedDBManager();

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IndexedDBManager;
}
