"""
Database connection utilities for Supabase Postgres.

Provides connection pooling and query execution helpers.
"""

import logging
from contextlib import contextmanager
from typing import Generator, Optional

import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

from .config import get_config

logger = logging.getLogger(__name__)


class DatabaseConnectionPool:
    """Connection pool manager for Supabase Postgres."""

    def __init__(self, db_url: str, minconn: int = 1, maxconn: int = 10):
        """
        Initialize the connection pool.

        Args:
            db_url: PostgreSQL connection URL
            minconn: Minimum number of connections in the pool
            maxconn: Maximum number of connections in the pool
        """
        try:
            self.pool = psycopg2.pool.SimpleConnectionPool(
                minconn, maxconn, db_url
            )
            logger.info("Database connection pool initialized successfully")
        except psycopg2.Error as e:
            logger.error(f"Failed to create connection pool: {e}")
            raise

    @contextmanager
    def get_connection(self) -> Generator:
        """
        Context manager to get a connection from the pool.

        Yields:
            psycopg2.connection: Database connection

        Example:
            >>> with pool.get_connection() as conn:
            >>>     cursor = conn.cursor()
            >>>     cursor.execute("SELECT * FROM users")
        """
        conn = None
        try:
            conn = self.pool.getconn()
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            if conn:
                self.pool.putconn(conn)

    def close_all(self):
        """Close all connections in the pool."""
        if self.pool:
            self.pool.closeall()
            logger.info("All database connections closed")


# Global connection pool (lazy initialized)
_pool: Optional[DatabaseConnectionPool] = None


def get_db_connection():
    """
    Get a database connection from the global pool.

    Returns:
        context manager that yields a psycopg2.connection

    Example:
        >>> with get_db_connection() as conn:
        >>>     cursor = conn.cursor()
        >>>     cursor.execute("SELECT * FROM users")
    """
    global _pool
    if _pool is None:
        config = get_config()
        _pool = DatabaseConnectionPool(config.supabase_db_url)
    return _pool.get_connection()


def test_connection() -> bool:
    """
    Test the database connection.

    Returns:
        bool: True if connection is successful, False otherwise
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            logger.info("Database connection test successful")
            return result[0] == 1
    except Exception as e:
        logger.error(f"Database connection test failed: {e}")
        return False


def execute_query(query: str, params: Optional[tuple] = None, fetch: bool = True):
    """
    Execute a SQL query and return results.

    Args:
        query: SQL query string
        params: Query parameters (optional)
        fetch: Whether to fetch results (default: True)

    Returns:
        list of dict: Query results (if fetch=True)
        None: If fetch=False

    Example:
        >>> results = execute_query("SELECT * FROM users WHERE id = %s", (user_id,))
    """
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(query, params)

        if fetch:
            results = cursor.fetchall()
            return [dict(row) for row in results]
        else:
            conn.commit()
            return None


def execute_many(query: str, data: list):
    """
    Execute a query multiple times with different parameter sets.

    Args:
        query: SQL query string with placeholders
        data: List of parameter tuples

    Example:
        >>> execute_many(
        >>>     "INSERT INTO table (col1, col2) VALUES (%s, %s)",
        >>>     [(val1, val2), (val3, val4)]
        >>> )
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.executemany(query, data)
        conn.commit()
        logger.info(f"Executed batch insert/update: {len(data)} rows")


def close_pool():
    """Close the global connection pool."""
    global _pool
    if _pool:
        _pool.close_all()
        _pool = None
