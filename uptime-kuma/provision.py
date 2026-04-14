"""
Uptime Kuma provisioning script.

Runs once on deployment to create all monitors as code.
Idempotent: skips monitors that already exist by name.

Required environment variables:
  UPTIME_KUMA_URL            e.g. http://uptime_kuma:3001
  UPTIME_KUMA_ADMIN_USER     admin username
  UPTIME_KUMA_ADMIN_PASSWORD admin password
  API_HOST                   public API hostname, e.g. api.venuevoice.com.au
"""

import os
import sys
import time

from uptime_kuma_api import UptimeKumaApi, MonitorType

KUMA_URL = os.environ["UPTIME_KUMA_URL"]
ADMIN_USER = os.environ["UPTIME_KUMA_ADMIN_USER"]
ADMIN_PASSWORD = os.environ["UPTIME_KUMA_ADMIN_PASSWORD"]
API_HOST = os.environ.get("API_HOST", "api.example.com")

# ---------------------------------------------------------------------------
# Monitor definitions
# ---------------------------------------------------------------------------
# Each dict is passed directly to api.add_monitor(**monitor).
# interval is in seconds.
# ---------------------------------------------------------------------------
MONITORS = [
    {
        "type": MonitorType.HTTP,
        "name": "API (public)",
        "url": f"https://{API_HOST}/health",
        "interval": 60,
        "maxretries": 3,
    },
    {
        "type": MonitorType.HTTP,
        "name": "Status Page",
        "url": "https://status.venuevoice.com.au",
        "interval": 60,
        "maxretries": 3,
    },
    {
        "type": MonitorType.HTTP,
        "name": "Grafana",
        "url": "http://grafana:3000/api/health",
        "interval": 60,
        "maxretries": 3,
    },
    {
        "type": MonitorType.HTTP,
        "name": "Loki",
        "url": "http://loki:3100/ready",
        "interval": 60,
        "maxretries": 3,
    },
    {
        "type": MonitorType.HTTP,
        "name": "Backend Blue",
        "url": "http://backend_blue:5000/health",
        "interval": 30,
        "maxretries": 3,
    },
    {
        "type": MonitorType.HTTP,
        "name": "Backend Green",
        "url": "http://backend_green:5000/health",
        "interval": 30,
        "maxretries": 3,
    },
    {
        "type": MonitorType.PORT,
        "name": "Redis",
        "hostname": "redis",
        "port": 6379,
        "interval": 60,
        "maxretries": 3,
    },
]


def wait_for_kuma(api: UptimeKumaApi, retries: int = 20, delay: int = 5) -> None:
    """Poll until Uptime Kuma accepts connections."""
    for attempt in range(1, retries + 1):
        try:
            api.connect()
            print("Connected to Uptime Kuma.")
            return
        except Exception as exc:
            print(f"Attempt {attempt}/{retries}: not ready ({exc}). Retrying in {delay}s...")
            time.sleep(delay)
    print("ERROR: Uptime Kuma did not become ready in time.", file=sys.stderr)
    sys.exit(1)


def authenticate(api: UptimeKumaApi) -> None:
    """Log in, or perform first-time setup if no account exists yet."""
    try:
        api.login(ADMIN_USER, ADMIN_PASSWORD)
        print("Logged in successfully.")
    except Exception:
        print("Login failed — attempting first-time setup...")
        try:
            api.setup(ADMIN_USER, ADMIN_PASSWORD)
            print("Admin account created and logged in.")
        except Exception as exc:
            print(f"ERROR: Setup also failed: {exc}", file=sys.stderr)
            sys.exit(1)


def provision_monitors(api: UptimeKumaApi) -> None:
    existing_names = {m["name"] for m in api.get_monitors()}

    created = 0
    skipped = 0
    for monitor in MONITORS:
        name = monitor["name"]
        if name in existing_names:
            print(f"  SKIP  {name} (already exists)")
            skipped += 1
        else:
            api.add_monitor(**monitor)
            print(f"  CREATE {name}")
            created += 1

    print(f"\nDone — {created} created, {skipped} skipped.")


def main() -> None:
    api = UptimeKumaApi(KUMA_URL)
    try:
        wait_for_kuma(api)
        authenticate(api)
        provision_monitors(api)
    finally:
        api.disconnect()


if __name__ == "__main__":
    main()
