# Deployment Guide - Google Places Address Module

## Pre-Deployment Checklist

### Module Structure
- [x] `__manifest__.py` - Module configuration
- [x] `__init__.py` - Module initialization
- [x] `models/` - Python models
  - [x] `res_partner.py` - Partner model extension
  - [x] `res_config_settings.py` - Configuration settings
- [x] `views/` - XML views
  - [x] `res_partner_views.xml` - Partner form extension
  - [x] `res_config_settings_views.xml` - Settings interface
- [x] `data/` - Configuration data
  - [x] `ir_config_parameter.xml` - Default parameters
- [x] `static/src/` - Frontend assets
  - [x] `js/` - JavaScript files
  - [x] `css/` - Styling
- [x] `security/` - Access control
  - [x] `ir.model.access.csv` - Model permissions
- [x] `README.md` - Documentation

### Multi-Company Configuration
- [x] Module works for any company
- [x] Company-specific API keys
- [x] Company-specific settings
- [x] Configuration through Settings UI

## Deployment Steps

### 1. Module Installation
```bash
# Copy module to Odoo addons directory
cp -r google_places_address /path/to/odoo/addons/

# Restart Odoo server
# Then: Apps → Update Apps List → Search "Google Places" → Install
```

### 2. Google Cloud Setup
1. Create or use existing [Google Cloud Platform project](https://console.cloud.google.com/)
2. Enable APIs:
   - Places API (New)
   - Maps JavaScript API
3. Create API key with restrictions:
   - HTTP referrer restrictions (your domain)
   - Enable only required APIs
4. Set up billing account

### 3. Odoo Configuration
1. Go to Settings → General Settings
2. Find "Google Places API Integration" section
3. Enable the feature
4. Enter Google Places API key
5. (Optional) Configure country restriction
6. (Optional) Set monthly usage limit

### 4. Testing Checklist
- [ ] Partner form shows Google Places search field when enabled
- [ ] Address autocomplete works correctly
- [ ] Form fields populate automatically upon selection
- [ ] GPS coordinates are stored properly
- [ ] Configuration settings save correctly
- [ ] Multiple companies can have different configurations
- [ ] Usage limits are respected (if configured)

### 5. User Training
- Inform users about new autocomplete feature
- Show how to use the search field above manual address entry
- Explain fallback to manual entry when needed
- Demonstrate country restriction feature if configured

## Post-Deployment Monitoring

### API Usage Tracking
- Monitor Google Cloud Console for API usage
- Watch for unexpected API charges
- Track usage against configured limits (if set)

### Error Monitoring
- Check Odoo logs for JavaScript errors
- Monitor server logs for API failures
- Watch for user permission issues

### Performance
- Monitor page load times on partner forms
- Check for JavaScript conflicts
- Verify mobile responsiveness

## Rollback Plan

If issues arise:
1. Disable feature in Settings (immediate)
2. Uninstall module if necessary
3. Manual address entry remains functional
4. No data loss (Google Places fields stored separately)

## Multi-Company Deployment

### Different Companies, Different Regions
Each company in your Odoo instance can have:
- Their own Google Places API key
- Different country restrictions
- Independent usage limits
- Separate enable/disable state

### Setup for Multiple Companies
1. Switch to Company A
2. Configure Google Places settings for Company A
3. Switch to Company B
4. Configure different settings for Company B
5. Each company's users see only their company's configuration

## Security Best Practices

1. **API Key Security**
   - Never commit API keys to version control
   - Use environment-specific keys (dev/staging/production)
   - Set up API key restrictions in Google Cloud Console

2. **Access Control**
   - Only users with Settings access can configure API keys
   - Regular users can use the feature once configured
   - API key is never exposed to client browsers

3. **Cost Control**
   - Set monthly usage limits
   - Configure country restrictions to reduce unnecessary calls
   - Monitor Google Cloud billing regularly

## Support

- **Technical Issues**: Contact your system administrator or module vendor
- **Google API Issues**: Check [Google Cloud Console](https://console.cloud.google.com/)
- **User Training**: Refer to README.md documentation

