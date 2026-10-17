"""Read the authoritative repository configuration; public telemetry is never control."""
import json
from pathlib import Path
from storage import write_json
ROOT = Path(__file__).resolve().parent
CONFIG_FILE = ROOT / "system_config.json"

def validate_config(cfg):
    if not isinstance(cfg, dict) or type(cfg.get("email_system_enabled")) is not bool:
        raise ValueError("email_system_enabled must be a boolean")
    return cfg

def load_local_config():
    try:
        return validate_config(json.loads(CONFIG_FILE.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return {"email_system_enabled": False, "updated_at": "", "guard_error": "missing_or_invalid_config"}

def save_local_config(cfg):
    write_json(CONFIG_FILE, validate_config(cfg))

def sync_remote_config():
    # The authenticated Ubuntu admin owns this file. GitHub is frontend code only.
    return load_local_config()

def is_system_enabled(verbose=True):
    cfg = sync_remote_config()
    enabled = cfg.get("email_system_enabled") is True
    if not enabled and verbose:
        print("Automatic mail paused: " + cfg.get("guard_error", "repository switch is OFF"))
    return enabled


def can_prospect(verbose=True):
    """Refresh exclusions without applying the mail-only stop switch."""
    cfg = sync_remote_config()
    allowed = not cfg.get('guard_error')
    if not allowed and verbose:
        print('Prospecting deferred: operational configuration unavailable')
    return allowed
