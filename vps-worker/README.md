# VisaRadar — Real Browser Verification Worker

Playwright-based worker that opens visa booking sites in a real Chromium browser, evaluates the DOM after JS rendering, detects booking buttons / calendars / available dates, takes a screenshot when slots are open, intercepts XHR JSON responses, and posts results to Supabase.

## Why a VPS?
Playwright + Chromium needs ~1GB RAM and ~300MB disk — won't fit inside Supabase Edge Functions (Deno, no Chromium).

## Quick deploy (DigitalOcean / Hetzner / Contabo, $6/month droplet)

```bash
# 1. SSH into your VPS (Ubuntu 22.04+)
sudo apt update && sudo apt install -y nodejs npm

# 2. Clone or upload this folder
cd /opt && sudo git clone <your-repo> visaradar-worker
cd visaradar-worker/vps-worker

# 3. Install
npm install
npx playwright install --with-deps chromium

# 4. Configure
cp .env.example .env
nano .env   # paste WORKER_TOKEN from VisaRadar Admin → Browser Workers

# 5. Test once
npm run once

# 6. Run as service (pm2)
sudo npm install -g pm2
pm2 start worker.js --name visaradar-worker
pm2 save
pm2 startup        # follow printed instructions
```

## Get your WORKER_TOKEN
1. Log in to VisaRadar as admin
2. Go to `/admin/browser-workers`
3. Click "Create Worker Token", copy it once (not shown again), paste into `.env`

## Features
- ✅ Real Chromium (post-JS DOM)
- ✅ Stealth mode (puppeteer-extra-plugin-stealth)
- ✅ Random User-Agent rotation
- ✅ Human-like mouse movement + scroll + random delays
- ✅ Booking-button detection (multilingual: EN/FR/DE/ES/AR)
- ✅ Calendar widget detection (FullCalendar, jQuery UI, custom)
- ✅ Available-dates counting (non-disabled cells)
- ✅ "No appointments" text detection (multilingual)
- ✅ XHR/JSON network interception (slot/appointment/availability endpoints)
- ✅ Screenshot capture on detection
- ✅ Configurable interval (default 5 min)

## View results
VisaRadar Admin → `/admin/browser-verifications`

## Headful fallback on headless VPS (xvfb)

Many providers (especially TLScontact / VFS) score headless Chromium higher
for bot detection. On a VPS without a display, run the worker behind a
virtual X display so Chromium can launch in *headful* mode normally.

```bash
sudo apt install -y xvfb
# Run pm2 under xvfb (1920x1080x24 virtual display):
pm2 delete visaradar-worker 2>/dev/null || true
pm2 start "xvfb-run -a --server-args='-screen 0 1920x1080x24' node worker.js" \
  --name visaradar-worker
pm2 save
```

Then in `.env` you can safely set:

```env
HEADFUL_PROBABILITY=0.5
HEADFUL_PROVIDERS=tls,vfs
```

Verify xvfb is active: `pm2 logs visaradar-worker` should show
`headful_p=0.50` lines without `Missing X server` errors.

## Debug failure reasons

When a cycle returns `status=error buttons=0 dates=0`, check the saved
`detection_details.failure_reason` in `/admin/browser-verifications`:

| reason                     | meaning                                            |
|----------------------------|----------------------------------------------------|
| `selector_not_found`       | Page loaded but no known booking selector matched. |
| `dom_not_ready`            | SPA root never mounted (likely silent block).      |
| `iframe_detected`          | Booking widget is inside an iframe (cross-origin?).|
| `unexpected_layout`        | DOM mounted but body text < 400 chars.             |
| `empty_availability_state` | Provider explicitly says "no appointments".        |

The raw HTML of failed cycles is now stored in
`detection_details.html_snapshot` (first 250 KB) for offline forensics.