/** @odoo-module **/

import { Component, useState, onMounted, useRef, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

/**
 * Google Places Field Widget
 * Provides address autocomplete functionality with multi-company support
 */
export class GooglePlacesField extends Component {
    static template = "google_places_address.GooglePlacesField";
    static props = {
        ...standardFieldProps,
        placeholder: { type: String, optional: true },
    };
    
    setup() {
        this.inputRef = useRef("googlePlacesInput");
        
        this.state = useState({
            isLoaded: false,
            autocomplete: null,
            isAuthorized: false,
            companyConfig: null,
            isLoading: false,
            error: null,
            initialized: false
        });
        
        // Track if component is mounted to avoid state updates after unmount
        this.isMounted = true;
        
        // Don't get services in setup - they may not be available yet
        // We'll get them lazily when needed (on user interaction)
        
        onMounted(() => {
            // Just mark as initialized - services will be accessed on first interaction
            if (this.isMounted) {
                this.state.initialized = true;
                this.state.isLoading = false;
            }
        });
        
        onWillUnmount(() => {
            this.cleanup();
        });
    }
    
    /**
     * Get ORM service for making RPC calls through the record's model
     */
    getOrm() {
        if (this.props.record && this.props.record.model && this.props.record.model.orm) {
            return this.props.record.model.orm;
        }
        throw new Error('ORM service not available');
    }
    
    /**
     * Make RPC call using the proper Odoo 18 pattern for field widgets
     */
    async rpcCall(route, params) {
        const orm = this.getOrm();
        return orm.call(params.model, params.method, params.args || [], params.kwargs || {});
    }
    
    /**
     * Get notification service lazily from environment
     */
    getNotificationService() {
        if (this.env && this.env.services && this.env.services.notification) {
            return this.env.services.notification;
        }
        // Return a no-op if not available
        return {
            add: () => {}
        };
    }
    
    /**
     * Ensure services are available and initialize if not done yet
     */
    async ensureInitialized() {
        if (this.state.isAuthorized || this.state.error) {
            return; // Already initialized
        }
        
        if (this.state.isLoading) {
            return; // Already initializing
        }
        
        await this.initializeGooglePlaces();
    }
    
    /**
     * Initialize Google Places functionality with company validation
     */
    async initializeGooglePlaces() {
        try {
            this.state.isLoading = true;
            await this.checkCompanyAccess();
            
            if (this.state.isAuthorized && this.state.companyConfig?.enabled) {
                await this.loadGoogleMapsAPI();
            }
            
            // Mark as initialized even if not authorized (field will be disabled)
            if (this.isMounted) {
                this.state.initialized = true;
                this.state.isLoading = false;
            }
        } catch (error) {
            console.error('Error initializing Google Places:', error);
            if (this.isMounted) {
                this.state.error = error.message || 'Failed to initialize Google Places';
                this.state.isLoading = false;
                this.state.initialized = true;
            }
        }
    }
    
    /**
     * Check if current company has access to Google Places API
     */
    async checkCompanyAccess() {
        try {
            // Get company configuration and permissions using ORM
            const config = await this.rpcCall('/web/dataset/call_kw', {
                model: 'res.partner',
                method: 'get_google_places_config',
                args: [],
                kwargs: {}
            });
            
            if (!this.isMounted) return;
            
            this.state.companyConfig = config;
            
            // Check for errors in configuration
            if (config.error) {
                this.state.isAuthorized = false;
                this.state.error = config.error;
                this.state.isLoading = false;
                return;
            }
            
            // Validate company configuration
            if (!config.enabled) {
                this.state.isAuthorized = false;
                this.state.isLoading = false;
                // Show helpful message from backend if available
                if (config.message) {
                    this.state.error = config.message;
                }
                return;
            }
            
            if (!config.api_key) {
                this.state.isAuthorized = false;
                this.state.error = 'Google Places API key not configured. Please configure in Settings.';
                this.state.isLoading = false;
                return;
            }
            
            this.state.isAuthorized = true;
            
        } catch (error) {
            if (this.isMounted) {
                this.state.isAuthorized = false;
                this.state.error = error.data?.message || error.message || 'Failed to load Google Places configuration';
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
            }
            
            const autocomplete = new google.maps.places.Autocomplete(input, autocompleteOptions);
            
            // Add place change listener - this is the primary event for place selection
            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                
                // Only process if we have a valid place with geometry
                if (place && place.geometry) {
                    this.handlePlaceChange(place);
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
            // Get notification service
            const notification = this.getNotificationService();
            
            // Show processing notification
            notification.add(
                'Processing address...', 
                { type: 'info' }
            );
            
            // Extract only serializable data from the place object
            // The Google Maps API place object contains functions and circular refs that can't be JSON serialized
            const placeData = {
                place_id: place.place_id,
                formatted_address: place.formatted_address,
                address_components: place.address_components || [],
                geometry: place.geometry ? {
                    location: {
                        lat: typeof place.geometry.location.lat === 'function' 
                            ? place.geometry.location.lat() 
                            : place.geometry.location.lat,
                        lng: typeof place.geometry.location.lng === 'function' 
                            ? place.geometry.location.lng() 
                            : place.geometry.location.lng
                    }
                } : null
            };
            
            
            // Process place data through backend with company validation
            const addressData = await this.rpcCall('/web/dataset/call_kw', {
                model: 'res.partner',
                method: 'process_google_place_data',
                args: [placeData],
                kwargs: {}
            });
            
            if (!this.isMounted) return;
            
            // Update form fields with processed data
            await this.updateFormFields(addressData);
            
            // Show success notification
            notification.add(
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
            console.error('Error details:', error.data || error.message || error);
            
            if (!this.isMounted) return;
            
            const notification = this.getNotificationService();
            
            // Get detailed error message
            let errorMessage = 'Error processing address data. Please try again or enter manually.';
            
            if (error.data && error.data.message) {
                errorMessage = error.data.message;
            } else if (error.message) {
                if (error.message.includes('not available for this company')) {
                    errorMessage = 'Google Places API not available for your company';
                } else if (error.message.includes('permission')) {
                    errorMessage = 'You do not have permission to use Google Places API';
                } else {
                    errorMessage = error.message;
                }
            }
            
            notification.add(errorMessage, { type: 'danger' });
            
            // Hide dropdown on error but keep input value for user to see
            this.hideDropdownCleanly();
        }
    }
    
    /**
     * Update form fields with processed address data
     */
    async updateFormFields(addressData) {
        if (!this.props.record || !addressData) {
            return;
        }
        
        
        // We'll prepare scalar updates and handle Many2one fields specially.
        // Many2one fields in the web client should be passed as [id, display_name]
        // and the country must be set before state so state options reload correctly.
        const scalarUpdates = {};
        const relationalUpdates = {}; // many2one fields as [id, name]

        // Map processed data to form fields
        for (const [key, value] of Object.entries(addressData)) {
            // Skip null, undefined, empty strings, and fields not in the model
            if (value === null || value === undefined || value === '') {
                continue;
            }

            if (!this.props.record.fields[key]) {
                continue;
            }

            // Skip *_name fields as they're just for display, not model fields
            if (key.endsWith('_name')) {
                continue;
            }

            const fieldType = this.props.record.fields[key].type;
            if (fieldType === 'many2one') {
                // Expect addressData to contain <field> and <field>_name
                const nameKey = `${key.replace(/_id$/, '')}_name`;
                const displayName = addressData[`${key.replace(/_id$/, '')}_name`] || addressData[`${key}_name`] || '';

                if (typeof value === 'number' && value > 0) {
                    relationalUpdates[key] = [value, displayName];
                } else if (Array.isArray(value) && value.length >= 2) {
                    relationalUpdates[key] = [value[0], value[1]];
                }
            } else {
                // Regular field (Char, Float, etc.)
                scalarUpdates[key] = value;
            }
        }


        // If nothing to do, bail out
        if (Object.keys(scalarUpdates).length === 0 && Object.keys(relationalUpdates).length === 0) {
            return;
        }

        // We'll update scalar fields (and non-dependent relational fields) first together with country,
        // then apply state update after country is set so the state's domain refreshes properly.
        try {
            // Note: We're NOT using direct DOM updates (updateHTMLFields) anymore because
            // it can conflict with OWL's reactive rendering and cause duplicate fields.
            // The props.record.update() calls below handle all field updates properly.

            // If we have a country to set, we need to sequence updates to avoid field clearing
            if (relationalUpdates.country_id) {
                // Separate city, city_id, and zip from updates - they need to be set after country/state
                // to avoid being cleared by domain changes
                const { city, zip, ...scalarWithoutCityZip } = scalarUpdates;
                const { city_id, state_id, country_id, ...otherRelational } = relationalUpdates;
                
                // First batch: scalar fields (without city/zip) + country
                const firstBatch = { ...scalarWithoutCityZip, country_id };
                await this.props.record.update(firstBatch);

                // After country is set, if we also have state, set it now
                if (state_id) {
                    const stateBatch = { state_id };
                    await this.props.record.update(stateBatch);
                }
                
                // Now update city/city_id after country/state are set (prevents domain clearing)
                // city_id takes precedence over plain city field
                if (city_id) {
                    await this.props.record.update({ city_id });
                } else if (city) {
                    await this.props.record.update({ city });
                }
                
                // Now update zip after all location fields are set (prevents clearing)
                if (zip) {
                    await this.props.record.update({ zip });
                }
                
                // If there are other relational fields besides country/state/city_id, set them now
                if (Object.keys(otherRelational).length > 0) {
                    await this.props.record.update(otherRelational);
                }
            } else {
                // No country present - apply all updates at once (relational fields as arrays)
                const combined = { ...scalarUpdates, ...relationalUpdates };
                await this.props.record.update(combined);
            }

        } catch (error) {
            console.error('Error updating record:', error);
            throw error;
        }
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
            // Silently handle dropdown hide errors
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
            // Silently handle dropdown show errors
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
            // Silently handle clear errors
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
                // Silently handle cleanup errors
            }
        }
    }
}

// Register the field widget in the registry (Odoo 18 pattern)
export const googlePlacesField = {
    component: GooglePlacesField,
    supportedTypes: ["char"],
    extractProps: ({ attrs }) => ({
        placeholder: attrs.placeholder,
    }),
};

registry.category("fields").add("google_places_autocomplete", googlePlacesField);
