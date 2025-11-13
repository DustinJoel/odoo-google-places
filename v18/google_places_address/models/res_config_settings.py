# -*- coding: utf-8 -*-

from odoo import models, fields, api

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'
    
    google_places_enabled = fields.Boolean(
        string="Enable Google Places API",
        help="Enable Google Places address autocomplete for your company",
        config_parameter='google_places_address.enabled'
    )
    
    google_places_api_key = fields.Char(
        string="Google Places API Key",
        help="API key for Google Places service",
        config_parameter='google_places_address.api_key'
    )
    
    google_places_country_restriction = fields.Selection([
        ('', 'No Restriction'),
        ('us', 'United States'),
        ('gb', 'United Kingdom'),
        ('ca', 'Canada'),
        ('au', 'Australia'),
        ('za', 'South Africa'),
        ('de', 'Germany'),
        ('fr', 'France'),
        ('es', 'Spain'),
        ('it', 'Italy'),
        ('nl', 'Netherlands'),
        ('be', 'Belgium'),
        ('ch', 'Switzerland'),
        ('at', 'Austria'),
        ('ie', 'Ireland'),
        ('nz', 'New Zealand'),
    ], string="Country Restriction",
        default='',
        help="Restrict address suggestions to specific country",
        config_parameter='google_places_address.country_restriction'
    )
    
    google_places_usage_limit = fields.Integer(
        string="Monthly Usage Limit",
        default=1000,
        help="Monthly API call limit for cost control (0 = unlimited)",
        config_parameter='google_places_address.usage_limit'
    )
