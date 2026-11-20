"""Start the local API: python -m collector.main"""
import uvicorn
from .settings import settings

if __name__ == "__main__":
    uvicorn.run("collector.app:app", host=settings.host, port=settings.port, reload=False)
