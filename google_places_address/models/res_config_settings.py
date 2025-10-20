# -*- coding: utf-8 -*-

from odoo import models, fields, api

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'
    
    google_places_enabled = fields.Boolean(
        string="Enable Google Places API",
        help="Enable Google Places address autocomplete for your company"
    )
    
    google_places_api_key = fields.Char(
        string="Google Places API Key",
        help="API key for Google Places service"
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
        help="Restrict address suggestions to specific country"
    )
    
    google_places_usage_limit = fields.Integer(
        string="Monthly Usage Limit",
        default=1000,
        help="Monthly API call limit for cost control (0 = unlimited)"
    )
    
    @api.model
    def get_values(self):
        res = super(ResConfigSettings, self).get_values()
        company_id = self.env.company.id
        ICP = self.env['ir.config_parameter'].sudo()
        
        res.update({
            'google_places_enabled': ICP.get_param(f'google.places.enabled.company_{company_id}', 'False') == 'True',
            'google_places_api_key': ICP.get_param(f'google.places.api.key.company_{company_id}', ''),
            'google_places_country_restriction': ICP.get_param(f'google.places.country.company_{company_id}', ''),
            'google_places_usage_limit': int(ICP.get_param(f'google.places.usage_limit.company_{company_id}', '1000')),
        })
        return res
    
    def set_values(self):
        super(ResConfigSettings, self).set_values()
        company_id = self.env.company.id
        ICP = self.env['ir.config_parameter'].sudo()
        
        ICP.set_param(f'google.places.enabled.company_{company_id}', self.google_places_enabled)
        ICP.set_param(f'google.places.api.key.company_{company_id}', self.google_places_api_key or '')
        ICP.set_param(f'google.places.country.company_{company_id}', self.google_places_country_restriction or '')
        ICP.set_param(f'google.places.usage_limit.company_{company_id}', self.google_places_usage_limit or 1000)
