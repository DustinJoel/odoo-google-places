/** @odoo-module **/

import { Component, useState, onMounted, useRef, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

/**
 * Google Places Field Widget
 * Provides address autocomplete functionality with multi-company support
 */
export class GooglePlacesField extends Component {
    setup() {
        this.rpc = useService("rpc");
        this.notification = useService("notification");
        this.user = useService("user");
        this.inputRef = useRef("googlePlacesInput");
        
        this.state = useState({
            isLoaded: false,
            autocomplete: null,
            isAuthorized: false,
            companyConfig: null,
            isLoading: true,
            error: null
        });
        
        // Track if component is mounted to avoid state updates after unmount
        this.isMounted = true;
        
        onMounted(() => {
            this.initializeGooglePlaces();
        });
        
        onWillUnmount(() => {
            this.cleanup();
        });
    }
    
    /**
     * Initialize Google Places functionality with company validation
     */
    async initializeGooglePlaces() {
        try {
            await this.checkCompanyAccess();
            
            if (this.state.isAuthorized && this.state.companyConfig?.enabled) {
                await this.loadGoogleMapsAPI();
            }
        } catch (error) {
            console.error('Error initializing Google Places:', error);
            if (this.isMounted) {
                this.state.error = error.message || 'Failed to initialize Google Places';
                this.state.isLoading = false;
            }
        }
    }
    
    /**
     * Check if current company has access to Google Places API
     */
    async checkCompanyAccess() {
        try {
            // Get company configuration and permissions
            const config = await this.rpc('/web/dataset/call_kw', {
                model: 'res.partner',
                method: 'get_google_places_config',
                args: [],
                kwargs: {}
            });
            
            if (!this.isMounted) return;
            
            this.state.companyConfig = config;
            
            // Check for errors in configuration
            if (config.error) {
                console.warn('Google Places configuration error:', config.error);
                this.state.isAuthorized = false;
                this.state.error = config.error;
                this.state.isLoading = false;
                return;
            }
            
            // Validate company configuration
            if (!config.enabled) {
                console.log('Google Places not enabled for current company');
                this.state.isAuthorized = false;
                this.state.isLoading = false;
                return;
            }
            
            if (!config.api_key) {
                console.warn('Google Places API key not configured');
                this.state.isAuthorized = false;
                this.state.error = 'API key not configured';
                this.state.isLoading = false;
                return;
            }
            
            this.state.isAuthorized = true;
            console.log('Google Places authorization successful');
            
        } catch (error) {
            console.error('Error checking company access:', error);
            if (this.isMounted) {
                this.state.isAuthorized = false;
                this.state.error = 'Access validation failed';
                this.state.isLoading = false;
            }
        }
    }
    
    /**
     * Load Google Maps JavaScript API dynamically
     */
    async loadGoogleMapsAPI() {
        if (!this.state.isAuthorized || !this.state.companyConfig) {
            return;
        }
        
        try {
            const apiKey = this.state.companyConfig.api_key;
            
            // Check if Google Maps API is already loaded
            if (window.google && window.google.maps) {
                this.initAutocomplete();
                return;
            }
            
            // Create unique callback name to avoid conflicts
            const callbackName = `initGooglePlaces_${Date.now()}`;
            
            // Load Google Maps API script
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}`;
            script.async = true;
            script.defer = true;
            
            // Set up callback
            window[callbackName] = () => {
                if (this.isMounted) {
                    this.initAutocomplete();
                }
                // Clean up callback
                delete window[callbackName];
                document.head.removeChild(script);
            };
            
            // Handle script loading errors
            script.onerror = () => {
                console.error('Failed to load Google Maps API');
                if (this.isMounted) {
                    this.state.error = 'Failed to load Google Maps API';
                    this.state.isLoading = false;
                }
                delete window[callbackName];
            };
            
            document.head.appendChild(script);
            
        } catch (error) {
            console.error('Error loading Google Maps API:', error);
            if (this.isMounted) {
                this.state.error = 'API loading failed';
                this.state.isLoading = false;
            }
        }
    }
    
    /**
     * Initialize Google Places Autocomplete widget
     */
    initAutocomplete() {
        const input = this.inputRef.el;
        if (!input || !window.google || !this.state.isAuthorized) {
            return;
        }
        
        try {
            // Create autocomplete instance
            // Based on Google Places API documentation best practices
            const autocompleteOptions = {
                fields: ['address_components', 'geometry', 'place_id', 'formatted_address'],
                types: ['geocode', 'establishment'],  // Include both geocode and establishments
                strictBounds: false  // Allow flexible bounds
            };
            
            // Apply country restriction if configured
            const countryRestriction = this.getCountryRestriction();
            if (countryRestriction) {
                autocompleteOptions.componentRestrictions = {
                    country: countryRestriction  // Use configured country restriction
                };
                console.log('Google Places Autocomplete with country restriction:', countryRestriction);
            } else {
                console.log('Google Places Autocomplete without country restriction (worldwide)');
            }
            
            const autocomplete = new google.maps.places.Autocomplete(input, autocompleteOptions);
            
            // Add place change listener - this is the primary event for place selection
            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                
                // Only process if we have a valid place with geometry
                if (place && place.geometry) {
                    this.handlePlaceChange(place);
                } else {
                    // User typed something but didn't select from dropdown
                    console.log('Place entered without selection from dropdown');
                }
            });
            
            // Add DOM-level click listener to handle dropdown item clicks
            document.addEventListener('click', (e) => {
                // Check if click is on a Google Places dropdown item
                const pacItem = e.target.closest('.pac-item');
                if (pacItem) {
                    // Small delay to allow Google Places to process the selection
                    setTimeout(() => {
                        this.hideDropdownCleanly();
                    }, 150);
                }
            });
            
            // Handle input changes - show/hide dropdown based on input
            input.addEventListener('input', (e) => {
                const inputValue = e.target.value.trim();
                
                // If input is empty, hide dropdown
                if (!inputValue) {
                    this.hideDropdownCleanly();
                    return;
                }

                
                // Allow dropdown to show for valid input
                // Google Places will handle showing it automatically
                setTimeout(() => {
                    this.showDropdownForInput();
                }, 100);
            });
            
            // Handle when input loses focus
            input.addEventListener('blur', (e) => {
                // Small delay to allow for potential selection
                setTimeout(() => {
                    this.hideDropdownCleanly();
                }, 200);
            });
            
            // Handle Escape key to close dropdown
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.hideDropdownCleanly();
                    input.blur();
                }
            });
            
            // Add additional event listeners for dropdown management
            input.addEventListener('blur', () => {
                // Hide dropdown when input loses focus
                setTimeout(() => {
                    this.clearAutocompleteDropdown();
                }, 150); // Small delay to allow for selection
            });
            
            input.addEventListener('keydown', (e) => {
                // Hide dropdown on Escape key
                if (e.key === 'Escape') {
                    this.clearAutocompleteDropdown();
                    input.blur();
                }
            });
            
            if (this.isMounted) {
                this.state.autocomplete = autocomplete;
                this.state.isLoaded = true;
                this.state.isLoading = false;
                
                console.log('Google Places autocomplete initialized successfully');
            }
            
        } catch (error) {
            console.error('Error initializing autocomplete:', error);
            if (this.isMounted) {
                this.state.error = 'Autocomplete initialization failed';
                this.state.isLoading = false;
            }
        }
    }
    
    /**
     * Get country restriction for autocomplete from company settings
     * Returns null if no country restriction configured (allows worldwide search)
     */
    getCountryRestriction() {
        // This should be fetched from company settings
        // For now, return null to allow worldwide addresses
        // The backend will handle country-specific validation if configured
        return null;
    }
    
    /**
     * Handle place selection from autocomplete
     */
    async handlePlaceChange(place) {
        if (!place || !place.address_components || !this.state.isAuthorized || !this.isMounted) {
            return;
        }
        
        try {
            console.log('Processing selected place:', place.formatted_address);
            console.log('Place components:', place.address_components);
            
            // Show processing notification
            this.notification.add(
                'Processing address...', 
                { type: 'info' }
            );
            
            // Process place data through backend with company validation
            const addressData = await this.rpc('/web/dataset/call_kw', {
                model: 'res.partner',
                method: 'process_google_place_data',
                args: [place],
                kwargs: {}
            });
            
            if (!this.isMounted) return;
            
            // Update form fields with processed data
            this.updateFormFields(addressData);
            
            // Show success notification
            this.notification.add(
                `✓ Address populated: ${place.formatted_address}`, 
                { type: 'success' }
            );
            
            // Clear the search input and hide dropdown cleanly
            this.clearInputAndDropdown();
            
            // Set placeholder for next search
            if (this.inputRef.el) {
                this.inputRef.el.placeholder = 'Search for another address...';
            }
            
        } catch (error) {
            console.error('Error processing place data:', error);
            
            if (!this.isMounted) return;
            
            // Handle different types of errors
            if (error.message && error.message.includes('not available for this company')) {
                this.notification.add(
                    'Google Places API not available for your company', 
                    { type: 'warning' }
                );
            } else if (error.message && error.message.includes('permission')) {
                this.notification.add(
                    'You do not have permission to use Google Places API', 
                    { type: 'warning' }
                );
            } else {
                this.notification.add(
                    'Error processing address data. Please try again or enter manually.', 
                    { type: 'danger' }
                );
            }
            
            // Hide dropdown on error but keep input value for user to see
            this.hideDropdownCleanly();
        }
    }
    
    /**
     * Update form fields with processed address data
     */
    updateFormFields(addressData) {
        if (!this.props.record || !addressData) {
            return;
        }
        
        const updates = {};
        
        // Map processed data to form fields
        Object.keys(addressData).forEach(key => {
            if (addressData[key] !== null && 
                addressData[key] !== undefined && 
                addressData[key] !== '' &&
                this.props.record.fields[key]) {
                updates[key] = addressData[key];
            }
        });
        
        if (Object.keys(updates).length > 0) {
            console.log('Updating form fields:', updates);
            this.props.record.update(updates);
            
            // Also directly update HTML form elements for immediate visual feedback
            this.updateHTMLFields(addressData);
        }
    }
    
    /**
     * Directly update HTML form field elements by their IDs
     * This ensures immediate visual feedback when Google Places populates fields
     */
    updateHTMLFields(addressData) {
        try {
            // Update street field (street_0)
            if (addressData.street) {
                this.updateFieldById('street_0', addressData.street);
            }
            
            // Update street2 field (street2_0)
            if (addressData.street2) {
                this.updateFieldById('street2_0', addressData.street2);
            }
            
            // Update city field (city_0)
            if (addressData.city) {
                this.updateFieldById('city_0', addressData.city);
            }
            
            // Update zip field (zip_0)
            if (addressData.zip) {
                this.updateFieldById('zip_0', addressData.zip);
            }
            
            // Update state field (state_id_0) - Many2one field
            if (addressData.state_id) {
                this.updateMany2oneField('state_id_0', addressData.state_id, addressData.state_name || '');
            }
            
            // Update country field (country_id_0) - Many2one field
            if (addressData.country_id) {
                this.updateMany2oneField('country_id_0', addressData.country_id, addressData.country_name || '');
            }
            
        } catch (error) {
            console.warn('Error updating HTML fields directly:', error);
        }
    }
    
    /**
     * Update a simple field by ID
     */
    updateFieldById(fieldId, value) {
        const element = document.getElementById(fieldId);
        if (element) {
            element.value = value;
            // Trigger change event to notify Odoo
            element.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`Updated ${fieldId} with value:`, value);
        } else {
            console.warn(`Field element ${fieldId} not found in DOM`);
        }
    }
    
    /**
     * Update a Many2one field by ID (these are typically select elements or have hidden inputs)
     */
    updateMany2oneField(fieldId, recordId, displayName) {
        // Try to find the Many2one field container
        const fieldContainer = document.getElementById(fieldId);
        if (!fieldContainer) {
            console.warn(`Many2one field container ${fieldId} not found in DOM`);
            return;
        }
        
        // Look for the input element within the container
        const inputElement = fieldContainer.querySelector('input[type="text"], input[type="hidden"], select');
        if (inputElement) {
            if (inputElement.tagName.toLowerCase() === 'select') {
                // Handle select dropdown
                inputElement.value = recordId;
            } else {
                // Handle text input (typical for Many2one)
                inputElement.value = displayName;
                // Set data attribute for the ID
                inputElement.setAttribute('data-id', recordId);
            }
            
            // Trigger change event
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`Updated Many2one ${fieldId} with ID: ${recordId}, Name: ${displayName}`);
        } else {
            console.warn(`Input element not found within Many2one field ${fieldId}`);
        }
    }
    
    /**
     * Map country names to ISO codes for Google Places API
     */
    getCountryCode(countryName) {
        const countryMapping = {
            'South Africa': 'za',
            'United States': 'us',
            'United Kingdom': 'gb',
            'Canada': 'ca',
            'Australia': 'au'
        };
        
        return countryMapping[countryName] || ''; // No default - use what's configured
    }
    
    /**
     * Determine if Google Places field should be shown
     */
    get shouldShowField() {
        return this.state.isAuthorized && 
               this.state.companyConfig && 
               this.state.companyConfig.enabled;
    }
    
    /**
     * Get current status for display
     */
    get statusMessage() {
        if (this.state.isLoading) {
            return 'Loading Google Places...';
        }
        
        if (this.state.error) {
            return `Error: ${this.state.error}`;
        }
        
        if (!this.state.isAuthorized) {
            return 'Google Places not enabled for this company';
        }
        
        if (this.state.isLoaded) {
            return '✓ Google Places ready';
        }
        
        return 'Initializing Google Places...';
    }
    
    /**
     * Hide dropdown cleanly using Google Places API best practices
     */
    hideDropdownCleanly() {
        try {
            // Method 1: Use Google's own method to hide dropdown
            if (this.inputRef.el) {
                // Remove focus from input to trigger dropdown hide
                this.inputRef.el.blur();
            }
            
            // Method 2: Hide dropdown containers with CSS
            const dropdowns = document.querySelectorAll('.pac-container');
            dropdowns.forEach(dropdown => {
                dropdown.style.display = 'none';
                dropdown.style.visibility = 'hidden';
                dropdown.classList.add('hide-dropdown');
            });
            
        } catch (error) {
            console.warn('Error hiding dropdown:', error);
        }
    }
    
    /**
     * Show dropdown when input becomes active (called automatically by Google Places)
     */
    showDropdownForInput() {
        try {
            const dropdowns = document.querySelectorAll('.pac-container');
            dropdowns.forEach(dropdown => {
                dropdown.style.display = '';
                dropdown.style.visibility = 'visible';
                dropdown.classList.remove('hide-dropdown');
            });
        } catch (error) {
            console.warn('Error showing dropdown:', error);
        }
    }
    
    /**
     * Clear autocomplete dropdown (legacy method for backward compatibility)
     */
    clearAutocompleteDropdown() {
        this.hideDropdownCleanly();
    }
    
    /**
     * Clear input field and hide dropdown cleanly
     */
    clearInputAndDropdown() {
        try {
            if (this.inputRef.el) {
                this.inputRef.el.value = '';
                this.inputRef.el.blur();
            }
            
            // Hide dropdown after clearing input
            setTimeout(() => {
                this.hideDropdownCleanly();
            }, 50);
            
        } catch (error) {
            console.warn('Error clearing input and dropdown:', error);
        }
    }
    
    /**
     * Cleanup method called on component unmount
     */
    cleanup() {
        this.isMounted = false;
        
        // Hide any remaining dropdowns cleanly
        this.hideDropdownCleanly();
        
        // Remove autocomplete listeners if they exist
        if (this.state.autocomplete && window.google) {
            try {
                google.maps.event.clearInstanceListeners(this.state.autocomplete);
            } catch (error) {
                console.warn('Error cleaning up autocomplete listeners:', error);
            }
        }
    }
}

// Template name for this component
GooglePlacesField.template = "google_places_address.GooglePlacesField";

// Component props definition
GooglePlacesField.props = {
    record: Object,
    name: { type: String, optional: true },
    placeholder: { type: String, optional: true }
};

// Register the field widget in the registry
registry.category("fields").add("google_places_autocomplete", GooglePlacesField);
