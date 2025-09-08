from pydantic import BaseModel

class Defaults(BaseModel):
    VOICE_ON: bool = True
    AUTO_ZOOM_ON: bool = True
    ENGINE_CADENCE_MS: int = 1000   # ~1 event/sec
    USER_OVERRIDE_WINDOW_S: int = 60
    TRUCK_CAP: int = 60

DEFAULTS = Defaults()
