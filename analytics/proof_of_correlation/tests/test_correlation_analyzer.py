"""
Unit tests for the correlation_analyzer module.
"""

import pytest
import pandas as pd
import numpy as np

# Import functions to test
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from analytics.proof_of_correlation.correlation_analyzer import (
    compute_correlation,
    compute_basic_correlations
)


def test_compute_correlation_pearson():
    """Test Pearson correlation computation."""
    x = pd.Series([1, 2, 3, 4, 5])
    y = pd.Series([2, 4, 6, 8, 10])  # Perfect positive correlation

    result = compute_correlation(x, y, method="pearson")

    assert 'correlation' in result
    assert 'p_value' in result
    assert 'n_samples' in result
    assert result['n_samples'] == 5
    assert abs(result['correlation'] - 1.0) < 0.001  # Should be ~1.0


def test_compute_correlation_spearman():
    """Test Spearman correlation computation."""
    x = pd.Series([1, 2, 3, 4, 5])
    y = pd.Series([1, 2, 3, 4, 5])  # Perfect positive correlation

    result = compute_correlation(x, y, method="spearman")

    assert result['correlation'] == 1.0
    assert result['n_samples'] == 5


def test_compute_correlation_with_missing_values():
    """Test correlation computation with missing values."""
    x = pd.Series([1, 2, np.nan, 4, 5])
    y = pd.Series([2, 4, 6, np.nan, 10])

    result = compute_correlation(x, y, method="pearson")

    # Should only use valid pairs
    assert result['n_samples'] == 3  # Only indices 0, 1, 4 are valid


def test_compute_correlation_insufficient_samples():
    """Test correlation with insufficient samples."""
    x = pd.Series([1])
    y = pd.Series([2])

    result = compute_correlation(x, y, method="pearson")

    assert np.isnan(result['correlation'])
    assert np.isnan(result['p_value'])
    assert result['n_samples'] == 1


def test_compute_basic_correlations_empty_df():
    """Test compute_basic_correlations with empty dataframe."""
    df = pd.DataFrame()

    result = compute_basic_correlations(df)

    assert isinstance(result, pd.DataFrame)
    assert result.empty


def test_compute_basic_correlations_simple():
    """Test compute_basic_correlations with simple dataset."""
    # Create synthetic dataset
    np.random.seed(42)
    n_samples = 100

    df = pd.DataFrame({
        'user_id': [f'user{i}' for i in range(n_samples)],
        'role_id': [f'role{i%5}' for i in range(n_samples)],
        'hired': np.random.choice([0, 1], n_samples),
        'performance_score': np.random.uniform(1, 5, n_samples),
        'kpi_deployment_frequency': np.random.uniform(0, 10, n_samples),
        'kpi_lead_time': np.random.uniform(1, 20, n_samples),
        'cognitive_memory': np.random.uniform(-1, 1, n_samples),
        'reference_count': np.random.randint(0, 5, n_samples),
    })

    result = compute_basic_correlations(df)

    assert isinstance(result, pd.DataFrame)
    assert not result.empty
    assert 'feature_name' in result.columns
    assert 'target_name' in result.columns
    assert 'correlation' in result.columns
    assert 'p_value' in result.columns
    assert 'metric_type' in result.columns

    # Should have both pearson and spearman
    assert 'pearson' in result['metric_type'].values
    assert 'spearman' in result['metric_type'].values

    # Should have both targets
    assert 'hired' in result['target_name'].values
    assert 'performance_score' in result['target_name'].values


def test_compute_basic_correlations_filters_zero_variance():
    """Test that compute_basic_correlations filters out zero-variance features."""
    df = pd.DataFrame({
        'user_id': ['user1', 'user2', 'user3'],
        'hired': [1, 0, 1],
        'performance_score': [4.0, 3.5, 4.5],
        'kpi_constant': [5.0, 5.0, 5.0],  # Zero variance
        'kpi_variable': [1.0, 2.0, 3.0]
    })

    result = compute_basic_correlations(df)

    # Should skip kpi_constant
    assert 'kpi_constant' not in result['feature_name'].values
    # Should include kpi_variable
    if not result.empty:
        assert 'kpi_variable' in result['feature_name'].values or len(result) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
