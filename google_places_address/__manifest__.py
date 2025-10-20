# -*- coding: utf-8 -*-
{
    'name': 'Google Places Address',
    'version': '17.0.1.0.0',
    'category': 'Contact Management',
    'summary': 'Intelligent address autocomplete using Google Places API',
    'description': '''
        Google Places Address Autocomplete
        ===================================
        
        Transform your contact management with intelligent address autocomplete powered by 
        Google Places API. This module provides a seamless, professional address entry 
        experience that saves time and reduces errors.
        
        Key Features:
        * Real-time address suggestions from Google Places API
        * Automatic form population with structured address data
        * Multi-company support with company-specific configuration
        * GPS coordinates for enhanced mapping and logistics
        * Cost-optimized API usage with field restrictions
        * Configurable country restrictions
        * Comprehensive error handling and retry logic
        
        Security & Performance:
        * API key protected - never exposed to client browser
        * Server-side rate limiting and caching
        * Company-specific API key configuration
        * User permission validation
        * Graceful fallback for manual entry
        
        Technical Implementation:
        * Server-side Google Places API integration
        * Modern OWL framework compatible
        * Proper exception handling with user-friendly messages
        * Exponential backoff for API retry logic
        * Session token support for cost optimization
        
        Configuration:
        * Easy setup via Settings menu
        * Set Google Places API key per company
        * Enable/disable per company basis
        * Optional usage tracking and limits
        * Country restriction options
        
        Perfect for businesses that handle many addresses daily and want to improve
        data quality while reducing manual data entry.
    ''',
    'author': 'Signals Not Noise',
    'website': 'https://www.signalsnotnoise.co.za/',
    'depends': [
        'base', 
        'contacts',
    ],
    'external_dependencies': {
        'python': ['requests'],
    },
    'data': [
        'security/ir.model.access.csv',
        'data/google_places_config.xml',
        'views/res_partner_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'google_places_address/static/src/css/google_places.css',
            'google_places_address/static/src/js/google_places_field.js',
        ],
    },
    'images': [
        'static/description/icon.png',
        'static/description/screenshot_1.png',
        'static/description/screenshot_2.png',
        'static/description/screenshot_3.png',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
    'price': 25.00,
    'currency': 'EUR',
    'support': 'sales@signalsnotnoise.co.za',
}
