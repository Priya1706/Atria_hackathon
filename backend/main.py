"""Configured local SaaS entry point: python -m backend.main"""
import uvicorn
from backend.app.config import HOST, PORT


if __name__ == "__main__":
    uvicorn.run("backend.app.main:app", host=HOST, port=PORT, reload=False)
