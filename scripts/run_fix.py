"""Wrapper to load .env.local and run fix_direction.py"""
import os, sys, json, base64

# Load .env.local
env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, _, val = line.partition('=')
        # Strip surrounding quotes
        val = val.strip()
        if val.startswith('"') and val.endswith('"'):
            val = val[1:-1]
        os.environ[key] = val

print(f"Loaded env from {env_path}")
print(f"TWILIO_ACCOUNT_SID: {os.environ.get('TWILIO_ACCOUNT_SID', 'NOT SET')[:10]}...")
print(f"GOOGLE_CREDENTIALS length: {len(os.environ.get('GOOGLE_CREDENTIALS', ''))}")

# Now run fix_direction
exec(open(os.path.join(os.path.dirname(__file__), 'fix_direction.py')).read())
