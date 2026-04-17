def round_value(value: float | None, digits: int = 3) -> float | None:
    if value is None:
        return None
    return round(value, digits)
