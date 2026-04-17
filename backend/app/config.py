from pathlib import Path

APP_NAME = "Engine Touchscreen API"
APP_VERSION = "0.1.0"

# backend/app -> project root -> backend/h429_data.db
DB_PATH = Path(__file__).resolve().parent.parent.parent / "backend" / "h429_data.db"
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

ALARM_RULES = {
    "LUB OIL PRESSURE": {"warning_below": 0.2, "critical_below": 0.1},
    "H.T. WATER TEMPERATURE": {"warning_above": 95.0, "critical_above": 105.0},
    "ENGINE SPEED": {"warning_above": 900.0, "critical_above": 1000.0},
}

CORS_ORIGINS = ["*"]

# Analog threshold profiles (customizable by machine type/profile).
# Condition keys supported: gt, gte, lt, lte.
ANALOG_THRESHOLD_PROFILES = {
    "default": {
        "LUB OIL TEMPERATURE ENGINE INLET": {
            "unit": "deg C",
            "normal": {"lt": 60},
            "warning": {"gte": 60, "lt": 65},
            "critical": {"gte": 65},
        },
        "H.T. WATER TEMPERATURE ENGINE OUTLET": {
            "unit": "deg C",
            "normal": {"lt": 80},
            "warning": {"gte": 80, "lt": 90},
            "critical": {"gte": 90},
        },
        "No.1CYL. EXHAUST GAS TEMPERATURE": {
            "unit": "deg C",
            "normal": {"lt": 400},
            "warning": {"gte": 400, "lt": 480},
            "critical": {"gte": 480},
        },
        "No.2CYL. EXHAUST GAS TEMPERATURE": {
            "unit": "deg C",
            "normal": {"lt": 400},
            "warning": {"gte": 400, "lt": 480},
            "critical": {"gte": 480},
        },
        "No.3CYL. EXHAUST GAS TEMPERATURE": {
            "unit": "deg C",
            "normal": {"lt": 400},
            "warning": {"gte": 400, "lt": 480},
            "critical": {"gte": 480},
        },
        "No.4CYL. EXHAUST GAS TEMPERATURE": {
            "unit": "deg C",
            "normal": {"lt": 400},
            "warning": {"gte": 400, "lt": 480},
            "critical": {"gte": 480},
        },
        "No.5CYL. EXHAUST GAS TEMPERATURE": {
            "unit": "deg C",
            "normal": {"lt": 400},
            "warning": {"gte": 400, "lt": 480},
            "critical": {"gte": 480},
        },
        "No.6CYL. EXHAUST GAS TEMPERATURE": {
            "unit": "deg C",
            "normal": {"lt": 400},
            "warning": {"gte": 400, "lt": 480},
            "critical": {"gte": 480},
        },
        "EXHAUST GAS TEMPERATURE T/C INLET 1": {
            "unit": "deg C",
            "normal": {"lt": 480},
            "warning": {"gte": 480, "lt": 580},
            "critical": {"gte": 580},
        },
        "EXHAUST GAS TEMPERATURE T/C INLET 2": {
            "unit": "deg C",
            "normal": {"lt": 480},
            "warning": {"gte": 480, "lt": 580},
            "critical": {"gte": 580},
        },
        "EXHAUST GAS TEMPERATURE T/C OUTLET": {
            "unit": "deg C",
            "normal": {"lt": 400},
            "warning": {"gte": 400, "lt": 480},
            "critical": {"gte": 480},
        },
        "H.T. WATER PRESSURE ENGINE INLET": {"unit": "MPa"},
        "L.T. WATER PRESSURE ENGINE INLET": {"unit": "MPa"},
        "STARTING AIR PRESSURE": {
            "unit": "MPa",
            "normal": {"gt": 2.0},
            "warning": {"gt": 1.5, "lte": 2.0},
            "critical": {"lte": 1.5},
        },
        "FUEL OIL PRESSURE ENGINE INLET": {
            "unit": "MPa",
            "normal": {"gt": 0.35},
            "warning": {"gt": 0.3, "lte": 0.35},
            "critical": {"lte": 0.3},
        },
        "LUB OIL PRESSURE": {
            "unit": "MPa",
            "normal": {"gt": 0.35},
            "warning": {"gt": 0.3, "lte": 0.35},
            "critical": {"lte": 0.3},
        },
        "ENGINE SPEED": {
            "unit": "min-1",
            "normal": {"lt": 900},
            "warning": {"gte": 900, "lt": 1020},
            "critical": {"gte": 1020},
        },
        "LOAD": {"unit": "kW"},
        "RUNNING HOUR": {"unit": "x10Hours"},
    }
}

# Map machine identity to profile key.
ANALOG_PROFILE_BY_SERIAL = {
    "DE618Z5178": "default",
    "DE618Z5179": "default",
}
ANALOG_PROFILE_BY_DG_NAME = {
    "DG#1": "default",
    "DG#2": "default",
}
