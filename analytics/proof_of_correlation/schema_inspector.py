"""
Database schema inspection tool.

Inspects the Supabase database schema and prints table/column information.
"""

import logging
from typing import List, Dict
import pandas as pd

from .database import get_db_connection

logger = logging.getLogger(__name__)


def get_all_tables() -> List[str]:
    """
    Get list of all tables in the public schema.

    Returns:
        List of table names
    """
    query = """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    """

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        tables = [row[0] for row in cursor.fetchall()]

    return tables


def get_table_columns(table_name: str) -> List[Dict[str, str]]:
    """
    Get column information for a specific table.

    Args:
        table_name: Name of the table

    Returns:
        List of dicts with column information (name, type, nullable, default)
    """
    query = """
        SELECT
            column_name,
            data_type,
            is_nullable,
            column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = %s
        ORDER BY ordinal_position;
    """

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (table_name,))
        columns = []
        for row in cursor.fetchall():
            columns.append({
                "column_name": row[0],
                "data_type": row[1],
                "is_nullable": row[2],
                "column_default": row[3]
            })

    return columns


def get_table_row_count(table_name: str) -> int:
    """
    Get the number of rows in a table.

    Args:
        table_name: Name of the table

    Returns:
        int: Number of rows
    """
    query = f"SELECT COUNT(*) FROM {table_name};"

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        count = cursor.fetchone()[0]

    return count


def inspect_schema(tables_of_interest: List[str] = None) -> pd.DataFrame:
    """
    Inspect database schema and return a summary DataFrame.

    Args:
        tables_of_interest: List of table names to inspect (default: all tables)

    Returns:
        pd.DataFrame: Schema information
    """
    all_tables = get_all_tables()

    if tables_of_interest:
        tables_to_inspect = [t for t in all_tables if t in tables_of_interest]
    else:
        tables_to_inspect = all_tables

    schema_info = []

    for table in tables_to_inspect:
        try:
            columns = get_table_columns(table)
            row_count = get_table_row_count(table)

            for col in columns:
                schema_info.append({
                    "table_name": table,
                    "column_name": col["column_name"],
                    "data_type": col["data_type"],
                    "is_nullable": col["is_nullable"],
                    "column_default": col["column_default"],
                    "table_row_count": row_count
                })
        except Exception as e:
            logger.error(f"Error inspecting table {table}: {e}")

    df = pd.DataFrame(schema_info)
    return df


def print_schema_summary():
    """
    Print a human-readable summary of the database schema.

    Focuses on tables relevant to the correlation engine:
    - users
    - roles
    - references
    - user_kpis
    - cognitive_game_scores
    - job_outcomes
    - companies
    """
    print("=" * 80)
    print("SUPABASE SCHEMA INSPECTION")
    print("=" * 80)

    tables_of_interest = [
        "users",
        "roles",
        "references",
        "user_kpis",
        "cognitive_game_scores",
        "job_outcomes",
        "companies",
        "correlation_results",
        "model_baseline_results"
    ]

    all_tables = get_all_tables()
    print(f"\nTotal tables in database: {len(all_tables)}")
    print(f"Tables of interest: {len(tables_of_interest)}")

    for table in tables_of_interest:
        print(f"\n{'-' * 80}")
        print(f"TABLE: {table}")
        print(f"{'-' * 80}")

        if table not in all_tables:
            print(f"  ⚠️  Table '{table}' does NOT exist in the database!")
            print(f"  → You may need to run the SQL migration: sql/003_correlation_engine_schema.sql")
            continue

        try:
            row_count = get_table_row_count(table)
            print(f"  Row count: {row_count}")

            columns = get_table_columns(table)
            print(f"  Columns ({len(columns)}):")

            for col in columns:
                nullable = "NULL" if col["is_nullable"] == "YES" else "NOT NULL"
                default = f" DEFAULT {col['column_default']}" if col['column_default'] else ""
                print(f"    - {col['column_name']:<30} {col['data_type']:<20} {nullable}{default}")

        except Exception as e:
            print(f"  ❌ Error: {e}")

    print("\n" + "=" * 80)
    print("SCHEMA INSPECTION COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(level=logging.INFO)

    # Run schema inspection
    print_schema_summary()
