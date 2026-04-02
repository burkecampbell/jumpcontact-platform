"""
Fix Direction column in Ytica Google Sheet "Recordings" tab.

Problem: All rows show "outbound" because the recording leg in Twilio Flex
is always an outbound-dial from Twilio to the agent. The TRUE direction
depends on the original (parent) call.

Logic:
  - Fetch call details from Twilio for each CallSid
  - If call.direction == "inbound" → inbound
  - If call.direction starts with "outbound" AND call has parent_call_sid:
      → fetch parent direction (the parent is the real inbound leg)
  - If call.direction starts with "outbound" AND no parent → outbound
  - Cache parent lookups to avoid duplicate API calls
"""

import os, json, time, base64, hashlib, math, sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
import ssl

# Force unbuffered output
def log(msg):
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()

# ── Config ──────────────────────────────────────────────────────────────
SHEET_ID = "YOUR_SHEET_ID"
TAB_NAME = "Recordings"
DIRECTION_COL = 7  # 0-indexed, column H (Date=0, Time=1, CallSid=2, Agent=3, Client=4, Phone=5, Duration=6, Direction=7)

TWILIO_SID = os.environ["TWILIO_ACCOUNT_SID"]      # Required — no hardcoded secrets
TWILIO_TOKEN = os.environ["TWILIO_AUTH_TOKEN"]      # Required — no hardcoded secrets

GOOGLE_EMAIL = os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL", "your-service-account@your-project.iam.gserviceaccount.com")
GOOGLE_KEY_ENV = os.environ.get("GOOGLE_PRIVATE_KEY", "")
GOOGLE_CREDS_B64 = os.environ.get("GOOGLE_CREDENTIALS", "")

# ── SSL context (Windows sometimes has cert issues) ─────────────────
ctx = ssl.create_default_context()

# ── Google Auth (JWT → access token) ────────────────────────────────
def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def get_private_key():
    if GOOGLE_KEY_ENV:
        pem = GOOGLE_KEY_ENV.replace("\\n", "\n")
    elif GOOGLE_CREDS_B64:
        creds = json.loads(base64.b64decode(GOOGLE_CREDS_B64))
        pem = creds["private_key"]
    else:
        raise ValueError("No Google private key found")
    return pem

def sign_rs256(message: bytes, pem: str) -> bytes:
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        key = serialization.load_pem_private_key(pem.encode(), password=None)
        return key.sign(message, padding.PKCS1v15(), hashes.SHA256())
    except ImportError:
        # Fallback: use openssl CLI
        import subprocess, tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.pem', delete=False) as f:
            f.write(pem)
            pem_path = f.name
        proc = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", pem_path],
            input=message, capture_output=True
        )
        os.unlink(pem_path)
        if proc.returncode != 0:
            raise RuntimeError(f"openssl sign failed: {proc.stderr.decode()}")
        return proc.stdout

def get_google_token() -> str:
    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps({
        "iss": GOOGLE_EMAIL,
        "scope": "https://www.googleapis.com/auth/spreadsheets",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }).encode())
    signing_input = f"{header}.{payload}".encode()
    sig = b64url(sign_rs256(signing_input, get_private_key()))
    jwt = f"{header}.{payload}.{sig}"

    data = urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt,
    }).encode()
    req = Request("https://oauth2.googleapis.com/token", data=data,
                  headers={"Content-Type": "application/x-www-form-urlencoded"})
    resp = json.loads(urlopen(req, context=ctx).read())
    return resp["access_token"]

# ── Google Sheets helpers ───────────────────────────────────────────
def sheets_get(token: str, range_str: str):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range_str}"
    req = Request(url, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urlopen(req, context=ctx).read())

def sheets_update(token: str, range_str: str, values: list):
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range_str}?valueInputOption=RAW"
    data = json.dumps({"values": values}).encode()
    req = Request(url, data=data, method="PUT",
                  headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return json.loads(urlopen(req, context=ctx).read())

# ── Twilio helpers ──────────────────────────────────────────────────
twilio_auth_header = "Basic " + base64.b64encode(f"{TWILIO_SID}:{TWILIO_TOKEN}".encode()).decode()

def twilio_get_call(call_sid: str, retries=3) -> dict | None:
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Calls/{call_sid}.json"
    for attempt in range(retries):
        try:
            req = Request(url, headers={"Authorization": twilio_auth_header})
            return json.loads(urlopen(req, context=ctx).read())
        except HTTPError as e:
            if e.code == 429:
                wait = 2 ** attempt
                log(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
            elif e.code == 404:
                return None
            else:
                log(f"  HTTP {e.code} for {call_sid}, retry {attempt+1}")
                time.sleep(1)
        except URLError:
            time.sleep(2)
    return None

# ── Direction resolution ────────────────────────────────────────────
parent_cache: dict[str, str] = {}  # parent_call_sid → direction

def resolve_direction(call_sid: str) -> str:
    """Determine true call direction by checking parent call if needed."""
    call = twilio_get_call(call_sid)
    if not call:
        return "unknown"

    direction = call.get("direction", "unknown")
    parent_sid = call.get("parent_call_sid")

    # If this call is inbound, it's genuinely inbound
    if direction == "inbound":
        return "inbound"

    # If outbound with a parent, check the parent's direction
    if parent_sid:
        if parent_sid in parent_cache:
            return parent_cache[parent_sid]

        parent = twilio_get_call(parent_sid)
        if parent:
            parent_dir = parent.get("direction", "unknown")
            # Parent inbound = the whole interaction is inbound
            # Parent outbound = genuinely outbound
            result = "inbound" if parent_dir == "inbound" else "outbound"
            parent_cache[parent_sid] = result
            return result

    # Outbound with no parent = genuine outbound
    return "outbound"

# ── Main ────────────────────────────────────────────────────────────
def main():
    log("=== Fix Direction Column in Recordings Tab ===\n")

    # 1. Get Google token
    log("Authenticating with Google Sheets...")
    token = get_google_token()
    log("  OK\n")

    # 2. Read all rows
    log(f"Reading all rows from '{TAB_NAME}'...")
    result = sheets_get(token, f"'{TAB_NAME}'!A:J")
    rows = result.get("values", [])
    log(f"  {len(rows)} rows (including header)\n")

    if len(rows) < 2:
        log("No data rows found!")
        return

    # Header row
    header = rows[0]
    log(f"  Columns: {header}")

    # Find the Direction column index
    dir_col = None
    for i, h in enumerate(header):
        if h.lower() == "direction":
            dir_col = i
            break
    if dir_col is None:
        log("ERROR: Could not find 'Direction' column!")
        return
    log(f"  Direction column index: {dir_col}")

    # Find CallSid column
    sid_col = None
    for i, h in enumerate(header):
        if h.lower() == "callsid":
            sid_col = i
            break
    if sid_col is None:
        log("ERROR: Could not find 'CallSid' column!")
        return
    log(f"  CallSid column index: {sid_col}\n")

    # 3. Process each row
    data_rows = rows[1:]
    total = len(data_rows)
    updates = []  # (row_index_1based, new_direction)
    stats = {"inbound": 0, "outbound": 0, "unknown": 0, "unchanged": 0, "cached_parents": 0}

    log(f"Processing {total} rows...\n")
    start_time = time.time()

    for i, row in enumerate(data_rows):
        row_num = i + 2  # 1-based, skip header

        # Get CallSid
        if len(row) <= sid_col:
            continue
        call_sid = row[sid_col].strip()
        if not call_sid or not call_sid.startswith("CA"):
            continue

        # Get current direction
        current_dir = row[dir_col].strip().lower() if len(row) > dir_col else ""

        # Resolve true direction
        true_dir = resolve_direction(call_sid)

        if true_dir != current_dir:
            updates.append((row_num, true_dir))

        stats[true_dir] = stats.get(true_dir, 0) + 1

        # Progress
        if (i + 1) % 50 == 0 or i == total - 1:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta = (total - i - 1) / rate if rate > 0 else 0
            log(f"  [{i+1}/{total}] {rate:.1f} rows/s | ETA: {eta:.0f}s | "
                  f"in:{stats['inbound']} out:{stats['outbound']} unk:{stats['unknown']} | "
                  f"parent cache: {len(parent_cache)} | changes: {len(updates)}")

        # Throttle to avoid Twilio rate limits (~80 req/s to be safe)
        if (i + 1) % 80 == 0:
            time.sleep(1.0)

    log(f"\n  Done scanning. {len(updates)} rows need direction change.")
    log(f"  Stats: {stats}")
    log(f"  Parent cache entries: {len(parent_cache)}\n")

    # 4. Batch update the sheet
    if not updates:
        log("No changes needed!")
        return

    # Refresh token if needed (might have expired during long scan)
    log("Refreshing Google token...")
    token = get_google_token()

    # Convert direction column letter (A=0, B=1, ... H=7)
    col_letter = chr(ord('A') + dir_col)

    # Update in batches of 500
    BATCH = 500
    total_batches = math.ceil(len(updates) / BATCH)
    for batch_idx in range(total_batches):
        batch = updates[batch_idx * BATCH : (batch_idx + 1) * BATCH]
        log(f"  Writing batch {batch_idx + 1}/{total_batches} ({len(batch)} cells)...")

        # Use batchUpdate for efficiency
        requests_data = []
        for row_num, new_dir in batch:
            range_str = f"'{TAB_NAME}'!{col_letter}{row_num}"
            requests_data.append({
                "range": range_str,
                "values": [[new_dir]],
            })

        # Batch update
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values:batchUpdate"
        body = json.dumps({
            "valueInputOption": "RAW",
            "data": requests_data,
        }).encode()
        req = Request(url, data=body, method="POST",
                      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            resp = json.loads(urlopen(req, context=ctx).read())
            log(f"    Updated {resp.get('totalUpdatedCells', '?')} cells")
        except HTTPError as e:
            log(f"    ERROR: {e.code} — {e.read().decode()[:200]}")
            # Retry with fresh token
            token = get_google_token()
            time.sleep(2)

        time.sleep(0.5)  # Sheets rate limit

    log(f"\n=== DONE === {len(updates)} direction values corrected.")

if __name__ == "__main__":
    main()
