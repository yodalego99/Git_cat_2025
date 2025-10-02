/**
 * Main Application - Handles UI interactions and coordinates other modules
 */

class MangaReaderApp {
    constructor() {
        this.initialized = false;
        this.currentSeriesData = null;
        this.elements = {};
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            this.cacheElements();
            this.setupEventListeners();
            
            // Initialize IndexedDB early
            console.log('Initializing IndexedDB...');
            await indexedDBManager.init();
            console.log('IndexedDB initialized successfully');
            
            this.loadRecentSeries();
            this.checkCurrentSeries();
            this.initialized = true;
            
            console.log('Manga Reader App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            ErrorHandler.show('Failed to initialize application');
        }
    }

    /**
     * Cache DOM elements for performance
     */
    cacheElements() {
        this.elements = {
            // Upload elements
            uploadArea: DOM.get('upload-area'),
            fileInput: DOM.get('file-input'),
            browseBtn: DOM.get('browse-btn'),
            
            // Progress elements
            progressSection: DOM.get('progress-section'),
            progressFill: DOM.get('progress-fill'),
            progressText: DOM.get('progress-text'),
            
            // Series setup elements
            seriesSetup: DOM.get('series-setup'),
            seriesName: DOM.get('series-name'),
            seriesInfo: DOM.get('series-info'),
            startReadingBtn: DOM.get('start-reading-btn'),
            
            // Recent series elements
            recentSection: DOM.get('recent-section'),
            recentList: DOM.get('recent-list')
        };

        // Validate critical elements
        const criticalElements = ['uploadArea', 'fileInput', 'browseBtn'];
        for (const key of criticalElements) {
            if (!this.elements[key]) {
                throw new Error(`Critical element missing: ${key}`);
            }
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // File upload events
        EventUtils.on(this.elements.browseBtn, 'click', () => {
            this.elements.fileInput.click();
        });

        EventUtils.on(this.elements.fileInput, 'change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelection(e.target.files[0]);
            }
        });

        // Drag and drop events
        EventUtils.on(this.elements.uploadArea, 'dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            DOM.addClass(this.elements.uploadArea, 'dragover');
        });

        EventUtils.on(this.elements.uploadArea, 'dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            DOM.removeClass(this.elements.uploadArea, 'dragover');
        });

        EventUtils.on(this.elements.uploadArea, 'drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            DOM.removeClass(this.elements.uploadArea, 'dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelection(files[0]);
            }
        });

        // Series setup events
        if (this.elements.seriesName) {
            EventUtils.on(this.elements.seriesName, 'input', 
                EventUtils.debounce(() => this.validateSeriesName(), 300)
            );

            EventUtils.on(this.elements.seriesName, 'keypress', (e) => {
                if (e.key === 'Enter') {
                    this.startReading();
                }
            });
        }

        if (this.elements.startReadingBtn) {
            EventUtils.on(this.elements.startReadingBtn, 'click', () => {
                this.startReading();
            });
        }

        // Prevent default file drag behaviors on document
        EventUtils.on(document, 'dragover', (e) => e.preventDefault());
        EventUtils.on(document, 'drop', (e) => e.preventDefault());
    }

    // ==========================================================================
    // File Upload Handling
    // ==========================================================================

    /**
     * Handle file selection (drag & drop or browse)
     */
    async handleFileSelection(file) {
        if (!file) return;

        // Clear previous errors
        ErrorHandler.clear();

        try {
            // Show progress and hide upload area
            DOM.toggle(this.elements.uploadArea, false);
            DOM.toggle(this.elements.seriesSetup, false);
            Progress.show('Preparing to process file...');

            // Process the ZIP file
            const result = await fileManager.processZipFile(file, (progress, message) => {
                Progress.update(progress, message);
            });

            if (result.success) {
                this.currentSeriesData = result;
                this.showSeriesSetup(result);
            } else {
                throw new Error('Failed to process ZIP file');
            }

        } catch (error) {
            console.error('File processing error:', error);
            ErrorHandler.show(error.message || 'Failed to process file');
            this.resetUploadUI();
        }
    }

    /**
     * Show series setup UI after successful file processing
     */
    showSeriesSetup(result) {
        try {
            // Hide progress
            Progress.hide();

            // Populate series info
            this.updateSeriesInfo(result);

            // Show series setup
            DOM.toggle(this.elements.seriesSetup, true);

            // Focus on series name input
            if (this.elements.seriesName) {
                this.elements.seriesName.focus();
                
                // Suggest a default name based on filename
                if (!this.elements.seriesName.value) {
                    const defaultName = this.suggestSeriesName();
                    this.elements.seriesName.value = defaultName;
                    this.validateSeriesName();
                }
            }

            // Smooth scroll to series setup
            Animation.scrollTo(this.elements.seriesSetup, 100);

        } catch (error) {
            console.error('Error showing series setup:', error);
            ErrorHandler.show('Error displaying series information');
            this.resetUploadUI();
        }
    }

    /**
     * Update series information display
     */
    updateSeriesInfo(result) {
        if (!this.elements.seriesInfo || !result.stats) return;

        const stats = result.stats;
        const validation = fileManager.validateFileStructure();

        const infoHTML = `
            <h4>📊 File Information</h4>
            <div class="series-info-grid">
                <div class="info-item">
                    <span class="info-label">Total Pages:</span>
                    <span class="info-value">${stats.imageCount}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Translations Found:</span>
                    <span class="info-value">${stats.translationCount}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Translation Coverage:</span>
                    <span class="info-value">${validation.stats?.translationCoverage || 0}%</span>
                </div>
                <div class="info-item">
                    <span class="info-label">File Size:</span>
                    <span class="info-value">${FileUtils.formatSize(stats.totalSize)}</span>
                </div>
            </div>
            ${!validation.hasTranslations ? 
                '<p style="color: var(--accent-color); margin-top: 12px;">⚠️ No translations found. Pages will display without overlay.</p>' : 
                ''
            }
        `;

        DOM.setHTML(this.elements.seriesInfo, infoHTML);
    }

    /**
     * Suggest a series name based on file structure
     */
    suggestSeriesName() {
        if (!this.currentSeriesData?.images?.length) return '';

        // Try to extract a common pattern from filenames
        const firstImage = this.currentSeriesData.images[0].filename;
        const baseName = FileUtils.getBaseName(firstImage);
        
        // Remove common patterns like page numbers
        const cleanName = baseName
            .replace(/[_\-\s]*(?:page|pg|p|ch|chapter|vol|volume)[_\-\s]*\d+/gi, '')
            .replace(/[_\-\s]*\d+$/g, '')
            .replace(/[_\-\s]+/g, ' ')
            .trim();

        return cleanName || 'My Manga Series';
    }

    // ==========================================================================
    // Series Management
    // ==========================================================================

    /**
     * Validate series name input
     */
    validateSeriesName() {
        if (!this.elements.seriesName || !this.elements.startReadingBtn) return;

        const name = this.elements.seriesName.value;
        const validation = Validation.seriesName(name);

        // Update button state
        this.elements.startReadingBtn.disabled = !validation.valid;

        // Show validation feedback
        if (name && !validation.valid) {
            this.elements.seriesName.style.borderColor = 'var(--error-color)';
            this.elements.seriesName.title = validation.error;
        } else {
            this.elements.seriesName.style.borderColor = '';
            this.elements.seriesName.title = '';
        }

        return validation;
    }

    /**
     * Start reading with current series data
     */
    async startReading() {
        if (!this.currentSeriesData) {
            ErrorHandler.show('No manga data available');
            return;
        }

        const validation = this.validateSeriesName();
        if (!validation.valid) {
            ErrorHandler.show(validation.error);
            return;
        }

        try {
            const seriesName = validation.value;
            
            // Save initial progress
            storageManager.saveProgress(seriesName, {
                currentPage: 0,
                totalPages: this.currentSeriesData.stats.imageCount,
                lastRead: Date.now()
            });
            
            // Add to recent series
            storageManager.addRecentSeries(seriesName, this.currentSeriesData.stats);
            
            // Store in IndexedDB
            Progress.show('Storing manga data...');
            console.log('About to store series in IndexedDB:', seriesName);
            console.log('Current series data structure:', {
                hasImages: !!this.currentSeriesData.images,
                hasTranslations: !!this.currentSeriesData.translations,
                hasMatched: !!this.currentSeriesData.matched,
                imageCount: this.currentSeriesData.images?.length,
                matchedCount: this.currentSeriesData.matched?.length,
                statsImageCount: this.currentSeriesData.stats?.imageCount
            });
            
            await indexedDBManager.storeSeries(seriesName, this.currentSeriesData);
            console.log('Series stored successfully, waiting before navigation...');
            
            Progress.hide();
            
            // Wait a moment to ensure IndexedDB transaction completes
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Navigate to reader
            window.location.href = `reader.html?series=${encodeURIComponent(seriesName)}`;

        } catch (error) {
            Progress.hide();
            console.error('Error starting reading session:', error);
            ErrorHandler.show('Failed to start reading session: ' + error.message);
        }
    }

    // ==========================================================================
    // Recent Series Management
    // ==========================================================================

    /**
     * Debug function to check IndexedDB contents
     */
    async debugIndexedDB() {
        try {
            console.log('=== IndexedDB Debug Info ===');
            await indexedDBManager.init();
            const allSeries = await indexedDBManager.listAllSeries();
            console.log('All series keys:', allSeries);
            
            for (const seriesName of allSeries) {
                const data = await indexedDBManager.getSeries(seriesName);
                console.log(`Series "${seriesName}":`, {
                    hasFiles: !!data?.files,
                    hasDirectData: !!(data?.images || data?.matched),
                    structure: Object.keys(data || {}),
                    filesStructure: data?.files ? Object.keys(data.files) : 'N/A',
                    imageCount: data?.files?.images?.length || data?.images?.length || 0,
                    matchedCount: data?.files?.matched?.length || data?.matched?.length || 0
                });
            }
        } catch (error) {
            console.error('IndexedDB debug error:', error);
        }
    }

    /**
     * Load and display recent series
     */
    loadRecentSeries() {
        if (!this.elements.recentList) return;

        try {
            const recentSeries = storageManager.getRecentSeries();
            
            if (recentSeries.length === 0) {
                this.showNoRecentSeries();
                return;
            }

            const recentHTML = recentSeries.slice(0, 6).map(series => {
                // Get progress data for this series
                const progress = storageManager.getProgress(series.name);
                const stats = series.stats || {};
                
                return `
                <div class="recent-item" data-series="${series.name}">
                    <h3>${StringUtils.truncate(series.name, 30)}</h3>
                    <div class="recent-meta">
                        <span>📖 ${stats.imageCount || 0} pages</span>
                        <span>${StringUtils.formatDate(series.addedDate)}</span>
                    </div>
                    <div class="recent-progress">
                        ${progress ? `Page ${progress.currentPage + 1}/${progress.totalPages} (${progress.percentage}%)` : 'Not started'}
                    </div>
                </div>
                `;
            }).join('');

            DOM.setHTML(this.elements.recentList, recentHTML);

            // Add click handlers to recent items
            const recentItems = this.elements.recentList.querySelectorAll('.recent-item');
            recentItems.forEach(item => {
                EventUtils.on(item, 'click', () => {
                    const seriesName = item.dataset.series;
                    this.promptReupload(seriesName);
                });
            });

        } catch (error) {
            console.error('Error loading recent series:', error);
            this.showNoRecentSeries();
        }
    }

    /**
     * Show no recent series message
     */
    showNoRecentSeries() {
        const noRecentHTML = `
            <div class="no-recent">
                <p>No recent manga series found.</p>
                <p>Upload a ZIP file to get started!</p>
            </div>
        `;
        DOM.setHTML(this.elements.recentList, noRecentHTML);
    }

    /**
     * Prompt user to re-upload files for a series
     */
    promptReupload(seriesName) {
        const progress = storageManager.getProgress(seriesName);
        if (!progress) return;

        const message = `
            Continue reading "${seriesName}"?
            
            You were on page ${progress.currentPage + 1} of ${progress.totalPages}.
            You'll need to upload the same ZIP file again to continue.
        `;

        if (confirm(message)) {
            // Pre-fill the series name
            if (this.elements.seriesName) {
                this.elements.seriesName.value = seriesName;
            }
            
            // Scroll to upload area
            Animation.scrollTo(this.elements.uploadArea, 100);
        }
    }

    /**
     * Check if user has a current series from cookies
     */
    checkCurrentSeries() {
        const currentSeries = storageManager.getCurrentSeries();
        if (currentSeries && this.elements.seriesName && !this.elements.seriesName.value) {
            this.elements.seriesName.value = currentSeries;
        }
    }

    // ==========================================================================
    // UI State Management
    // ==========================================================================

    /**
     * Reset upload UI to initial state
     */
    resetUploadUI() {
        try {
            Progress.hide();
            DOM.toggle(this.elements.uploadArea, true);
            DOM.toggle(this.elements.seriesSetup, false);
            
            // Clear file input
            if (this.elements.fileInput) {
                this.elements.fileInput.value = '';
            }
            
            // Clear current data
            this.currentSeriesData = null;
            fileManager.clear();
            
        } catch (error) {
            console.error('Error resetting UI:', error);
        }
    }

    /**
     * Show application info
     */
    showAppInfo() {
        const info = `
            Manga Translation Reader v1.0
            
            Features:
            • Upload ZIP files with manga + translations
            • Mobile-friendly reading interface  
            • Translation overlay toggle
            • Progress tracking across sessions
            • Privacy-focused (files stay on your device)
            
            Storage: ${storageManager.getStorageInfo().type}
            Files processed: ${fileManager.getStats().imageCount} images
        `;
        
        alert(info);
    }
}

// ==========================================================================
// Application Initialization
// ==========================================================================

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

function initializeApp() {
    (async () => {
        try {
            // Check for required dependencies
            if (typeof JSZip === 'undefined') {
                throw new Error('JSZip library not loaded');
            }
            
            // Create global app instance
            window.mangaReaderApp = new MangaReaderApp();
            await window.mangaReaderApp.init();
            
            // Add global error handler
            window.addEventListener('error', (event) => {
                console.error('Global error:', event.error);
                ErrorHandler.handle(event.error, 'An unexpected error occurred');
            });
            
            // Add unhandled promise rejection handler
            window.addEventListener('unhandledrejection', (event) => {
                console.error('Unhandled promise rejection:', event.reason);
                ErrorHandler.handle(event.reason, 'An unexpected error occurred');
            });
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            document.body.innerHTML = `
                <div style="text-align: center; padding: 50px; color: #f44336;">
                    <h1>❌ Application Error</h1>
                    <p>Failed to initialize the manga reader.</p>
                    <p>Please refresh the page or check your browser console.</p>
                    <p><small>Error: ${error.message}</small></p>
                </div>
            `;
        }
    })();
}
