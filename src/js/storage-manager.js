/**
 * Storage Manager - Handles localStorage and cookies for user progress
 * Only stores reading progress and preferences, NOT manga data
 */

class StorageManager {
    constructor() {
        this.STORAGE_PREFIX = 'manga_reader_';
        this.PROGRESS_KEY = this.STORAGE_PREFIX + 'progress';
        this.SETTINGS_KEY = this.STORAGE_PREFIX + 'settings';
        this.RECENT_SERIES_KEY = this.STORAGE_PREFIX + 'recent_series';
        this.CURRENT_SERIES_COOKIE = 'current_manga_series';
        
        this.defaultSettings = {
            readingDirection: 'ltr',
            translationStyle: 'overlay',
            translationOpacity: 80,
            textSize: 16,
            fitToWidth: true,
            hideUI: false
        };
        
        this.init();
    }

    /**
     * Initialize storage manager
     */
    init() {
        try {
            // Test localStorage availability
            const test = 'test_storage';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
        } catch (e) {
            console.warn('localStorage not available, using memory storage');
            this.useMemoryStorage = true;
            this.memoryStorage = {};
        }
        
        // Load existing settings
        this.settings = this.getSettings();
    }

    // ==========================================================================
    // Progress Management
    // ==========================================================================

    /**
     * Save reading progress for a series
     */
    saveProgress(seriesName, progressData) {
        if (!seriesName || !progressData) {
            console.warn('Invalid progress data');
            return false;
        }

        try {
            const progress = this.getAllProgress();
            const sanitizedName = StringUtils.sanitize(seriesName);
            
            progress[sanitizedName] = {
                originalName: seriesName,
                currentPage: parseInt(progressData.currentPage || 0),
                totalPages: parseInt(progressData.totalPages || 0),
                lastRead: progressData.lastRead || Date.now(),
                percentage: progressData.totalPages > 0 ? 
                    Math.round((progressData.currentPage / progressData.totalPages) * 100) : 0
            };
            
            this.setItem(this.PROGRESS_KEY, JSON.stringify(progress));
            
            // Update current series cookie
            this.setCurrentSeries(seriesName);
            
            return true;
        } catch (error) {
            console.error('Error saving progress:', error);
            return false;
        }
    }

    /**
     * Get reading progress for a specific series
     */
    getProgress(seriesName) {
        if (!seriesName) return null;
        
        try {
            const progress = this.getAllProgress();
            const sanitizedName = StringUtils.sanitize(seriesName);
            return progress[sanitizedName] || null;
        } catch (error) {
            console.error('Error getting progress:', error);
            return null;
        }
    }

    /**
     * Get all reading progress data
     */
    getAllProgress() {
        try {
            const data = this.getItem(this.PROGRESS_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error getting all progress:', error);
            return {};
        }
    }

    /**
     * Remove progress for a series
     */
    removeProgress(seriesName) {
        if (!seriesName) return false;
        
        try {
            const progress = this.getAllProgress();
            const sanitizedName = StringUtils.sanitize(seriesName);
            
            if (progress[sanitizedName]) {
                delete progress[sanitizedName];
                this.setItem(this.PROGRESS_KEY, JSON.stringify(progress));
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error removing progress:', error);
            return false;
        }
    }

    /**
     * Get recent series (sorted by last read time)
     */
    getRecentSeries(limit = 10) {
        try {
            const progress = this.getAllProgress();
            const series = Object.values(progress);
            
            // Sort by last read time (most recent first)
            series.sort((a, b) => b.lastRead - a.lastRead);
            
            return series.slice(0, limit);
        } catch (error) {
            console.error('Error getting recent series:', error);
            return [];
        }
    }

    // ==========================================================================
    // Settings Management
    // ==========================================================================

    /**
     * Get user settings
     */
    getSettings() {
        try {
            const data = this.getItem(this.SETTINGS_KEY);
            const savedSettings = data ? JSON.parse(data) : {};
            
            // Merge with defaults
            return { ...this.defaultSettings, ...savedSettings };
        } catch (error) {
            console.error('Error getting settings:', error);
            return this.defaultSettings;
        }
    }

    /**
     * Save user settings
     */
    saveSettings(settings) {
        if (!settings || typeof settings !== 'object') {
            console.warn('Invalid settings data');
            return false;
        }

        try {
            const newSettings = { ...this.settings, ...settings };
            this.settings = newSettings;
            this.setItem(this.SETTINGS_KEY, JSON.stringify(newSettings));
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    /**
     * Get a specific setting value
     */
    getSetting(key, defaultValue = null) {
        return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
    }

    /**
     * Set a specific setting value
     */
    setSetting(key, value) {
        if (key && value !== undefined) {
            this.settings[key] = value;
            return this.saveSettings({ [key]: value });
        }
        return false;
    }

    // ==========================================================================
    // Cookie Management (for current series)
    // ==========================================================================

    /**
     * Set current series in cookie
     */
    setCurrentSeries(seriesName) {
        if (!seriesName) return false;
        
        try {
            const expires = new Date();
            expires.setTime(expires.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
            
            document.cookie = `${this.CURRENT_SERIES_COOKIE}=${encodeURIComponent(seriesName)}; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
            return true;
        } catch (error) {
            console.error('Error setting current series cookie:', error);
            return false;
        }
    }

    /**
     * Get current series from cookie
     */
    getCurrentSeries() {
        try {
            const cookies = document.cookie.split(';');
            
            for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === this.CURRENT_SERIES_COOKIE) {
                    return decodeURIComponent(value);
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error getting current series cookie:', error);
            return null;
        }
    }

    /**
     * Clear current series cookie
     */
    clearCurrentSeries() {
        try {
            document.cookie = `${this.CURRENT_SERIES_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            return true;
        } catch (error) {
            console.error('Error clearing current series cookie:', error);
            return false;
        }
    }

    // ==========================================================================
    // Data Management
    // ==========================================================================

    /**
     * Clear all stored data
     */
    clearAll() {
        try {
            this.removeItem(this.PROGRESS_KEY);
            this.removeItem(this.SETTINGS_KEY);
            this.clearCurrentSeries();
            
            if (this.useMemoryStorage) {
                this.memoryStorage = {};
            }
            
            this.settings = this.defaultSettings;
            return true;
        } catch (error) {
            console.error('Error clearing all data:', error);
            return false;
        }
    }

    /**
     * Export user data for backup
     */
    exportData() {
        try {
            return {
                progress: this.getAllProgress(),
                settings: this.getSettings(),
                currentSeries: this.getCurrentSeries(),
                exportDate: Date.now(),
                version: '1.0'
            };
        } catch (error) {
            console.error('Error exporting data:', error);
            return null;
        }
    }

    /**
     * Import user data from backup
     */
    importData(data) {
        if (!data || typeof data !== 'object') {
            console.warn('Invalid import data');
            return false;
        }

        try {
            // Import progress
            if (data.progress && typeof data.progress === 'object') {
                this.setItem(this.PROGRESS_KEY, JSON.stringify(data.progress));
            }
            
            // Import settings
            if (data.settings && typeof data.settings === 'object') {
                this.saveSettings(data.settings);
            }
            
            // Import current series
            if (data.currentSeries) {
                this.setCurrentSeries(data.currentSeries);
            }
            
            return true;
        } catch (error) {
            console.error('Error importing data:', error);
            return false;
        }
    }

    // ==========================================================================
    // Storage Abstraction (handles localStorage fallback)
    // ==========================================================================

    /**
     * Get item from storage
     */
    getItem(key) {
        if (this.useMemoryStorage) {
            return this.memoryStorage[key] || null;
        }
        
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.error('Error accessing localStorage:', error);
            return null;
        }
    }

    /**
     * Set item in storage
     */
    setItem(key, value) {
        if (this.useMemoryStorage) {
            this.memoryStorage[key] = value;
            return true;
        }
        
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.error('Error writing to localStorage:', error);
            // Fallback to memory storage
            if (!this.memoryStorage) this.memoryStorage = {};
            this.memoryStorage[key] = value;
            return true;
        }
    }

    /**
     * Remove item from storage
     */
    removeItem(key) {
        if (this.useMemoryStorage) {
            delete this.memoryStorage[key];
            return true;
        }
        
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error removing from localStorage:', error);
            return false;
        }
    }

    // ==========================================================================
    // Recent Series Management
    // ==========================================================================

    /**
     * Add series to recent list
     */
    addRecentSeries(seriesName, stats) {
        if (!seriesName) return false;

        try {
            const recentSeries = this.getRecentSeries();
            const sanitizedName = StringUtils.sanitize(seriesName);

            // Remove if already exists (to move to top)
            const existingIndex = recentSeries.findIndex(s => s.id === sanitizedName);
            if (existingIndex !== -1) {
                recentSeries.splice(existingIndex, 1);
            }

            // Add to beginning
            recentSeries.unshift({
                id: sanitizedName,
                name: seriesName,
                stats: stats,
                addedDate: Date.now()
            });

            // Keep only last 10 series
            const maxRecent = 10;
            if (recentSeries.length > maxRecent) {
                recentSeries.splice(maxRecent);
            }

            this.setItem(this.RECENT_SERIES_KEY, JSON.stringify(recentSeries));
            return true;
        } catch (error) {
            console.error('Error adding recent series:', error);
            return false;
        }
    }

    /**
     * Get recent series list
     */
    getRecentSeries() {
        try {
            const data = this.getItem(this.RECENT_SERIES_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error getting recent series:', error);
            return [];
        }
    }

    /**
     * Remove series from recent list
     */
    removeRecentSeries(seriesName) {
        if (!seriesName) return false;

        try {
            const recentSeries = this.getRecentSeries();
            const sanitizedName = StringUtils.sanitize(seriesName);
            const filteredSeries = recentSeries.filter(s => s.id !== sanitizedName);

            this.setItem(this.RECENT_SERIES_KEY, JSON.stringify(filteredSeries));
            return true;
        } catch (error) {
            console.error('Error removing recent series:', error);
            return false;
        }
    }

    /**
     * Clear all recent series
     */
    clearRecentSeries() {
        try {
            this.removeItem(this.RECENT_SERIES_KEY);
            return true;
        } catch (error) {
            console.error('Error clearing recent series:', error);
            return false;
        }
    }

    // ==========================================================================
    // Storage Information
    // ==========================================================================

    /**
     * Get storage usage information
     */
    getStorageInfo() {
        if (this.useMemoryStorage) {
            const memorySize = JSON.stringify(this.memoryStorage).length;
            return {
                type: 'memory',
                used: memorySize,
                available: 'unlimited',
                percentage: 0
            };
        }

        try {
            let totalSize = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key) && key.startsWith(this.STORAGE_PREFIX)) {
                    totalSize += localStorage[key].length;
                }
            }

            return {
                type: 'localStorage',
                used: totalSize,
                available: 'varies by browser',
                percentage: 'unknown'
            };
        } catch (error) {
            console.error('Error getting storage info:', error);
            return {
                type: 'unknown',
                used: 0,
                available: 0,
                percentage: 0
            };
        }
    }
}

// Create global instance
const storageManager = new StorageManager();

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
