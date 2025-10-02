/**
 * Utility functions for the manga reader application
 */

// DOM utility functions
const DOM = {
    /**
     * Get element by ID with error handling
     */
    get: (id) => {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element with ID '${id}' not found`);
        }
        return element;
    },

    /**
     * Toggle visibility of an element
     */
    toggle: (element, show = null) => {
        if (!element) return;
        if (show === null) {
            element.classList.toggle('hidden');
        } else {
            element.classList.toggle('hidden', !show);
        }
    },

    /**
     * Add class with optional condition
     */
    addClass: (element, className, condition = true) => {
        if (!element || !condition) return;
        element.classList.add(className);
    },

    /**
     * Remove class
     */
    removeClass: (element, className) => {
        if (!element) return;
        element.classList.remove(className);
    },

    /**
     * Set text content safely
     */
    setText: (element, text) => {
        if (!element) return;
        element.textContent = text;
    },

    /**
     * Set HTML content safely
     */
    setHTML: (element, html) => {
        if (!element) return;
        element.innerHTML = html;
    }
};

// File utility functions
const FileUtils = {
    /**
     * Check if file is an image
     */
    isImage: (filename) => {
        const ext = filename.toLowerCase().split('.').pop();
        return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    },

    /**
     * Check if file is JSON
     */
    isJSON: (filename) => {
        return filename.toLowerCase().endsWith('.json');
    },

    /**
     * Get file base name without extension
     */
    getBaseName: (filename) => {
        return filename.replace(/\.(jpg|jpeg|png|gif|webp|json)$/i, '');
    },

    /**
     * Format file size for display
     */
    formatSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Create file object from blob
     */
    createFileData: (filename, blob, type = 'image') => {
        return {
            filename,
            blob,
            type,
            size: blob.size,
            lastModified: Date.now()
        };
    }
};

// String utility functions
const StringUtils = {
    /**
     * Sanitize string for use as storage key
     */
    sanitize: (str) => {
        return str.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    },

    /**
     * Truncate string with ellipsis
     */
    truncate: (str, length = 50) => {
        if (!str || typeof str !== 'string') return '';
        if (str.length <= length) return str;
        return str.substring(0, length) + '...';
    },

    /**
     * Format date for display
     */
    formatDate: (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }
};

// Event handling utilities
const EventUtils = {
    /**
     * Debounce function calls
     */
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function calls
     */
    throttle: (func, limit) => {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    },

    /**
     * Add event listener with error handling
     */
    on: (element, event, handler, options = {}) => {
        if (!element || !event || !handler) {
            console.warn('Invalid parameters for event listener');
            return;
        }
        
        const wrappedHandler = (e) => {
            try {
                handler(e);
            } catch (error) {
                console.error('Error in event handler:', error);
            }
        };
        
        element.addEventListener(event, wrappedHandler, options);
        
        // Return cleanup function
        return () => {
            element.removeEventListener(event, wrappedHandler, options);
        };
    }
};

// Validation utilities
const Validation = {
    /**
     * Validate series name
     */
    seriesName: (name) => {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Series name is required' };
        }
        
        const trimmed = name.trim();
        if (trimmed.length < 1) {
            return { valid: false, error: 'Series name cannot be empty' };
        }
        
        if (trimmed.length > 50) {
            return { valid: false, error: 'Series name must be 50 characters or less' };
        }
        
        // Check for valid characters
        if (!/^[a-zA-Z0-9\s\-_.,!?()[\]]+$/.test(trimmed)) {
            return { valid: false, error: 'Series name contains invalid characters' };
        }
        
        return { valid: true, value: trimmed };
    },

    /**
     * Validate file structure
     */
    fileStructure: (images, translations) => {
        if (!Array.isArray(images) || !Array.isArray(translations)) {
            return { valid: false, error: 'Invalid file arrays' };
        }
        
        if (images.length === 0) {
            return { valid: false, error: 'No image files found' };
        }
        
        // Check if any images have matching translations
        const hasTranslations = images.some(img => {
            const baseName = FileUtils.getBaseName(img.filename);
            return translations.some(trans => 
                FileUtils.getBaseName(trans.filename) === baseName
            );
        });
        
        return { 
            valid: true, 
            hasTranslations,
            imageCount: images.length,
            translationCount: translations.length
        };
    }
};

// Error handling utilities
const ErrorHandler = {
    /**
     * Display error message to user
     */
    show: (message, container = null) => {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        if (container) {
            container.insertBefore(errorDiv, container.firstChild);
        } else {
            // Show in upload section by default
            const uploadSection = DOM.get('upload-section');
            if (uploadSection) {
                uploadSection.insertBefore(errorDiv, uploadSection.firstChild);
            }
        }
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    },

    /**
     * Clear all error messages
     */
    clear: () => {
        const errorMessages = document.querySelectorAll('.error-message');
        errorMessages.forEach(msg => {
            if (msg.parentNode) {
                msg.parentNode.removeChild(msg);
            }
        });
    },

    /**
     * Handle and log errors
     */
    handle: (error, userMessage = 'An unexpected error occurred') => {
        console.error('Application error:', error);
        ErrorHandler.show(userMessage);
    }
};

// Progress utilities
const Progress = {
    /**
     * Update progress bar
     */
    update: (percentage, message = '') => {
        const progressFill = DOM.get('progress-fill');
        const progressText = DOM.get('progress-text');
        
        if (progressFill) {
            progressFill.style.width = Math.min(100, Math.max(0, percentage)) + '%';
        }
        
        if (progressText && message) {
            DOM.setText(progressText, message);
        }
    },

    /**
     * Show progress section
     */
    show: (message = 'Processing...') => {
        const progressSection = DOM.get('progress-section');
        const uploadArea = DOM.get('upload-area');
        
        if (progressSection) {
            DOM.toggle(progressSection, true);
            Progress.update(0, message);
        }
        
        if (uploadArea) {
            DOM.addClass(uploadArea, 'processing');
        }
    },

    /**
     * Hide progress section
     */
    hide: () => {
        const progressSection = DOM.get('progress-section');
        const uploadArea = DOM.get('upload-area');
        
        if (progressSection) {
            DOM.toggle(progressSection, false);
        }
        
        if (uploadArea) {
            DOM.removeClass(uploadArea, 'processing');
        }
    }
};

// Animation utilities
const Animation = {
    /**
     * Smooth scroll to element
     */
    scrollTo: (element, offset = 0) => {
        if (!element) return;
        
        const targetPosition = element.getBoundingClientRect().top + window.pageYOffset - offset;
        
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
    },

    /**
     * Fade in element
     */
    fadeIn: (element, duration = 300) => {
        if (!element) return;
        
        element.style.opacity = '0';
        element.style.display = 'block';
        
        let start = null;
        const animate = (timestamp) => {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            const opacity = Math.min(progress / duration, 1);
            
            element.style.opacity = opacity;
            
            if (progress < duration) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    },

    /**
     * Fade out element
     */
    fadeOut: (element, duration = 300) => {
        if (!element) return;
        
        let start = null;
        const animate = (timestamp) => {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            const opacity = Math.max(1 - (progress / duration), 0);
            
            element.style.opacity = opacity;
            
            if (progress < duration) {
                requestAnimationFrame(animate);
            } else {
                element.style.display = 'none';
            }
        };
        
        requestAnimationFrame(animate);
    }
};

// Export utilities (for module systems if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DOM,
        FileUtils,
        StringUtils,
        EventUtils,
        Validation,
        ErrorHandler,
        Progress,
        Animation
    };
}
