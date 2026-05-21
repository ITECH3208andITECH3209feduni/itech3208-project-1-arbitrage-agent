from datetime import datetime, timezone


def parse_iso_datetime(datetime_string):
    """
    Turn an ISO datetime string into a Python datetime object.
    """
    return datetime.fromisoformat(datetime_string)


def get_time_remaining(end_time_string):
    """
    Calculates how much time is left before an auction ends.
    """
    end_time = parse_iso_datetime(end_time_string)
    now = datetime.now(timezone.utc)

    remaining = end_time - now

    if remaining.total_seconds() <= 0:
        return {
            "status": "expired",
            "seconds_left": 0,
            "display": "Auction ended"
        }

    total_seconds = int(remaining.total_seconds())
    days = total_seconds // 86400
    hours = (total_seconds % 86400) // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    parts = []

    if days > 0:
        parts.append(f"{days}d")

    if hours > 0:
        parts.append(f"{hours}h")

    if minutes > 0:
        parts.append(f"{minutes}m")

    if days == 0 and hours == 0 and minutes == 0:
        parts.append(f"{seconds}s")

    return {
        "status": "active",
        "seconds_left": total_seconds,
        "display": " ".join(parts)
    }
