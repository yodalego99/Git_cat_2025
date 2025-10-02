/**
 * Manga Reader - Core reading interface with translation overlays
 * Handles page navigation, translation display, and reading settings
 */

class MangaReader {
    constructor() {
        this.files = null;
        this.currentPage = 0;
        this.seriesName = '';
        this.isOverlayVisible = false;
        this.settings = {
            readingDirection: 'ltr',
            translationStyle: 'overlay',
            translationOpacity: 80,
            textSize: 16,
            fitToWidth: true,
            hideUI: false
        };
        
        // UI state
        this.isUIVisible = true;
        this.hideUITimer = null;
        
        // Pan/zoom state
        this.isPanning = false;
        this.isZoomed = false;
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        
        // Touch handling
        this.lastTap = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        
        this.initElements();

        // Overlap separation state
        this.separationEnabled = false;
        this._originalPositions = new Map(); // element -> {left, top}
    }

    // ==========================================================================
    // Initialization
    // ==========================================================================

    initElements() {
        // Header elements
        this.readerHeader = DOM.get('readerHeader');
        this.backBtn = DOM.get('backBtn');
        this.seriesTitle = DOM.get('seriesTitle');
        this.currentPageEl = DOM.get('currentPage');
        this.totalPagesEl = DOM.get('totalPages');
        this.overlayToggle = DOM.get('overlayToggle');
        this.settingsBtn = DOM.get('settingsBtn');
        
        // Reader elements
        this.readerContainer = DOM.get('readerContainer');
        this.pageContainer = DOM.get('pageContainer');
        this.pageImage = DOM.get('pageImage');
        this.translationOverlay = DOM.get('translationOverlay');
        this.pageLoading = DOM.get('pageLoading');
        this.noTranslation = DOM.get('noTranslation');
        
        // Navigation elements
        this.navLeft = DOM.get('navLeft');
        this.navRight = DOM.get('navRight');
        this.prevBtn = DOM.get('prevBtn');
        this.nextBtn = DOM.get('nextBtn');
        this.pageSlider = DOM.get('pageSlider');
    this.separateToggle = DOM.get('separateToggle');
        
        // Settings elements
        this.settingsPanel = DOM.get('settingsPanel');
        this.closeSettings = DOM.get('closeSettings');
        this.readingDirection = DOM.get('readingDirection');
        this.translationStyle = DOM.get('translationStyle');
        this.translationOpacity = DOM.get('translationOpacity');
        this.opacityValue = DOM.get('opacityValue');
        this.textSize = DOM.get('textSize');
        this.textSizeValue = DOM.get('textSizeValue');
        this.fitToWidth = DOM.get('fitToWidth');
        this.hideUI = DOM.get('hideUI');
        this.resetProgress = DOM.get('resetProgress');
        
        // Toast
        this.toast = DOM.get('progressToast');
        this.toastMessage = DOM.get('toastMessage');
    }

    async init() {
        const dataLoaded = await this.loadSeriesData();
        this.loadSettings();
        this.bindEvents();
        
        // Initialize overlay state
        this.initializeOverlayState();
        
        // Only load current page if data was successfully loaded
        if (dataLoaded) {
            this.loadCurrentPage();
        }
        
        this.setupAutoHideUI();
    }

    initializeOverlayState() {
        // Ensure overlay starts in the correct hidden state
        this.translationOverlay.classList.remove('visible');
        this.overlayToggle.classList.remove('active');
        this.isOverlayVisible = false;
    }

    // ==========================================================================

    // ==========================================================================
    // Data Loading
    // ==========================================================================

    async loadSeriesData() {
        try {
            // Get series name from URL parameter
            const urlParams = new URLSearchParams(window.location.search);
            const seriesName = urlParams.get('series');
            
            console.log('URL search params:', window.location.search);
            console.log('Parsed series name:', seriesName);
            
            if (!seriesName) {
                console.error('No series parameter in URL');
                this.redirectToUpload();
                return false;
            }
            
            this.seriesName = seriesName;
            console.log('Loading series data from IndexedDB:', seriesName);
            
            // Initialize IndexedDB if not already done
            if (!indexedDBManager.db) {
                await indexedDBManager.init();
            }
            
            // Debug: List all stored series
            const allSeries = await indexedDBManager.listAllSeries();
            console.log('All stored series:', allSeries);
            
            if (allSeries.length === 0) {
                console.warn('No series found in IndexedDB at all');
                this.showToast('No manga data found. Upload files from the main page first.', 'error');
                console.log('📝 Instructions: Go to the main page, upload a ZIP file, then return here.');
                setTimeout(() => this.redirectToUpload(), 3000);
                return false;
            }
            
            console.log(`Looking for series: "${this.seriesName}"`);
            const seriesData = await indexedDBManager.getSeries(this.seriesName);
            
            console.log('Retrieved seriesData:', seriesData);
            console.log('seriesData structure:', {
                hasData: !!seriesData,
                hasFiles: !!seriesData?.files,
                hasMatched: !!seriesData?.files?.matched,
                matchedLength: seriesData?.files?.matched?.length
            });
            
            if (!seriesData || !seriesData.files || !seriesData.files.matched) {
                console.error('No manga file data found in IndexedDB');
                console.error('Debug info:', {
                    seriesData: !!seriesData,
                    files: !!seriesData?.files,
                    matched: !!seriesData?.files?.matched
                });
                
                // Additional debugging
                if (seriesData) {
                    console.log('SeriesData keys:', Object.keys(seriesData));
                    if (seriesData.files) {
                        console.log('Files keys:', Object.keys(seriesData.files));
                    }
                }
                
                this.showToast('Session expired or data not found. Please re-upload your files.', 'error');
                setTimeout(() => this.redirectToUpload(), 3000);
                return false;
            }
            
            // Extract files from the IndexedDB stored structure
            // Handle both old and new data structures
            if (seriesData.files) {
                this.files = seriesData.files;
            } else if (seriesData.matched) {
                // Handle legacy structure where data might be at top level
                this.files = {
                    images: seriesData.images || [],
                    translations: seriesData.translations || [],
                    matched: seriesData.matched || []
                };
            } else {
                throw new Error('Invalid data structure in IndexedDB');
            }
            
            console.log('Files structure:', {
                images: this.files?.images?.length,
                translations: this.files?.translations?.length,
                matched: this.files?.matched?.length
            });
            
            // Load progress
            const progress = storageManager.getProgress(this.seriesName);
            this.currentPage = progress?.currentPage || 0;
            
            // Update UI
            this.seriesTitle.textContent = this.seriesName;
            this.totalPagesEl.textContent = this.files.matched.length;
            this.pageSlider.max = this.files.matched.length;
            
            console.log('Series loaded:', {
                name: this.seriesName,
                pages: this.files.matched.length,
                currentPage: this.currentPage
            });
            
            return true;
            
        } catch (error) {
            console.error('Failed to load series data:', error);
            this.showToast('Failed to load series data. Please re-upload.', 'error');
            setTimeout(() => this.redirectToUpload(), 3000);
            return false;
        }
    }

    async loadSettings() {
        const savedSettings = storageManager.getSettings();
        this.settings = { ...this.settings, ...savedSettings };
        
        // Apply settings to UI
        this.readingDirection.value = this.settings.readingDirection;
        this.translationStyle.value = this.settings.translationStyle;
        this.translationOpacity.value = this.settings.translationOpacity;
        this.opacityValue.textContent = this.settings.translationOpacity + '%';
        this.textSize.value = this.settings.textSize;
        this.textSizeValue.textContent = this.settings.textSize + 'px';
        this.fitToWidth.checked = this.settings.fitToWidth;
        this.hideUI.checked = this.settings.hideUI;
        
        // Apply settings
        this.applySettings();
    }

    redirectToUpload() {
        // Clean up before redirecting
        if (this.currentImageUrl) {
            URL.revokeObjectURL(this.currentImageUrl);
        }
        
        // Don't save progress if we don't have valid data
        sessionStorage.removeItem('currentSeries');
        sessionStorage.removeItem('fallbackMode');
        
        window.location.href = 'index.html';
    }

    // ==========================================================================
    // Event Binding
    // ==========================================================================

    bindEvents() {
        // Header controls
        this.backBtn?.addEventListener('click', () => this.redirectToUpload());
        this.overlayToggle?.addEventListener('click', () => this.toggleOverlay());
        this.settingsBtn?.addEventListener('click', () => this.openSettings());
        
        // Navigation
        this.navLeft?.addEventListener('click', (e) => this.handleNavClick(e, 'prev'));
        this.navRight?.addEventListener('click', (e) => this.handleNavClick(e, 'next'));
        this.prevBtn?.addEventListener('click', () => this.previousPage());
        this.nextBtn?.addEventListener('click', () => this.nextPage());
        this.pageSlider?.addEventListener('input', (e) => this.goToPage(parseInt(e.target.value) - 1));
    this.separateToggle?.addEventListener('click', () => this.toggleSeparation());
        
        // Settings
        this.closeSettings?.addEventListener('click', () => this.closeSettingsPanel());
        this.readingDirection?.addEventListener('change', (e) => this.updateSetting('readingDirection', e.target.value));
        this.translationStyle?.addEventListener('change', (e) => this.updateSetting('translationStyle', e.target.value));
        this.translationOpacity?.addEventListener('input', (e) => this.updateOpacity(e.target.value));
        this.textSize?.addEventListener('input', (e) => this.updateTextSize(e.target.value));
        this.fitToWidth?.addEventListener('change', (e) => this.updateSetting('fitToWidth', e.target.checked));
        this.hideUI?.addEventListener('change', (e) => this.updateSetting('hideUI', e.target.checked));
        this.resetProgress?.addEventListener('click', () => this.resetReadingProgress());
        
        // Touch/mouse events for panning
        this.bindPanEvents();
        
        // Keyboard shortcuts
        this.bindKeyboardEvents();
        
        // Image load events
        this.pageImage?.addEventListener('load', () => this.onImageLoad());
        this.pageImage?.addEventListener('error', () => this.onImageError());
        
        // Window events
        window.addEventListener('beforeunload', () => this.saveProgress());
        window.addEventListener('resize', () => this.handleResize());
    }

    bindPanEvents() {
        let startX, startY, initialPanX, initialPanY;
        
        // Mouse events
        this.pageImage?.addEventListener('mousedown', (e) => {
            if (!this.isZoomed) return;
            e.preventDefault();
            this.isPanning = true;
            startX = e.clientX;
            startY = e.clientY;
            initialPanX = this.panX;
            initialPanY = this.panY;
        });
        
        // Add click handler for overlay toggle
        this.pageImage?.addEventListener('click', (e) => {
            if (this.isZoomed || this.isPanning) return;
            
            const rect = this.pageImage.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Define center area (middle 30% of image width and height)
            const centerXStart = rect.width * 0.35;
            const centerXEnd = rect.width * 0.65;
            const centerYStart = rect.height * 0.35;
            const centerYEnd = rect.height * 0.65;
            
            if (clickX >= centerXStart && clickX <= centerXEnd && 
                clickY >= centerYStart && clickY <= centerYEnd) {
                this.toggleOverlay();
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!this.isPanning) return;
            e.preventDefault();
            this.panX = initialPanX + (e.clientX - startX);
            this.panY = initialPanY + (e.clientY - startY);
            this.updateImageTransform();
        });
        
        document.addEventListener('mouseup', () => {
            this.isPanning = false;
        });
        
        // Touch events
        this.pageImage?.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && this.isZoomed) {
                this.isPanning = true;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                initialPanX = this.panX;
                initialPanY = this.panY;
            }
        });
        
        this.pageImage?.addEventListener('touchmove', (e) => {
            if (!this.isPanning || e.touches.length !== 1) return;
            e.preventDefault();
            this.panX = initialPanX + (e.touches[0].clientX - startX);
            this.panY = initialPanY + (e.touches[0].clientY - startY);
            this.updateImageTransform();
        });
        
        this.pageImage?.addEventListener('touchend', () => {
            this.isPanning = false;
        });
        
        // Double tap to zoom / Single tap to toggle overlay
        this.pageImage?.addEventListener('touchend', (e) => {
            if (e.touches.length > 0) return;
            
            const now = Date.now();
            const timeSinceLastTap = now - this.lastTap;
            
            if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
                // Double tap - toggle zoom
                this.toggleZoom(e);
            } else {
                // Single tap - check if it's in the center area to toggle overlay
                const rect = this.pageImage.getBoundingClientRect();
                const touch = e.changedTouches[0];
                const tapX = touch.clientX - rect.left;
                const tapY = touch.clientY - rect.top;
                
                // Define center area (middle 30% of image width and height)
                const centerXStart = rect.width * 0.35;
                const centerXEnd = rect.width * 0.65;
                const centerYStart = rect.height * 0.35;
                const centerYEnd = rect.height * 0.65;
                
                if (tapX >= centerXStart && tapX <= centerXEnd && 
                    tapY >= centerYStart && tapY <= centerYEnd) {
                    // Delay single tap action to wait for potential double tap
                    setTimeout(() => {
                        const currentTime = Date.now();
                        if (currentTime - this.lastTap >= 300) {
                            this.toggleOverlay();
                        }
                    }, 320);
                }
            }
            
            this.lastTap = now;
        });
    }

    bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            if (this.settingsPanel?.classList.contains('open')) return;
            
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    if (this.settings.readingDirection === 'rtl') {
                        this.nextPage();
                    } else {
                        this.previousPage();
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (this.settings.readingDirection === 'rtl') {
                        this.previousPage();
                    } else {
                        this.nextPage();
                    }
                    break;
                case ' ':
                    e.preventDefault();
                    this.toggleOverlay();
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (this.isZoomed) {
                        this.resetZoom();
                    }
                    break;
                case 'f':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
            }
        });
    }

    // ==========================================================================
    // Page Navigation
    // ==========================================================================

    handleNavClick(e, direction) {
        e.stopPropagation();
        
        // Determine direction based on reading mode
        const actualDirection = this.settings.readingDirection === 'rtl' ? 
            (direction === 'prev' ? 'next' : 'prev') : direction;
        
        if (actualDirection === 'prev') {
            this.previousPage();
        } else {
            this.nextPage();
        }
    }

    previousPage() {
        if (!this.files || this.currentPage <= 0) return;
        this.goToPage(this.currentPage - 1);
    }

    nextPage() {
        if (!this.files || this.currentPage >= this.files.matched.length - 1) return;
        this.goToPage(this.currentPage + 1);
    }

    goToPage(pageIndex) {
        if (!this.files || pageIndex < 0 || pageIndex >= this.files.matched.length) return;
        
        this.currentPage = pageIndex;
        this.loadCurrentPage();
        this.saveProgress();
        this.updateNavigationState();
    }

    loadCurrentPage() {
        if (!this.files || this.currentPage < 0 || this.currentPage >= this.files.matched.length) {
            console.error('Invalid page index:', this.currentPage, 'Files:', this.files);
            return;
        }
        
        const page = this.files.matched[this.currentPage];
        
        // Show loading
        DOM.toggle(this.pageLoading, true);
        DOM.toggle(this.noTranslation, false);
        this.pageImage.classList.add('loading');
        
        // Update page info
        this.currentPageEl.textContent = this.currentPage + 1;
        this.pageSlider.value = this.currentPage + 1;
        
        // Load image
        this.loadPageImage(page);
        
        // Load translations
        this.loadPageTranslations(page);
        
        // Reset zoom/pan
        this.resetZoom();
        
        console.log(`Loading page ${this.currentPage + 1}/${this.files.matched.length}`);
    }

    loadPageImage(page) {
        if (!page.image || !page.image.blob) {
            console.error('No image data for page:', page);
            this.showToast('Failed to load page image - no image data', 'error');
            return;
        }
        
        // Create object URL for the blob
        const imageUrl = URL.createObjectURL(page.image.blob);
        
        // Clean up previous URL
        if (this.currentImageUrl) {
            URL.revokeObjectURL(this.currentImageUrl);
        }
        
        this.currentImageUrl = imageUrl;
        this.pageImage.src = imageUrl;
    }

    loadPageTranslations(page) {
        // Clear existing translations
        this.translationOverlay.innerHTML = '';
        
        console.log('Loading translations for page:', {
            hasTranslation: page.hasTranslation,
            translation: page.translation ? 'exists' : 'missing',
            translationData: page.translation?.data ? 'exists' : 'missing'
        });
        
        if (!page.hasTranslation || !page.translation) {
            console.log('No translation available for this page');
            DOM.toggle(this.noTranslation, true);
            // Hide the translation overlay if there are no translations
            this.translationOverlay.classList.remove('visible');
            return;
        }
        
        // Hide the no translation message when we have translations
        DOM.toggle(this.noTranslation, false);
        
        const translation = page.translation.data;
        console.log('Translation data:', translation);
        
        // Wait for image to load before positioning translations
        if (this.pageImage.complete) {
            this.renderTranslations(translation);
        } else {
            this.pageImage.addEventListener('load', () => {
                this.renderTranslations(translation);
            }, { once: true });
        }
    }

    renderTranslations(mokuroData) {
        if (!mokuroData || !mokuroData.blocks) return;
        // Safety: remove any prior blocks to avoid duplicates when re-rendering
        this.translationOverlay.querySelectorAll('.translation-block').forEach(el => el.remove());
        
        // Get the actual dimensions and position of the image as displayed
        const img = this.pageImage;
        const imgRect = img.getBoundingClientRect();
        const overlayRect = this.translationOverlay.getBoundingClientRect();
        
        console.log('Rendering translations:', {
            imgRect: { width: imgRect.width, height: imgRect.height, left: imgRect.left, top: imgRect.top },
            overlayRect: { width: overlayRect.width, height: overlayRect.height, left: overlayRect.left, top: overlayRect.top },
            mokuroSize: { width: mokuroData.img_width, height: mokuroData.img_height },
            blocksCount: mokuroData.blocks.length
        });
        
        // Calculate scale factors based on how the image is actually displayed
        const scaleX = imgRect.width / mokuroData.img_width;
        const scaleY = imgRect.height / mokuroData.img_height;
        
        // Calculate the offset between the image and the overlay container
        const offsetX = imgRect.left - overlayRect.left;
        const offsetY = imgRect.top - overlayRect.top;
        
        console.log('Scale and offset:', { scaleX, scaleY, offsetX, offsetY });
        
    mokuroData.blocks.forEach((block, index) => {
            if (!block.lines || block.lines.length === 0) return;
            
            // Get text from all lines in the block
            const text = block.lines.join(' ').trim();
            if (!text) return;
            
            // Position based on bounding box
            const [x, y, width, height] = block.box;
            
            // Calculate scaled dimensions
            const scaledWidth = width * scaleX;
            const scaledHeight = height * scaleY;
            
            // Move text significantly above and left of the Japanese text area
            const offsetLeft = Math.min(scaledWidth * 0.15, 15); // Move left by 15% or 15px max
            const offsetUp = Math.min(scaledHeight * 0.15, 15); // Move up by 15% or 15px max
            const textAreaWidth = scaledWidth * 0.9; // Max width we allow the text to occupy
            const textAreaHeight = scaledHeight * 0.9; // Max height budget for fitting text
            
            // Create translation element
            const translationEl = document.createElement('div');
            translationEl.className = `translation-block ${this.settings.translationStyle}`;
            
            // Start with much smaller font size
            let fontSize = Math.min(this.settings.textSize * 0.6, scaledHeight * 0.2);
            fontSize = Math.max(fontSize, 8);
            
            // Function to add line breaks based on character fitting
            const addLineBreaks = (text, maxWidth, maxHeight, fontSize) => {
                // Create a temporary element to measure character dimensions
                const tempEl = document.createElement('span');
                tempEl.style.position = 'absolute';
                tempEl.style.visibility = 'hidden';
                tempEl.style.fontSize = fontSize + 'px';
                tempEl.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                tempEl.style.fontWeight = 'normal';
                tempEl.style.whiteSpace = 'nowrap';
                tempEl.style.lineHeight = '1.1';
                document.body.appendChild(tempEl);
                
                try {
                    // Measure average character width using a sample of text
                    tempEl.textContent = 'M'.repeat(20); // Use 'M' as it's typically the widest character
                    const avgCharWidth = tempEl.offsetWidth / 20;
                    
                    // Calculate how many characters can fit per line
                    const charsPerLine = Math.floor(maxWidth / avgCharWidth);
                    
                    // Measure line height
                    tempEl.textContent = 'Mg'; // Use characters with ascenders/descenders
                    const lineHeight = tempEl.offsetHeight;
                    
                    // Calculate how many lines can fit
                    const maxLines = Math.floor(maxHeight / lineHeight);
                    
                    if (charsPerLine <= 0 || maxLines <= 0) {
                        return text; // Fallback if calculations don't make sense
                    }
                    
                    const words = text.split(' ');
                    const lines = [];
                    let currentLine = '';
                    let currentLineLength = 0;
                    
                    for (let i = 0; i < words.length; i++) {
                        const word = words[i];
                        const spaceNeeded = (currentLine ? 1 : 0) + word.length; // +1 for space if not first word
                        
                        // If adding this word would exceed the line character limit
                        if (currentLineLength + spaceNeeded > charsPerLine && currentLine) {
                            lines.push(currentLine);
                            currentLine = word;
                            currentLineLength = word.length;
                            
                            // Check if we're about to exceed max lines
                            if (lines.length >= maxLines) {
                                // We're out of vertical space, return what we have
                                break;
                            }
                        } else {
                            if (currentLine) {
                                currentLine += ' ' + word;
                                currentLineLength += spaceNeeded;
                            } else {
                                currentLine = word;
                                currentLineLength = word.length;
                            }
                        }
                    }
                    
                    // Add the last line if there's room and content
                    if (currentLine && lines.length < maxLines) {
                        lines.push(currentLine);
                    }
                    
                    return lines.join('\n');
                    
                } catch (e) {
                    console.warn('Error in character-based line breaking:', e);
                    return text; // Fallback to original text
                } finally {
                    document.body.removeChild(tempEl);
                }
            };
            
            // Apply initial styling
            translationEl.style.position = 'absolute';
            translationEl.style.fontSize = fontSize + 'px';
            translationEl.style.lineHeight = '1.1';
            translationEl.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            // Let the background shrink to the content while capping its width
            translationEl.style.maxWidth = textAreaWidth + 'px';
            translationEl.style.whiteSpace = 'pre-wrap'; // Preserve line breaks we add
            translationEl.style.textAlign = 'left';
            translationEl.style.display = 'inline-block'; // shrink-to-fit background
            
            // Position above and to the left of the Japanese text corner
            const finalX = offsetX + (x * scaleX) - offsetLeft;
            const finalY = offsetY + (y * scaleY) - offsetUp;
            
            translationEl.style.left = finalX + 'px';
            translationEl.style.top = finalY + 'px';
            
            // Add line breaks and set text
            let formattedText = addLineBreaks(text, textAreaWidth, textAreaHeight, fontSize);
            translationEl.textContent = formattedText;
            
            // Add to DOM temporarily to measure actual dimensions
            translationEl.style.opacity = '0';
            translationEl.style.visibility = 'hidden';
            this.translationOverlay.appendChild(translationEl);
            
            // Try different font sizes until the text fits both horizontally AND vertically
            let attempts = 0;
            const maxAttempts = 20;
            let textFits = false;
            
            while (!textFits && fontSize > 6 && attempts < maxAttempts) {
                translationEl.style.fontSize = fontSize + 'px';
                
                // Recalculate line breaks with current font size
                formattedText = addLineBreaks(text, textAreaWidth, textAreaHeight, fontSize);
                translationEl.textContent = formattedText;
                
                // Force a reflow to get accurate measurements
                translationEl.offsetHeight;
                
                // Check if it fits within both width and height constraints
                const actualWidth = translationEl.offsetWidth;
                const actualHeight = translationEl.offsetHeight;
                const lineCount = formattedText.split('\n').length;
                
                if (actualWidth <= textAreaWidth && actualHeight <= textAreaHeight) {
                    textFits = true;
                    console.log(`✓ Text fits with ${lineCount} lines, font size ${fontSize}px`);
                } else {
                    console.log(`Font ${fontSize}px: ${actualWidth}px width (limit ${textAreaWidth}px), ${actualHeight}px height (limit ${textAreaHeight}px), ${lineCount} lines - reducing font size`);
                    
                    // Reduce font size and try again
                    fontSize = Math.max(6, fontSize * 0.9); // Reduce by 10%
                    attempts++;
                }
            }
            
            // If we still don't fit after all attempts, use the last result anyway
            if (!textFits) {
                console.log(`Could not fit text after ${attempts} attempts, using final result with font ${fontSize}px`);
                formattedText = addLineBreaks(text, textAreaWidth, textAreaHeight, fontSize);
                translationEl.textContent = formattedText;
            }
            
            // Apply final opacity and ensure the element keeps its shrink-to-fit sizing
            translationEl.style.display = 'inline-block';
            translationEl.style.opacity = this.settings.translationOpacity / 100;
            translationEl.style.visibility = 'visible';
            
            console.log(`Block ${index}:`, {
                originalBox: [x, y, width, height],
                text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
                textLength: text.length,
                originalText: formattedText.replace(/\n/g, '\\n'),
                lineCount: formattedText.split('\n').length,
                hasLineBreaks: formattedText.includes('\n'),
                scaledBox: [x * scaleX, y * scaleY, scaledWidth, scaledHeight],
                textArea: { width: textAreaWidth, height: textAreaHeight },
                finalPosition: { left: finalX + 'px', top: finalY + 'px' },
                fontSize: fontSize + 'px',
                actualSize: { width: translationEl.offsetWidth, height: translationEl.offsetHeight },
                fitsInArea: translationEl.offsetHeight <= textAreaHeight,
                attempts: attempts
            });
        });
        
        console.log(`Rendered ${mokuroData.blocks.length} translation blocks`);

        // If separation mode is on, apply it after rendering all blocks
        if (this.separationEnabled) {
            this.applySeparation();
        }
    }

    onImageLoad() {
        DOM.toggle(this.pageLoading, false);
        this.pageImage.classList.remove('loading');
        this.pageImage.classList.add('loaded');
        
        // Apply fit settings
        this.applyImageFit();
        
        // Re-render translations if overlay is visible
        if (this.isOverlayVisible) {
            const page = this.files.matched[this.currentPage];
            if (page && page.hasTranslation) {
                this.renderTranslations(page.translation.data);
            }
        }
    }

    onImageError() {
        DOM.toggle(this.pageLoading, false);
        console.error('Failed to load page image');
        this.showToast('Failed to load page image', 'error');
    }

    updateNavigationState() {
        if (!this.files || !this.files.matched) return;
        
        // Update navigation buttons
        this.prevBtn.disabled = this.currentPage === 0;
        this.nextBtn.disabled = this.currentPage === this.files.matched.length - 1;
        
        // Update nav zones
        DOM.addClass(this.navLeft, 'disabled', this.currentPage === 0);
        DOM.addClass(this.navRight, 'disabled', this.currentPage === this.files.matched.length - 1);
    }

    // ==========================================================================
    // Translation Overlay
    // ==========================================================================

    toggleOverlay() {
        this.isOverlayVisible = !this.isOverlayVisible;
        
        // Use the 'visible' class instead of DOM.toggle which uses 'hidden'
        if (this.isOverlayVisible) {
            this.translationOverlay.classList.add('visible');
            this.overlayToggle.classList.add('active');
        } else {
            this.translationOverlay.classList.remove('visible');
            this.overlayToggle.classList.remove('active');
        }
        
        console.log('Translation overlay toggled:', this.isOverlayVisible ? 'shown' : 'hidden');
        
        // If showing overlay, render translations for current page
        if (this.isOverlayVisible && this.files?.matched?.[this.currentPage]) {
            const page = this.files.matched[this.currentPage];
            if (page.hasTranslation && page.translation) {
                console.log('Ensuring single render of translations for current page');
                // Remove any previously rendered translation blocks to avoid duplicates
                this.translationOverlay.querySelectorAll('.translation-block').forEach(el => el.remove());
                this.renderTranslations(page.translation.data);
            }
        }
    }

    // ======================================================================
    // Overlap Separation
    // ======================================================================

    toggleSeparation() {
        this.separationEnabled = !this.separationEnabled;
        if (this.separationEnabled) {
            this.separateToggle?.classList.add('active');
            this.applySeparation();
        } else {
            this.separateToggle?.classList.remove('active');
            this.restoreOriginalPositions();
        }
    }

    applySeparation() {
        if (!this.translationOverlay) return;
        const blocks = Array.from(this.translationOverlay.querySelectorAll('.translation-block'));
        if (blocks.length === 0) return;

        const overlayRect = this.translationOverlay.getBoundingClientRect();

        // Multi-iteration micro moves to resolve clusters without over-shooting
        const padding = 2;        // Desired tiny gap after separation
        const maxPairStep = 6;    // Max movement per pair per iteration
        const maxTotal = 24;      // Cap per element across all iterations
        const maxIterations = 10; // Few small sweeps

        const movedTotals = new Map(); // element -> total pixels moved (L1)
        const addMoved = (el, dx, dy) => {
            const prev = movedTotals.get(el) || 0;
            movedTotals.set(el, prev + Math.abs(dx) + Math.abs(dy));
        };

        for (let iter = 0; iter < maxIterations; iter++) {
            let any = false;
            for (let i = 0; i < blocks.length; i++) {
                for (let j = i + 1; j < blocks.length; j++) {
                    const a = blocks[i];
                    const b = blocks[j];
                    const ra = a.getBoundingClientRect();
                    const rb = b.getBoundingClientRect();
                    if (!this._rectsOverlap(ra, rb)) continue;

                    // Touching: compute penetration on each axis
                    const penX = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
                    const penY = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));

                    const axis = penX <= penY ? 'x' : 'y';
                    const needed = Math.min((axis === 'x' ? penX : penY) + padding, maxPairStep);
                    let step = needed / 2; // split across both elements

                    // Respect per-element total cap
                    const capA = Math.max(0, maxTotal - (movedTotals.get(a) || 0));
                    const capB = Math.max(0, maxTotal - (movedTotals.get(b) || 0));
                    step = Math.min(step, capA, capB);
                    if (step <= 0) continue;

                    // Save originals lazily (only moving ones)
                    this._ensureSavedOriginal(a);
                    this._ensureSavedOriginal(b);

                    if (axis === 'x') {
                        const acx = ra.left + ra.width / 2;
                        const bcx = rb.left + rb.width / 2;
                        const dir = bcx >= acx ? 1 : -1;
                        this._nudgeWithinOverlay(a, -dir * step, 0, overlayRect);
                        this._nudgeWithinOverlay(b,  dir * step, 0, overlayRect);
                        addMoved(a, -dir * step, 0);
                        addMoved(b,  dir * step, 0);
                    } else {
                        const acy = ra.top + ra.height / 2;
                        const bcy = rb.top + rb.height / 2;
                        const dir = bcy >= acy ? 1 : -1;
                        this._nudgeWithinOverlay(a, 0, -dir * step, overlayRect);
                        this._nudgeWithinOverlay(b, 0,  dir * step, overlayRect);
                        addMoved(a, 0, -dir * step);
                        addMoved(b, 0,  dir * step);
                    }

                    any = true;
                }
            }
            if (!any) break; // All clear
        }
    }

    restoreOriginalPositions() {
        this._originalPositions.forEach((pos, el) => {
            el.style.left = pos.left + 'px';
            el.style.top = pos.top + 'px';
        });
        this._originalPositions.clear();
    }

    _rectsOverlap(a, b) {
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    }

    _nudgeWithinOverlay(el, dx, dy, overlayRect) {
        const left = parseFloat(el.style.left || '0') + dx;
        const top = parseFloat(el.style.top || '0') + dy;
        const rect = el.getBoundingClientRect();
        // Clamp inside overlay bounds (with small margin)
        const margin = 4;
        const minLeft = margin;
        const minTop = margin;
        const maxLeft = overlayRect.width - rect.width - margin;
        const maxTop = overlayRect.height - rect.height - margin;
        el.style.left = Math.max(minLeft, Math.min(maxLeft, left)) + 'px';
        el.style.top = Math.max(minTop, Math.min(maxTop, top)) + 'px';
    }

    _ensureSavedOriginal(el) {
        if (!this._originalPositions.has(el)) {
            const left = parseFloat(el.style.left || '0');
            const top = parseFloat(el.style.top || '0');
            this._originalPositions.set(el, { left, top });
        }
    }

    // ==========================================================================
    // Settings Management
    // ==========================================================================

    openSettings() {
        this.settingsPanel.classList.add('open');
    }

    closeSettingsPanel() {
        this.settingsPanel.classList.remove('open');
    }

    updateSetting(key, value) {
        this.settings[key] = value;
        storageManager.saveSettings(this.settings);
        this.applySettings();
        console.log('Setting updated:', key, '=', value);
    }

    updateOpacity(value) {
        this.settings.translationOpacity = parseInt(value);
        this.opacityValue.textContent = value + '%';
        storageManager.saveSettings(this.settings);
        this.applySettings();
    }

    updateTextSize(value) {
        this.settings.textSize = parseInt(value);
        this.textSizeValue.textContent = value + 'px';
        storageManager.saveSettings(this.settings);
        this.applySettings();
    }

    applySettings() {
        // Apply reading direction
        this.readerContainer.classList.toggle('rtl', this.settings.readingDirection === 'rtl');
        
        // Apply UI hiding
        document.body.classList.toggle('auto-hide', this.settings.hideUI);
        
        // Apply image fit
        this.applyImageFit();
        
        // Re-render translations if visible
        if (this.isOverlayVisible) {
            const page = this.files.matched[this.currentPage];
            if (page && page.hasTranslation) {
                this.renderTranslations(page.translation.data);
            }
        }
    }

    applyImageFit() {
        if (!this.pageImage) return;
        
        this.pageImage.classList.toggle('fit-width', this.settings.fitToWidth);
        this.pageImage.classList.toggle('fit-height', !this.settings.fitToWidth);
    }

    resetReadingProgress() {
        if (confirm('Reset reading progress for this series? This cannot be undone.')) {
            storageManager.clearProgress(this.seriesName);
            this.goToPage(0);
            this.showToast('Reading progress reset');
            this.closeSettingsPanel();
        }
    }

    // ==========================================================================
    // Zoom and Pan
    // ==========================================================================

    toggleZoom(e) {
        if (this.isZoomed) {
            this.resetZoom();
        } else {
            this.zoomIn(e);
        }
    }

    zoomIn(e) {
        this.isZoomed = true;
        this.zoomLevel = 2;
        
        // Get click/touch position for zoom center
        const rect = this.pageImage.getBoundingClientRect();
        const centerX = e ? (e.clientX || e.touches[0].clientX) - rect.left : rect.width / 2;
        const centerY = e ? (e.clientY || e.touches[0].clientY) - rect.top : rect.height / 2;
        
        // Calculate pan to center on click point
        this.panX = (rect.width / 2 - centerX) * (this.zoomLevel - 1);
        this.panY = (rect.height / 2 - centerY) * (this.zoomLevel - 1);
        
        this.updateImageTransform();
        this.pageImage.classList.add('zoomed');
    }

    resetZoom() {
        this.isZoomed = false;
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        
        this.updateImageTransform();
        this.pageImage.classList.remove('zoomed');
    }

    updateImageTransform() {
        this.pageImage.style.transform = 
            `scale(${this.zoomLevel}) translate(${this.panX}px, ${this.panY}px)`;
    }

    // ==========================================================================
    // UI Management
    // ==========================================================================

    setupAutoHideUI() {
        if (!this.settings.hideUI) return;
        
        const showUI = () => {
            this.isUIVisible = true;
            document.body.classList.add('show-ui');
            
            clearTimeout(this.hideUITimer);
            this.hideUITimer = setTimeout(() => {
                this.isUIVisible = false;
                document.body.classList.remove('show-ui');
            }, 3000);
        };
        
        // Show UI on mouse move or touch
        document.addEventListener('mousemove', showUI);
        document.addEventListener('touchstart', showUI);
        
        // Initial hide
        setTimeout(() => {
            if (this.settings.hideUI) {
                document.body.classList.remove('show-ui');
            }
        }, 3000);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
            document.body.classList.add('fullscreen');
        } else {
            document.exitFullscreen?.();
            document.body.classList.remove('fullscreen');
        }
    }

    handleResize() {
        // Re-render translations on window resize
        if (this.isOverlayVisible) {
            setTimeout(() => {
                const page = this.files.matched[this.currentPage];
                if (page && page.hasTranslation) {
                    this.renderTranslations(page.translation.data);
                }
            }, 100);
        }
    }

    // ==========================================================================
    // Progress Management
    // ==========================================================================

    saveProgress() {
        if (this.seriesName && this.files && this.files.matched) {
            storageManager.saveProgress(this.seriesName, {
                currentPage: this.currentPage,
                totalPages: this.files.matched.length,
                lastRead: Date.now()
            });
        }
    }

    // ==========================================================================
    // Utility Functions
    // ==========================================================================

    showToast(message, type = 'info') {
        this.toastMessage.textContent = message;
        this.toast.classList.add('show');
        
        setTimeout(() => {
            this.toast.classList.remove('show');
        }, 3000);
    }

    // ==========================================================================
    // Cleanup
    // ==========================================================================

    destroy() {
        if (this.currentImageUrl) {
            URL.revokeObjectURL(this.currentImageUrl);
        }
        
        this.saveProgress();
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.mangaReader) {
        window.mangaReader.destroy();
    }
});

// Export for global use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MangaReader;
}
