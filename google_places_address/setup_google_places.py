#!/usr/bin/env python3
"""
Google Places API Configuration Setup Script
Run this script to configure the Google Places API settings for your company.
"""

# Configuration values - REPLACE WITH YOUR VALUES
GOOGLE_PLACES_API_KEY = "YOUR_GOOGLE_PLACES_API_KEY_HERE"
COMPANY_ID = 1  # Replace with your company ID

# System parameters to set
SYSTEM_PARAMETERS = [
    {
        'key': f'google.places.enabled.company_{COMPANY_ID}',
        'value': 'True',
        'description': 'Enable Google Places for your company'
    },
    {
        'key': f'google.places.api.key.company_{COMPANY_ID}',
        'value': GOOGLE_PLACES_API_KEY,
        'description': 'Google Places API key for your company'
    },
    {
        'key': 'google.places.default_company_id',
        'value': str(COMPANY_ID),
        'description': 'Default company ID configuration'
    }
]

def setup_odoo_parameters():
    """
    Set up system parameters in Odoo.
    This function can be run in Odoo shell or copied to a data file.
    """
    print("=== Google Places API Configuration ===")
    print(f"Company ID: {COMPANY_ID}")
    print(f"API Key: {GOOGLE_PLACES_API_KEY[:20]}..." if len(GOOGLE_PLACES_API_KEY) > 20 else GOOGLE_PLACES_API_KEY)
    print()
    
    # SQL commands to insert/update system parameters
    sql_commands = []
    
    for param in SYSTEM_PARAMETERS:
        sql = f"""
INSERT INTO ir_config_parameter (key, value, create_uid, create_date, write_uid, write_date)
VALUES ('{param['key']}', '{param['value']}', 1, NOW(), 1, NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    write_uid = EXCLUDED.write_uid,
    write_date = EXCLUDED.write_date;
"""
        sql_commands.append(sql)
        print(f"✓ {param['description']}")
        print(f"  Key: {param['key']}")
        print(f"  Value: {param['value']}")
        print()
    
    print("=== SQL Commands (run in database) ===")
    for sql in sql_commands:
        print(sql)
    
    print("\n=== Manual Setup Instructions ===")
    print("Go to: Settings → Technical → Parameters → System Parameters")
    print("Add these parameters:")
    for param in SYSTEM_PARAMETERS:
        print(f"- Key: {param['key']}")
        print(f"  Value: {param['value']}")
        print()

if __name__ == "__main__":
    setup_odoo_parameters()