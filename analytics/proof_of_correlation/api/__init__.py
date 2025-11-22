"""
FastAPI application for the HRKey Correlation Engine.

Provides HTTP endpoints to access correlation and model results.
"""

from .main import app

__all__ = ["app"]
