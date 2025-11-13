# -*- coding: utf-8 -*-

import logging
import json
import time
import requests

from odoo import models, fields, api
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)

class ResPartner(models.Model):
    _inherit = 'res.partner'
    
    # Google Places API fields - stored but access controlled
    google_places_place_id = fields.Char(
        string="Google Place ID", 
        help="Google Places API Place ID for address validation",
        index=True,
        groups="base.group_user"  # Allow regular users to read
    )
    
    # Computed field to determine if address fields should be readonly
    is_google_populated = fields.Boolean(
        string="Address from Google Places",
        compute="_compute_is_google_populated",
        store=False,
        help="Indicates if this address was populated from Google Places"
    )
    
    @api.depends('google_places_place_id')
    def _compute_is_google_populated(self):
        """Compute whether address was populated from Google Places"""
        for record in self:
            record.is_google_populated = bool(record.google_places_place_id)
    latitude = fields.Float(
        string="Latitude", 
        digits=(16, 6),
        help="GPS Latitude coordinate from Google Places"
    )
    longitude = fields.Float(
        string="Longitude", 
        digits=(16, 6),
        help="GPS Longitude coordinate from Google Places"
    )
    address_formatted = fields.Char(
        string="Formatted Address", 
        help="Google Places formatted address string"
    )
    
    # Search field for Google Places autocomplete (non-stored)
    google_places_search = fields.Char(
        string="🌍 Search Address (Google Places)",
        help="Type to search for addresses using Google Places API",
        store=False
    )
    
    # Computed field to determine if Google Places is available for current user/company
    google_places_available = fields.Boolean(
        string="Google Places Available",
        compute="_compute_google_places_available",
        store=False,
        help="Indicates if Google Places API is available for current company"
    )
    
    @api.depends_context('company')
    def _compute_google_places_available(self):
        """
        Compute whether Google Places API is available for current company.
        Checks if feature is enabled and API key is configured.
        """
        for record in self:
            try:
                current_company = self.env.company.id
                is_available = self._is_google_places_enabled_for_company(current_company)
                record.google_places_available = is_available
            except Exception as e:
                _logger.warning("Error computing Google Places availability: %s", str(e))
                record.google_places_available = False

    def _is_google_places_enabled_for_company(self, company_id):
        """
        Check if Google Places is properly configured and enabled for specific company.
        Requires both enabled flag and valid API key.
        """
        try:
            ICP = self.env['ir.config_parameter'].sudo()
            enabled = ICP.get_param('google_places_address.enabled', 'false')
            api_key = ICP.get_param('google_places_address.api_key', '')
            return enabled.lower() == 'true' and bool(api_key.strip())
        except Exception as e:
            _logger.error("Error checking Google Places configuration: %s", str(e))
            return False

    def _validate_company_access(self):
        """
        Validate if the current company has access to Google Places API.
        Returns True if enabled and configured, False otherwise.
        """
        return self._can_use_google_places()
    
    def _can_use_google_places(self):
        """
        Check if current user has permision to use Google Places functionality.
        """
        if not self.env.user.has_group('base.group_user'):
            return False
        
        return self._is_google_places_enabled_for_company(self.env.company.id)

    def _get_google_places_api_key(self):
        """
        Retrieve the Google Places API key for the current company.
        """
        api_key = self.env['ir.config_parameter'].sudo().get_param('google_places_address.api_key', '')
        return api_key.strip() if api_key else None

    def _make_google_api_request(self, url, params, max_retries=3):
        """
        Make HTTP request to Google Places API with proper error handling and retries.
        Implements exponential backoff for rate limiting.
        """
        if not self._can_use_google_places():
            raise AccessError("Google Places API access denied for this company")
            
        api_key = self._get_google_places_api_key()
        if not api_key:
            raise UserError("Google Places API key not configured")
            
        # Add API key to parameters
        params['key'] = api_key
        
        last_exception = None
        current_delay = 0.1  # Start with 100ms delay
        max_delay = 5  # Maximum 5 seconds delay
        
        for attempt in range(max_retries):
            try:
                
                response = requests.get(url, params=params, timeout=10)
                response.raise_for_status()
                
                data = response.json()
                
                # Check Google API status
                if data.get('status') == 'OK':
                    return data
                elif data.get('status') == 'ZERO_RESULTS':
                    return data  # Valid response with no results
                elif data.get('status') in ['INVALID_REQUEST', 'REQUEST_DENIED']:
                    # These errors won't be fixed by retrying
                    raise UserError(f"Google Places API error: {data.get('error_message', data.get('status'))}")
                elif data.get('status') in ['OVER_QUERY_LIMIT', 'UNKNOWN_ERROR']:
                    # These might be temporary, retry
                    last_exception = UserError(f"Google Places API temporary error: {data.get('status')}")
                else:
                    last_exception = UserError(f"Google Places API error: {data.get('status')}")
                    
            except requests.exceptions.RequestException as e:
                last_exception = UserError(f"Network error calling Google Places API: {str(e)}")
            except json.JSONDecodeError as e:
                last_exception = UserError(f"Invalid response from Google Places API: {str(e)}")
            except Exception as e:
                last_exception = UserError(f"Unexpected error calling Google Places API: {str(e)}")
                
            # If we get here, we need to retry
            if attempt < max_retries - 1:  # Don't sleep on the last attempt
                time.sleep(current_delay)
                current_delay = min(current_delay * 2, max_delay)  # Exponential backoff
            
        # If we get here, all retries failed
        if last_exception:
            raise last_exception
        else:
            raise UserError("Google Places API request failed after all retries")

    def _make_google_api_request_new(self, url, request_body, headers, max_retries=3):
        """
        Make HTTP POST request to Google Places API (New) with proper error handling and retries.
        Implements exponential backoff for rate limiting.
        """
        if not self._can_use_google_places():
            raise AccessError("Google Places API access denied for this company")
            
        last_exception = None
        current_delay = 0.1  # Start with 100ms delay
        max_delay = 5  # Maximum 5 seconds delay
        
        for attempt in range(max_retries):
            try:
                
                response = requests.post(url, json=request_body, headers=headers, timeout=10)
                response.raise_for_status()
                
                data = response.json()
                
                # For the new API, success is indicated by a 200 status code
                # and the presence of expected fields in the response
                if response.status_code == 200:
                    return data
                else:
                    last_exception = UserError(f"Google Places API (New) error: HTTP {response.status_code}")
                    
            except requests.exceptions.RequestException as e:
                last_exception = UserError(f"Network error calling Google Places API (New): {str(e)}")
            except json.JSONDecodeError as e:
                last_exception = UserError(f"Invalid response from Google Places API (New): {str(e)}")
            except Exception as e:
                last_exception = UserError(f"Unexpected error calling Google Places API (New): {str(e)}")
                
            # If we get here, we need to retry
            if attempt < max_retries - 1:  # Don't sleep on the last attempt
                _logger.warning("Google Places API (New) request failed, retrying in %s seconds: %s", 
                              current_delay, last_exception)
                time.sleep(current_delay)
                current_delay = min(current_delay * 2, max_delay)  # Exponential backoff
            
        # If we get here, all retries failed
        if last_exception:
            raise last_exception
        else:
            raise UserError("Google Places API (New) request failed after all retries")



    @api.model
    def search_google_places(self, query, session_token=None):
        """
        Search Google Places API for autocomplete suggestions using latest API (New)
        Company-aware search with proper error handling and session management
        Using field masking for cost optimization as per Google best practices
        """
        if not query or len(query.strip()) < 2:
            return {'status': 'error', 'message': 'Query too short', 'predictions': []}
            
        # Company validation
        if not self._validate_company_access():
            return {'status': 'error', 'message': 'Access denied for company', 'predictions': []}
        
        try:
            # Get API key for the company
            api_key = self._get_google_places_api_key()
            if not api_key:
                return {'status': 'error', 'message': 'Google Places API key not configured', 'predictions': []}
            
            # Generate session token if not provided (UUID4 recommended by Google)
            if not session_token:
                import uuid
                session_token = str(uuid.uuid4())
            
            # Use the new Places API (New) autocomplete endpoint
            url = 'https://places.googleapis.com/v1/places:autocomplete'
            
            # Get country restriction from company settings
            country_restriction = self.env['ir.config_parameter'].sudo().get_param('google_places_address.country_restriction', '')
            
            # Request body for POST request (new API format)
            request_body = {
                'input': query.strip(),
                'sessionToken': session_token,
                'languageCode': 'en',
                'includedPrimaryTypes': ['street_address', 'establishment', 'premise'],
            }
            
            # Add country restriction if configured
            if country_restriction:
                request_body['regionCode'] = country_restriction.upper()
                request_body['includedRegionCodes'] = [country_restriction.upper()]
            
            # Headers for new API with field masking for cost optimization
            headers = {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': api_key,
                'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat'
            }
            
            response_data = self._make_google_api_request_new(url, request_body, headers=headers)
            
            if 'suggestions' in response_data:
                suggestions = response_data.get('suggestions', [])
                
                # Format results for frontend consumption (compatible with widget)
                formatted_results = []
                for suggestion in suggestions:
                    place_prediction = suggestion.get('placePrediction', {})
                    if place_prediction:
                        structured_format = place_prediction.get('structuredFormat', {})
                        formatted_results.append({
                            'place_id': place_prediction.get('placeId'),
                            'description': place_prediction.get('text', {}).get('text', ''),
                            'main_text': structured_format.get('mainText', {}).get('text', ''),
                            'secondary_text': structured_format.get('secondaryText', {}).get('text', ''),
                            'session_token': session_token,  # Include session token for place details
                        })
                
                return {
                    'status': 'success',
                    'suggestions': response_data.get('suggestions', []),  # Return raw suggestions for widget
                    'predictions': formatted_results,  # Keep legacy format for backward compatibility  
                    'session_token': session_token
                }
            else:
                error_msg = response_data.get('error', {}).get('message', 'Unknown API error')
                _logger.warning(f"Google Places API error: {error_msg}")
                return {'status': 'error', 'message': error_msg, 'predictions': []}
                
        except Exception as e:
            _logger.error(f"Error in search_google_places: {str(e)}", exc_info=True)
            return {'status': 'error', 'message': 'Search service temporarily unavailable', 'predictions': []}

    def populate_from_google_place(self, place_id, session_token=None):
        """
        Fetch detailed place information using Google Places API (New) and populate address fields.
        Uses session token for billing optimization and field masking for cost control.
        """
        if not place_id:
            raise UserError("Place ID is required")
            
        try:
            # Use the new Places API (New) endpoint for place details
            url = f"https://places.googleapis.com/v1/places/{place_id}"
            
            # Get API key
            api_key = self._get_google_places_api_key()
            if not api_key:
                raise UserError("Google Places API key not configured")
            
            # Headers for new API with field masking for cost optimization
            headers = {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': api_key,
                'X-Goog-FieldMask': 'id,displayName,formattedAddress,addressComponents,location'
            }
            
            # Add session token as URL parameter if provided
            params = {}
            if session_token:
                params['sessionToken'] = session_token
                
            # Make request using new API method
            if params:
                url += '?' + '&'.join([f"{k}={v}" for k, v in params.items()])
                
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if not data.get('id'):
                raise UserError("No place details found for the selected address")
                
            # Parse new API response format with enhanced debugging
            address_components_raw = data.get('addressComponents', [])
            
            address_components = self._parse_address_components_new(address_components_raw)
            
            # Update address fields with detailed field-by-field logging
            street_address = self._build_street_address(address_components)
            city = address_components.get('locality') or address_components.get('sublocality_level_1', '')
            
            # Street 2 logic - prioritize area/neighborhood names over apartment numbers
            street2 = (
                address_components.get('sublocality_level_1') or  # Area/neighborhood
                address_components.get('sublocality_level_2') or  # Secondary area
                address_components.get('sublocality') or          # Generic sublocality
                address_components.get('subpremise') or           # Apartment/unit numbers
                address_components.get('administrative_area_level_2') or  # District
                ''
            )
            
            vals = {
                'google_places_place_id': data.get('id'),
                'address_formatted': data.get('formattedAddress'),
                'street': street_address,
                'street2': street2,
                'city': city,
                'zip': address_components.get('postal_code', ''),
            }
            
            # Handle location (coordinates) - new API format
            location = data.get('location', {})
            if location:
                vals.update({
                    'latitude': location.get('latitude'),
                    'longitude': location.get('longitude'),
                })
                
            # Handle state/province (find matching Odoo state)
            state_name = address_components.get('administrative_area_level_1')
            country_code = address_components.get('country_code')
            
            if state_name and country_code:
                state_id = self._find_state_id(state_name, country_code.upper())
                if state_id:
                    vals['state_id'] = state_id
                else:
                    _logger.warning("Failed to find state for '%s' in %s", state_name, country_code)
                
            # Handle country - try from address components
            country_code = address_components.get('country_code')
            country_name = address_components.get('country')
            
            country = None
            if country_code:
                country = self.env['res.country'].search([('code', '=', country_code.upper())], limit=1)
            elif country_name:
                country = self.env['res.country'].search([('name', 'ilike', country_name)], limit=1)
            
            if country:
                vals['country_id'] = country.id
            else:
                _logger.warning("Could not find country in address components")
                
            # Update the record
            self.write(vals)
            
            
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'Address Updated',
                    'message': f'Address populated from: {data.get("formattedAddress", "Google Places")}',
                    'type': 'success',
                }
            }
            
        except Exception as e:
            _logger.error("Error populating address from Google Place %s: %s", place_id, str(e))
            raise UserError(f"Error processing address data: {str(e)}") from e

    def _parse_address_components(self, components):
        """
        Parse Google's address_components into a structured dictionary.
        """
        parsed = {}
        
        for component in components:
            types = component.get('types', [])
            long_name = component.get('long_name', '')
            short_name = component.get('short_name', '')
            
            # Map Google's component types to our fields
            if 'street_number' in types:
                parsed['street_number'] = long_name
            elif 'route' in types:
                parsed['route'] = long_name
            elif 'subpremise' in types:
                parsed['subpremise'] = long_name
            elif 'locality' in types:
                parsed['locality'] = long_name
            elif 'sublocality_level_1' in types:
                parsed['sublocality_level_1'] = long_name
            elif 'administrative_area_level_1' in types:
                parsed['administrative_area_level_1'] = long_name
            elif 'postal_code' in types:
                parsed['postal_code'] = long_name
            elif 'country' in types:
                parsed['country'] = long_name
                parsed['country_code'] = short_name
                
        return parsed

    def _parse_address_components_new(self, components):
        """
        Parse Google's address_components from the new Places API (New) format.
        Handles various address component types including street, city, state/province, and country.
        """
        parsed = {}
        
        for component in components:
            types = component.get('types', [])
            long_name = component.get('longText', '')
            short_name = component.get('shortText', '')
            
            # Map Google's component types to our fields
            if 'street_number' in types:
                parsed['street_number'] = long_name
            elif 'route' in types:
                parsed['route'] = long_name
            elif 'subpremise' in types:
                # Traditional apartment/suite/unit numbers
                parsed['subpremise'] = long_name
            elif 'sublocality_level_1' in types:
                # This is often the area/neighborhood (like "Briardene") that should go in Street 2
                parsed['sublocality_level_1'] = long_name
            elif 'sublocality_level_2' in types:
                parsed['sublocality_level_2'] = long_name
            elif 'sublocality' in types:
                # Generic sublocality
                parsed['sublocality'] = long_name
            elif 'locality' in types:
                # Main city (like "Durban North")
                parsed['locality'] = long_name
            elif 'administrative_area_level_2' in types:
                # Sometimes used for districts/areas
                parsed['administrative_area_level_2'] = long_name
            elif 'administrative_area_level_1' in types:
                # Province/state
                parsed['administrative_area_level_1'] = long_name
            elif 'postal_code' in types:
                parsed['postal_code'] = long_name
            elif 'country' in types:
                parsed['country'] = long_name
                parsed['country_code'] = short_name
        
        # Log all components for debugging
        
        return parsed

    def _build_street_address(self, components):
        """
        Build the street address from components.
        """
        parts = []
        
        if components.get('street_number'):
            parts.append(components['street_number'])
        if components.get('route'):
            parts.append(components['route'])
            
        return ' '.join(parts)

    def _find_state_id(self, state_name, country_code):
        """
        Find the Odoo state/province record based on the state name and country.
        Attempts exact match first, then partial match.
        """
        if not state_name or not country_code:
            return False
        
        # Try exact match on name
        state = self.env['res.country.state'].search([
            ('name', '=ilike', state_name),
            ('country_id.code', '=', country_code)
        ], limit=1)
        
        if state:
            return state.id
            
        # Try partial match
        state = self.env['res.country.state'].search([
            ('name', 'ilike', state_name),
            ('country_id.code', '=', country_code)
        ], limit=1)
        
        if state:
            return state.id
            
        return False

    def _find_or_create_city_id(self, city_name, state_id, country_id, zipcode=None):
        """
        Find or create a res.city record for the given city name, state, and country.
        Used when base_address_extended module is installed.
        
        Args:
            city_name (str): Name of the city
            state_id (int): ID of the state (res.country.state)
            country_id (int): ID of the country (res.country)
            zipcode (str, optional): ZIP/postal code
            
        Returns:
            int or False: ID of the res.city record, or False if not found/created
        """
        if not city_name or not country_id:
            return False
        
        # Check if res.city model exists (base_address_extended installed)
        if 'res.city' not in self.env:
            return False
        
        try:
            # Search for existing city
            domain = [
                ('name', '=ilike', city_name),
                ('country_id', '=', country_id)
            ]
            
            if state_id:
                domain.append(('state_id', '=', state_id))
            
            city = self.env['res.city'].search(domain, limit=1)
            
            if city:
                return city.id
            
            # Create new city if not found
            city_vals = {
                'name': city_name,
                'country_id': country_id,
            }
            
            if state_id:
                city_vals['state_id'] = state_id
            
            if zipcode:
                city_vals['zipcode'] = zipcode
            
            city = self.env['res.city'].create(city_vals)
            return city.id
            
        except Exception as e:
            _logger.error("Error finding/creating city '%s': %s", city_name, str(e))
            return False

    @api.model
    def get_google_places_config(self, *args):
        """
        Return Google Places configuration for the current company.
        Used by frontend to determine if Google Places is available.
        """
        try:
            if not self._can_use_google_places():
                return {
                    'enabled': False,
                    'company_id': self.env.company.id,
                    'api_key': None,
                    'message': 'Google Places not available for this company'
                }
            
            # Get current company ID
            company_id = self.env.company.id
            
            # Get API key for current company
            api_key = self.env['ir.config_parameter'].sudo().get_param('google_places_address.api_key', '')
            
            # Get country restriction setting for this company
            country_code = self.env['ir.config_parameter'].sudo().get_param('google_places_address.country_restriction', '')
            
            return {
                'enabled': True,
                'api_key': api_key,
                'company_id': company_id,
                'country_restriction': country_code,
            }
            
        except Exception as e:
            _logger.error("Error getting Google Places config: %s", str(e))
            return {
                'enabled': False,
                'company_id': self.env.company.id,
                'api_key': None,
                'message': f'Configuration error: {str(e)}'
            }

    @api.model
    def process_google_place_data(self, place_data):
        """
        Process Google Places API response data into Odoo partner fields.
        Validates company access and transforms address components.
        
        Args:
            place_data (dict): Google Places API response data
            
        Returns:
            dict: Processed address data for Odoo fields
            
        Raises:
            UserError: If place data is invalid or user lacks permissions
        """
        # Validate user permissions
        if not self._can_use_google_places():
            raise UserError(
                "Google Places API is not enabled for your company. "
                "Please contact your administrator to configure it in Settings."
            )
        
        # Validate input data
        if not place_data or not isinstance(place_data, dict):
            raise UserError("Invalid place data received from Google Places API")
        
        try:
            # Extract address components and geometry
            address_components = place_data.get('address_components', [])
            geometry = place_data.get('geometry', {}).get('location', {})
            
            if not address_components:
                raise UserError("No address components found in place data")
            
            # Initialize result with coordinates and metadata
            result = {
                'latitude': geometry.get('lat'),
                'longitude': geometry.get('lng'),
                'google_places_place_id': place_data.get('place_id'),
                'address_formatted': place_data.get('formatted_address', '')
            }
            
            # Process address components
            street_number = ''
            route = ''
            sublocality_parts = []  # Collect sublocality components for street2
            
            for component in address_components:
                types = component.get('types', [])
                long_name = component.get('long_name', '').strip()
                short_name = component.get('short_name', '').strip()
                
                if not long_name:
                    continue
                
                # Map Google Places component types to Odoo fields
                if 'street_number' in types:
                    street_number = long_name
                elif 'route' in types:
                    route = long_name
                elif 'locality' in types:
                    # Primary city name
                    result['city'] = long_name
                    result['_city_name'] = long_name  # Store for city_id lookup later
                elif 'sublocality_level_1' in types:
                    # For places like Brooklyn, use sublocality as city if locality not found
                    if 'city' not in result:
                        result['city'] = long_name
                        result['_city_name'] = long_name  # Store for city_id lookup later
                    else:
                        # Add to sublocality parts for street2
                        sublocality_parts.append(long_name)
                elif 'administrative_area_level_1' in types:
                    # Find matching state/province using the country from address components
                    # Extract country code from the address components for state lookup
                    country_code = None
                    for comp in address_components:
                        if 'country' in comp.get('types', []):
                            country_code = comp.get('short_name', '').strip()
                            break
                    
                    if country_code and long_name:
                        state_id = self._find_state_id(long_name, country_code)
                        if state_id:
                            result['state_id'] = state_id
                            # Get state name for frontend display
                            state_record = self.env['res.country.state'].browse(state_id)
                            if state_record.exists():
                                result['state_name'] = state_record.name
                elif 'country' in types:
                    # Find matching country
                    country = self._find_country_by_name_or_code(long_name, short_name)
                    if country:
                        result['country_id'] = country.id
                        result['country_name'] = country.name  # For frontend display
                elif 'postal_code' in types:
                    result['zip'] = long_name
                elif ('sublocality_level_1' in types or 
                      'sublocality_level_2' in types or 
                      'sublocality' in types or
                      'neighborhood' in types):
                    # Collect all sublocality components for comprehensive street2
                    sublocality_parts.append(long_name)
            
            # Build street2 from collected sublocality parts
            if sublocality_parts:
                result['street2'] = ', '.join(sublocality_parts)
            
            # Combine street number and route for main street field
            street_parts = []
            if street_number:
                street_parts.append(street_number)
            if route:
                street_parts.append(route)
            
            if street_parts:
                result['street'] = ' '.join(street_parts)
            
            # If we have a city name and country, try to find/create city_id (for base_address_extended)
            city_name = result.get('_city_name')
            if city_name and result.get('country_id'):
                city_id = self._find_or_create_city_id(
                    city_name=city_name,
                    state_id=result.get('state_id'),
                    country_id=result.get('country_id'),
                    zipcode=result.get('zip')
                )
                if city_id:
                    result['city_id'] = city_id
                    result['city_name'] = city_name  # For frontend display
            
            # Clean up internal keys
            result.pop('_city_name', None)
            
            return result
            
        except Exception as e:
            _logger.error("Error processing Google Places data: %s", str(e))
            raise UserError(f"Error processing address data: {str(e)}")
    
    def _find_country_by_name_or_code(self, country_name, country_code):
        """Find country by name or ISO code."""
        if not country_name and not country_code:
            return None
        
        # First try by ISO code (more reliable)
        if country_code:
            country = self.env['res.country'].search([
                ('code', '=', country_code.upper())
            ], limit=1)
            if country:
                return country
        
        # Fallback to name matching
        if country_name:
            # Try exact match first
            country = self.env['res.country'].search([
                ('name', '=', country_name)
            ], limit=1)
            
            if not country:
                # Try case-insensitive partial match
                country = self.env['res.country'].search([
                    ('name', 'ilike', country_name)
                ], limit=1)
            
            return country
        
        return None
