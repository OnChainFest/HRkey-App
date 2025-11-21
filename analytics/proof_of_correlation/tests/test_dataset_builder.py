"""
Unit tests for the dataset_builder module.
"""

import pytest
import pandas as pd
import numpy as np
from unittest.mock import Mock, patch

# Import functions to test
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from analytics.proof_of_correlation.dataset_builder import (
    fetch_job_outcomes,
    fetch_user_kpis,
    fetch_cognitive_scores,
    fetch_reference_features
)


def test_fetch_job_outcomes_empty():
    """Test fetch_job_outcomes with empty result."""
    with patch('analytics.proof_of_correlation.dataset_builder.get_db_connection') as mock_conn:
        # Mock empty dataframe
        mock_context = Mock()
        mock_conn.return_value.__enter__.return_value = Mock()

        with patch('pandas.read_sql_query') as mock_read_sql:
            mock_read_sql.return_value = pd.DataFrame()

            result = fetch_job_outcomes()

            assert isinstance(result, pd.DataFrame)
            assert result.empty


def test_fetch_job_outcomes_with_data():
    """Test fetch_job_outcomes with sample data."""
    sample_data = pd.DataFrame({
        'outcome_id': ['id1', 'id2'],
        'user_id': ['user1', 'user2'],
        'role_id': ['role1', 'role2'],
        'hired': [True, False],
        'performance_score': [4.5, None],
        'role_name': ['Backend Developer', 'Frontend Developer'],
        'industry': ['Tech', 'Tech'],
        'seniority_level': ['mid', 'mid']
    })

    with patch('analytics.proof_of_correlation.dataset_builder.get_db_connection'):
        with patch('pandas.read_sql_query') as mock_read_sql:
            mock_read_sql.return_value = sample_data

            result = fetch_job_outcomes()

            assert len(result) == 2
            assert 'hired' in result.columns
            assert 'performance_score' in result.columns
            assert result['hired'].iloc[0] == True


def test_fetch_user_kpis_empty():
    """Test fetch_user_kpis with empty result."""
    with patch('analytics.proof_of_correlation.dataset_builder.get_db_connection'):
        with patch('pandas.read_sql_query') as mock_read_sql:
            mock_read_sql.return_value = pd.DataFrame()

            result = fetch_user_kpis()

            assert isinstance(result, pd.DataFrame)
            assert 'user_id' in result.columns
            assert 'role_id' in result.columns


def test_fetch_user_kpis_with_data():
    """Test fetch_user_kpis with sample data and pivoting."""
    sample_data = pd.DataFrame({
        'user_id': ['user1', 'user1', 'user2'],
        'role_id': ['role1', 'role1', 'role2'],
        'kpi_name': ['deployment_frequency', 'lead_time', 'deployment_frequency'],
        'kpi_value_mean': [10.0, 5.0, 12.0],
        'kpi_normalized_mean': [0.5, -0.3, 0.7],
        'kpi_percentile_mean': [60.0, 40.0, 70.0],
        'kpi_count': [1, 1, 1],
        'has_verified_kpi': [1, 1, 0]
    })

    with patch('analytics.proof_of_correlation.dataset_builder.get_db_connection'):
        with patch('pandas.read_sql_query') as mock_read_sql:
            mock_read_sql.return_value = sample_data

            result = fetch_user_kpis()

            # Should pivot to wide format
            assert len(result) == 2  # 2 unique (user_id, role_id) pairs
            assert 'user_id' in result.columns
            assert 'role_id' in result.columns
            # Should have kpi_ prefix
            assert any(col.startswith('kpi_') for col in result.columns)


def test_fetch_cognitive_scores_empty():
    """Test fetch_cognitive_scores with empty result."""
    with patch('analytics.proof_of_correlation.dataset_builder.get_db_connection'):
        with patch('pandas.read_sql_query') as mock_read_sql:
            mock_read_sql.return_value = pd.DataFrame()

            result = fetch_cognitive_scores()

            assert isinstance(result, pd.DataFrame)
            assert 'user_id' in result.columns


def test_fetch_cognitive_scores_with_data():
    """Test fetch_cognitive_scores with sample data."""
    sample_data = pd.DataFrame({
        'user_id': ['user1', 'user1', 'user2'],
        'game_type': ['memory', 'attention', 'memory'],
        'cognitive_score_mean': [0.5, 0.3, 0.7],
        'cognitive_percentile_mean': [60.0, 45.0, 75.0],
        'cognitive_accuracy_mean': [85.0, 78.0, 90.0],
        'game_count': [3, 2, 4]
    })

    with patch('analytics.proof_of_correlation.dataset_builder.get_db_connection'):
        with patch('pandas.read_sql_query') as mock_read_sql:
            mock_read_sql.return_value = sample_data

            result = fetch_cognitive_scores()

            # Should pivot to wide format
            assert 'user_id' in result.columns
            # Should have cognitive_ prefix
            assert any(col.startswith('cognitive_') for col in result.columns)


def test_fetch_reference_features_empty():
    """Test fetch_reference_features with empty result."""
    with patch('analytics.proof_of_correlation.dataset_builder.get_db_connection'):
        with patch('pandas.read_sql_query') as mock_read_sql:
            mock_read_sql.return_value = pd.DataFrame()

            result = fetch_reference_features()

            assert isinstance(result, pd.DataFrame)


def test_fetch_reference_features_with_data():
    """Test fetch_reference_features with sample data."""
    sample_data = pd.DataFrame({
        'user_id': ['user1', 'user2'],
        'role_id': ['role1', 'role2'],
        'reference_count': [3, 2],
        'reference_avg_rating': [4.5, 4.0],
        'reference_verified_count': [2, 1],
        'reference_max_rating': [5.0, 4.5],
        'reference_min_rating': [4.0, 3.5]
    })

    with patch('analytics.proof_of_correlation.dataset_builder.get_db_connection'):
        with patch('pandas.read_sql_query') as mock_read_sql:
            mock_read_sql.return_value = sample_data

            result = fetch_reference_features()

            assert len(result) == 2
            assert 'reference_count' in result.columns
            assert 'reference_avg_rating' in result.columns
            assert result['reference_count'].iloc[0] == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
