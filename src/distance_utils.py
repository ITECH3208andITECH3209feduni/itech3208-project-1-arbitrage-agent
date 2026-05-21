def miles_to_km(miles):
    """
    Convert miles into kilometres.
    """
    return round(miles * 1.60934, 2)


def normalize_mileage_to_km(value, unit):
    """
    Return mileage in kilometres.
    """
    unit = unit.strip().lower()

    if unit in ["km", "kilometres", "kilometers"]:
        return round(value, 2)

    if unit in ["mi", "miles"]:
        return miles_to_km(value)

    raise ValueError(f"Unsupported mileage unit: {unit}")
