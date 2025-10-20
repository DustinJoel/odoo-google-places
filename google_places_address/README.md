# Google Places Address Autocomplete for Odoo

## Overview

This professional Odoo module integrates Google Places API to provide intelligent address autocomplete functionality. It enhances partner/customer forms with real-time address suggestions, improving data quality and reducing manual entry time.

## Features

### 🌍 Google Places Integration
- Real-time address autocomplete using Google Places API
- Automatic form population with structured address data
- Cost-optimized API usage with selective field requests
- GPS coordinates extraction for mapping and logistics

### 🏢 Multi-Company Support
- Configurable per company
- Company-specific API key configuration
- Independent settings for each company in your Odoo instance

### ⚙️ Advanced Configuration
- Enable/disable per company basis
- Optional usage tracking and limits for cost control
- Configurable country restrictions
- Easy setup through Settings interface

## Installation

1. Copy the `google_places_address` module to your Odoo addons directory
2. Update the app list in Odoo: Apps → Update Apps List
3. Install the "Google Places Address Autocomplete" module
4. Configure Google Places API key in Settings (see Configuration section)

## Configuration

### Step 1: Google Cloud Setup
1. Create or use an existing [Google Cloud Platform project](https://console.cloud.google.com/)
2. Enable the following APIs:
   - Places API (New)
   - Maps JavaScript API
3. Create an API key with appropriate restrictions:
   - Restrict to your domain for security
   - Enable only required APIs
4. Set up billing account (Google Places uses pay-per-use pricing)

### Step 2: Odoo Configuration
1. Go to Settings → General Settings
2. Find "Google Places API Integration" section
3. Enable the feature
4. Enter your Google Places API key
5. (Optional) Configure country restriction
6. (Optional) Set monthly usage limit for cost control

## Usage

### For Enabled Companies
1. Open any partner/customer form
2. You'll see a "🌍 Search Address (Google Places)" field above the manual address fields
3. Start typing an address - Google will provide autocomplete suggestions
4. Select an address from the dropdown
5. All address fields will be automatically populated
6. GPS coordinates are stored for advanced features

### Manual Entry
- Manual address entry remains available as fallback
- Fields become editable when Google Places is not used
- No disruption to existing workflows

## Technical Details

### Database Fields Added
- `google_place_id`: Google's unique identifier for the place
- `latitude`/`longitude`: GPS coordinates for mapping/shipping
- `address_formatted`: Google's formatted address string
- `google_places_available`: Computed field for access control

### API Cost Optimization
- Only requests essential fields to minimize costs
- Country restrictions reduce irrelevant results
- Optional usage limits prevent unexpected charges
- Efficient caching of place data

### Security Features
- API key stored securely in system parameters
- Never exposed to client browser
- User permission checks
- Company-based access control
- Graceful error handling

## Troubleshooting

### "API key not configured"
- Go to Settings → General Settings
- Configure the Google Places API key for your company
- Ensure the API key has proper permissions in Google Cloud Console

### Autocomplete not working
- Check browser console for JavaScript errors
- Verify Google Maps API is loading correctly
- Confirm API key has Places API enabled in Google Cloud Console
- Check that feature is enabled in Settings

### Address not populating correctly
- Some addresses may not have complete data in Google Places
- Manual entry is always available as fallback
- Check that all required address components are available

### Billing/Usage Concerns
- Monitor usage in Google Cloud Console
- Set monthly usage limits in Odoo settings
- Configure country restrictions to reduce API calls

## Support

For technical issues or feature requests:
1. Check the Odoo logs for detailed error messages
2. Verify Google Cloud Console for API usage and quotas
3. Contact your module vendor or system administrator

## License

LGPL-3 - See LICENSE file for details.

## Requirements

- Odoo 17.0
- Python `requests` library
- Valid Google Places API key
- Active Google Cloud billing account
