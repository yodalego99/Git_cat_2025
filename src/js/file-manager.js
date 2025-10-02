/**
 * File Manager - Handles ZIP file uploads, extraction, and file matching
 * Processes manga images and translation JSON files
 */

class FileManager {
    constructor() {
        this.currentFiles = {
            images: [],
            translations: [],
            matched: []
        };
        this.supportedImageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        this.maxFileSize = 100 * 1024 * 1024; // 100MB limit
        this.processing = false;
    }

    // ==========================================================================
    // ZIP File Processing
    // ==========================================================================

    /**
     * Process uploaded ZIP file
     */
    async processZipFile(file, progressCallback = null) {
        if (this.processing) {
            throw new Error('Already processing a file');
        }

        this.processing = true;
        this.currentFiles = { images: [], translations: [], matched: [] };

        try {
            // Validate file
            this.validateZipFile(file);
            
            if (progressCallback) progressCallback(10, 'Reading ZIP file...');

            // Load ZIP file
            const zip = new JSZip();
            const zipData = await zip.loadAsync(file);
            
            if (progressCallback) progressCallback(30, 'Extracting files...');

            // Extract files
            await this.extractFiles(zipData, progressCallback);
            
            if (progressCallback) progressCallback(80, 'Matching files...');

            // Match images to translations
            this.matchFiles();
            
            if (progressCallback) progressCallback(90, 'Validating structure...');

            // Validate final structure
            const validation = this.validateFileStructure();
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            if (progressCallback) progressCallback(100, 'Processing complete!');

            return {
                success: true,
                images: this.currentFiles.images,
                translations: this.currentFiles.translations,
                matched: this.currentFiles.matched,
                stats: {
                    imageCount: this.currentFiles.images.length,
                    translationCount: this.currentFiles.translations.length,
                    matchedCount: this.currentFiles.matched.length,
                    totalSize: file.size
                }
            };

        } catch (error) {
            console.error('ZIP processing error:', error);
            throw error;
        } finally {
            this.processing = false;
        }
    }

    /**
     * Validate ZIP file before processing
     */
    validateZipFile(file) {
        if (!file) {
            throw new Error('No file provided');
        }

        if (file.type !== 'application/zip' && !file.name.toLowerCase().endsWith('.zip')) {
            throw new Error('Please upload a ZIP file');
        }

        if (file.size > this.maxFileSize) {
            throw new Error(`File too large. Maximum size is ${FileUtils.formatSize(this.maxFileSize)}`);
        }

        if (file.size === 0) {
            throw new Error('ZIP file appears to be empty');
        }
    }

    /**
     * Extract files from ZIP
     */
    async extractFiles(zipData, progressCallback = null) {
        const files = Object.keys(zipData.files);
        const totalFiles = files.length;
        let processedFiles = 0;

        if (totalFiles === 0) {
            throw new Error('ZIP file contains no files');
        }

        for (const filename of files) {
            const zipEntry = zipData.files[filename];
            
            // Skip directories
            if (zipEntry.dir) {
                continue;
            }

            // Skip hidden files and system files
            if (this.shouldSkipFile(filename)) {
                continue;
            }

            try {
                // Process based on file type
                if (FileUtils.isImage(filename)) {
                    await this.processImageFile(filename, zipEntry);
                } else if (FileUtils.isJSON(filename)) {
                    await this.processJSONFile(filename, zipEntry);
                }
            } catch (error) {
                console.warn(`Error processing file ${filename}:`, error);
                // Continue processing other files
            }

            processedFiles++;
            
            // Update progress
            if (progressCallback && totalFiles > 0) {
                const fileProgress = Math.floor((processedFiles / totalFiles) * 40); // 40% of total progress
                progressCallback(30 + fileProgress, `Processing ${filename}...`);
            }
        }

        if (this.currentFiles.images.length === 0) {
            throw new Error('No valid image files found in ZIP');
        }
    }

    /**
     * Process image file from ZIP
     */
    async processImageFile(filename, zipEntry) {
        const blob = await zipEntry.async('blob');
        
        // Validate image
        if (!this.isValidImage(blob)) {
            throw new Error(`Invalid image file: ${filename}`);
        }

        const imageData = {
            filename: this.cleanFilename(filename),
            blob: blob,
            size: blob.size,
            type: 'image',
            baseName: FileUtils.getBaseName(filename)
        };

        this.currentFiles.images.push(imageData);
    }

    /**
     * Process JSON file from ZIP
     */
    async processJSONFile(filename, zipEntry) {
        const textContent = await zipEntry.async('text');
        
        try {
            const jsonData = JSON.parse(textContent);
            
            // Validate mokuro JSON structure
            if (!this.isValidMokuroJSON(jsonData)) {
                console.warn(`Invalid mokuro JSON structure: ${filename}`);
                return; // Skip invalid JSONs silently
            }

            const translationData = {
                filename: this.cleanFilename(filename),
                data: jsonData,
                size: textContent.length,
                type: 'translation',
                baseName: FileUtils.getBaseName(filename)
            };

            this.currentFiles.translations.push(translationData);
            
        } catch (error) {
            console.warn(`Failed to parse JSON file ${filename}:`, error);
            // Skip malformed JSONs silently as per requirements
        }
    }

    // ==========================================================================
    // File Matching
    // ==========================================================================

    /**
     * Match images to their corresponding translation files
     */
    matchFiles() {
        const matched = [];
        
        // Sort images for consistent ordering
        this.currentFiles.images.sort((a, b) => 
            this.naturalSort(a.filename, b.filename)
        );

        for (const image of this.currentFiles.images) {
            const matchingTranslation = this.findMatchingTranslation(image);
            
            matched.push({
                image: image,
                translation: matchingTranslation,
                hasTranslation: !!matchingTranslation,
                pageIndex: matched.length
            });
        }

        this.currentFiles.matched = matched;
    }

    /**
     * Find matching translation for an image
     */
    findMatchingTranslation(image) {
        if (!image || !image.baseName) return null;

        // Direct base name match (mokuro standard)
        const exactMatch = this.currentFiles.translations.find(trans => 
            trans.baseName === image.baseName
        );
        
        if (exactMatch) return exactMatch;

        // Fallback: try fuzzy matching for edge cases
        const fuzzyMatch = this.currentFiles.translations.find(trans => {
            const imageBase = this.normalizeFilename(image.baseName);
            const transBase = this.normalizeFilename(trans.baseName);
            return imageBase === transBase;
        });

        return fuzzyMatch || null;
    }

    // ==========================================================================
    // Validation
    // ==========================================================================

    /**
     * Validate file structure after processing
     */
    validateFileStructure() {
        const { images, translations, matched } = this.currentFiles;

        if (images.length === 0) {
            return { valid: false, error: 'No image files found' };
        }

        if (matched.length === 0) {
            return { valid: false, error: 'No pages could be processed' };
        }

        // Check if any images have translations
        const hasTranslations = matched.some(page => page.hasTranslation);

        return {
            valid: true,
            hasTranslations,
            stats: {
                totalPages: matched.length,
                pagesWithTranslations: matched.filter(p => p.hasTranslation).length,
                translationCoverage: Math.round((matched.filter(p => p.hasTranslation).length / matched.length) * 100)
            }
        };
    }

    /**
     * Check if image blob is valid
     */
    isValidImage(blob) {
        // Basic validation - check if it's actually a blob and has reasonable size
        return blob && 
               blob instanceof Blob && 
               blob.size > 0 && 
               blob.size < 50 * 1024 * 1024; // 50MB per image max
               // JSZip might not set MIME type correctly, so we skip that check
    }

    /**
     * Validate mokuro JSON structure
     */
    isValidMokuroJSON(data) {
        if (!data || typeof data !== 'object') return false;
        
        // Check for required mokuro properties
        if (!data.version || !data.img_width || !data.img_height) return false;
        
        // Check for blocks array
        if (!Array.isArray(data.blocks)) return false;
        
        // Validate block structure (basic check)
        for (const block of data.blocks) {
            if (!block.box || !Array.isArray(block.box) || block.box.length !== 4) return false;
            if (!Array.isArray(block.lines)) return false;
        }
        
        return true;
    }

    // ==========================================================================
    // Utility Functions
    // ==========================================================================

    /**
     * Check if file should be skipped
     */
    shouldSkipFile(filename) {
        const name = filename.toLowerCase();
        
        // Skip hidden files
        if (name.startsWith('.') || name.includes('/.')) return true;
        
        // Skip system files
        if (name.includes('__macosx') || name.includes('thumbs.db')) return true;
        
        // Skip unsupported file types
        const ext = name.split('.').pop();
        if (!this.supportedImageTypes.includes(ext) && ext !== 'json') return true;
        
        return false;
    }

    /**
     * Clean filename (remove path components)
     */
    cleanFilename(filename) {
        return filename.split('/').pop().split('\\').pop();
    }

    /**
     * Normalize filename for fuzzy matching
     */
    normalizeFilename(filename) {
        return filename.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/^0+/, ''); // Remove leading zeros
    }

    /**
     * Natural sort for filenames (handles numbers correctly)
     */
    naturalSort(a, b) {
        const normalize = str => str.replace(/(\d+)/g, match => match.padStart(10, '0'));
        return normalize(a).localeCompare(normalize(b));
    }

    // ==========================================================================
    // Public API
    // ==========================================================================

    /**
     * Get current processing state
     */
    isProcessing() {
        return this.processing;
    }

    /**
     * Get processed files
     */
    getFiles() {
        return {
            images: [...this.currentFiles.images],
            translations: [...this.currentFiles.translations],
            matched: [...this.currentFiles.matched]
        };
    }

    /**
     * Get file statistics
     */
    getStats() {
        const validation = this.validateFileStructure();
        
        return {
            imageCount: this.currentFiles.images.length,
            translationCount: this.currentFiles.translations.length,
            matchedCount: this.currentFiles.matched.length,
            hasTranslations: validation.hasTranslations,
            ...validation.stats
        };
    }

    /**
     * Clear current files
     */
    clear() {
        if (this.processing) {
            console.warn('Cannot clear files while processing');
            return false;
        }
        
        this.currentFiles = {
            images: [],
            translations: [],
            matched: []
        };
        
        return true;
    }

    /**
     * Get page data by index
     */
    getPage(index) {
        if (index < 0 || index >= this.currentFiles.matched.length) {
            return null;
        }
        
        return this.currentFiles.matched[index];
    }

    /**
     * Get total page count
     */
    getPageCount() {
        return this.currentFiles.matched.length;
    }
}

// Create global instance
const fileManager = new FileManager();

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileManager;
}
