"""
FastAPI application for serving correlation engine results.

Provides HTTP endpoints to access correlation and model results.

Usage:
    uvicorn analytics.proof_of_correlation.api.main:app --reload --port 8000

Endpoints:
    GET /                          - Health check
    GET /api/correlation-summary   - Top correlations summary
    GET /api/model-summary         - Model performance summary
    GET /api/correlation-details   - Detailed correlation results
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional
import logging

# Import our modules
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from analytics.proof_of_correlation.results_storage import (
    get_correlation_summary,
    get_model_summary
)
from analytics.proof_of_correlation.database import get_db_connection

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="HRKey Correlation Engine API",
    description="API for accessing correlation analysis and ML model results",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "HRKey Correlation Engine API",
        "version": "1.0.0"
    }


@app.get("/api/correlation-summary")
def correlation_summary(
    target: Optional[str] = Query(None, description="Filter by target: 'hired' or 'performance_score'"),
    limit: int = Query(10, ge=1, le=50, description="Number of top correlations to return")
) -> Dict:
    """
    Get top correlations for predicting job outcomes.

    Returns the top N features most strongly correlated with hiring decisions
    and job performance, based on stored correlation analysis.

    Args:
        target: Optional filter by target variable ('hired' or 'performance_score')
        limit: Maximum number of results per target (default: 10)

    Returns:
        dict: {
            'hired': [
                {
                    'feature_name': str,
                    'correlation': float,
                    'p_value': float,
                    'n_samples': int
                },
                ...
            ],
            'performance_score': [...]
        }

    Example:
        GET /api/correlation-summary?limit=5
        GET /api/correlation-summary?target=hired&limit=10
    """
    try:
        summary = get_correlation_summary(limit=limit)

        # Filter by target if specified
        if target:
            if target not in ['hired', 'performance_score']:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid target. Must be 'hired' or 'performance_score'"
                )
            summary = {target: summary.get(target, [])}

        return {
            "status": "success",
            "data": summary,
            "metadata": {
                "limit": limit,
                "target_filter": target
            }
        }

    except Exception as e:
        logger.error(f"Error retrieving correlation summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/model-summary")
def model_summary() -> Dict:
    """
    Get ML model performance summary.

    Returns performance metrics for baseline models trained to predict
    hiring outcomes and job performance.

    Returns:
        dict: {
            'hired': {
                'logistic_regression': {
                    'accuracy': float,
                    'precision': float,
                    'recall': float,
                    'f1': float,
                    'roc_auc': float
                },
                'random_forest': {...}
            },
            'performance_score': {
                'linear_regression': {
                    'r2': float,
                    'mae': float,
                    'rmse': float
                },
                'random_forest': {...}
            }
        }

    Example:
        GET /api/model-summary
    """
    try:
        summary = get_model_summary()

        return {
            "status": "success",
            "data": summary,
            "metadata": {
                "model_version": "v1.0"
            }
        }

    except Exception as e:
        logger.error(f"Error retrieving model summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/correlation-details")
def correlation_details(
    feature: Optional[str] = Query(None, description="Filter by feature name"),
    target: Optional[str] = Query(None, description="Filter by target"),
    min_correlation: Optional[float] = Query(None, ge=-1, le=1, description="Minimum absolute correlation"),
    max_p_value: Optional[float] = Query(0.05, ge=0, le=1, description="Maximum p-value (significance threshold)")
) -> Dict:
    """
    Get detailed correlation results with optional filters.

    Args:
        feature: Filter by feature name (partial match)
        target: Filter by target ('hired' or 'performance_score')
        min_correlation: Minimum absolute correlation coefficient
        max_p_value: Maximum p-value (default: 0.05 for significance)

    Returns:
        dict: {
            'results': [
                {
                    'feature_name': str,
                    'target_name': str,
                    'metric_type': str,
                    'correlation': float,
                    'p_value': float,
                    'n_samples': int,
                    'computed_at': str
                },
                ...
            ],
            'count': int
        }

    Example:
        GET /api/correlation-details?min_correlation=0.3&max_p_value=0.01
        GET /api/correlation-details?feature=kpi_deployment&target=hired
    """
    try:
        # Build query with filters
        query = """
            SELECT
                feature_name,
                target_name,
                metric_type,
                correlation,
                p_value,
                n_samples,
                computed_at
            FROM correlation_results
            WHERE 1=1
        """
        params = []

        if feature:
            query += " AND feature_name ILIKE %s"
            params.append(f"%{feature}%")

        if target:
            if target not in ['hired', 'performance_score']:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid target. Must be 'hired' or 'performance_score'"
                )
            query += " AND target_name = %s"
            params.append(target)

        if min_correlation is not None:
            query += " AND ABS(correlation) >= %s"
            params.append(min_correlation)

        if max_p_value is not None:
            query += " AND p_value <= %s"
            params.append(max_p_value)

        query += " ORDER BY ABS(correlation) DESC"

        # Execute query
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()

        # Format results
        results = [
            {
                'feature_name': row[0],
                'target_name': row[1],
                'metric_type': row[2],
                'correlation': float(row[3]),
                'p_value': float(row[4]),
                'n_samples': row[5],
                'computed_at': row[6].isoformat() if row[6] else None
            }
            for row in rows
        ]

        return {
            "status": "success",
            "data": {
                "results": results,
                "count": len(results)
            },
            "metadata": {
                "filters": {
                    "feature": feature,
                    "target": target,
                    "min_correlation": min_correlation,
                    "max_p_value": max_p_value
                }
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving correlation details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/feature-importance")
def feature_importance(
    target: str = Query(..., description="Target: 'hired' or 'performance_score'"),
    model_type: str = Query(..., description="Model type: 'logistic_regression', 'random_forest', 'linear_regression'"),
    top_n: int = Query(10, ge=1, le=50, description="Number of top features")
) -> Dict:
    """
    Get feature importance from a trained model.

    Args:
        target: Target variable ('hired' or 'performance_score')
        model_type: Model type to query
        top_n: Number of top features to return

    Returns:
        dict: {
            'features': [
                {
                    'feature_name': str,
                    'importance': float
                },
                ...
            ]
        }

    Example:
        GET /api/feature-importance?target=hired&model_type=random_forest&top_n=10
    """
    try:
        # Validate inputs
        if target not in ['hired', 'performance_score']:
            raise HTTPException(
                status_code=400,
                detail="Invalid target. Must be 'hired' or 'performance_score'"
            )

        valid_models = ['logistic_regression', 'random_forest', 'linear_regression']
        if model_type not in valid_models:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid model_type. Must be one of: {valid_models}"
            )

        # Query feature importances
        query = """
            SELECT feature_importances
            FROM model_baseline_results
            WHERE target_name = %s
              AND model_type = %s
              AND model_version = 'v1.0'
            LIMIT 1;
        """

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, (target, model_type))
            result = cursor.fetchone()

        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"No results found for target='{target}' and model_type='{model_type}'"
            )

        # Parse feature importances
        import json
        importances = json.loads(result[0])

        # Sort by absolute importance and take top N
        sorted_features = sorted(
            importances.items(),
            key=lambda x: abs(x[1]),
            reverse=True
        )[:top_n]

        features = [
            {
                'feature_name': name,
                'importance': importance
            }
            for name, importance in sorted_features
        ]

        return {
            "status": "success",
            "data": {
                "features": features,
                "target": target,
                "model_type": model_type
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving feature importance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
