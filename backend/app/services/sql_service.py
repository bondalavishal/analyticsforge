import time
import duckdb
from typing import Any, Dict, List, Optional


def _get_connection(dialect: str) -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(database=":memory:")
    # DuckDB dialect compatibility — wrapped in try/except because syntax
    # varies by version and not all builds support all dialects
    try:
        if dialect == "mysql":
            conn.execute("SET dialect = 'mysql'")
        elif dialect == "postgresql":
            conn.execute("SET dialect = 'postgres'")
        # sqlite runs as default DuckDB dialect (most compatible)
    except Exception:
        pass  # Dialect setting not supported in this DuckDB build — run as default
    return conn


def _normalize_val(v) -> str:
    if v is None:
        return "NULL"
    try:
        f = float(v)
        # 1100.0 → "1100", 1100.5 → "1100.5"  (avoids int/float type mismatch)
        return str(int(f)) if f == int(f) else str(round(f, 10))
    except (TypeError, ValueError, OverflowError):
        return str(v).strip().lower()


def _rows_equal_unordered(expected: List[List], actual: List[List]) -> bool:
    """Compare two result sets ignoring row order and int/float representation."""
    def normalize(rows):
        return sorted([tuple(_normalize_val(v) for v in row) for row in rows])
    return normalize(expected) == normalize(actual)


def execute_sql(
    sql: str,
    dialect: str = "mysql",
    schema_sql: str = "",
    data_sql: str = "",
) -> Dict[str, Any]:
    """Execute SQL against a fresh DuckDB in-memory database."""
    start = time.perf_counter()
    try:
        conn = _get_connection(dialect)
        if schema_sql:
            conn.execute(schema_sql)
        if data_sql:
            conn.execute(data_sql)
        rel = conn.execute(sql)
        columns = [desc[0] for desc in rel.description] if rel.description else []
        rows = rel.fetchall()
        elapsed_ms = (time.perf_counter() - start) * 1000
        conn.close()
        return {
            "success": True,
            "columns": columns,
            "rows": [list(r) for r in rows],
            "row_count": len(rows),
            "execution_time_ms": round(elapsed_ms, 2),
            "error": None,
        }
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "success": False,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "execution_time_ms": round(elapsed_ms, 2),
            "error": str(e),
        }


def run_test_cases(
    user_sql: str,
    test_cases: List[Dict],
    schema_sql: str,
    data_sql: str,
    dialect: str = "mysql",
) -> Dict[str, Any]:
    """Run user SQL against multiple test cases."""
    results = []
    passed = 0

    for i, tc in enumerate(test_cases):
        tc_schema = tc.get("schema_sql", schema_sql)
        tc_data = tc.get("data_sql", data_sql)
        expected_output = tc.get("expected_output", {})
        expected_rows = expected_output.get("rows", [])

        result = execute_sql(user_sql, dialect, tc_schema, tc_data)

        if result["success"]:
            is_correct = _rows_equal_unordered(expected_rows, result["rows"])
        else:
            is_correct = False

        if is_correct:
            passed += 1

        results.append({
            "test_case_index": i,
            "passed": is_correct,
            "expected": expected_output,
            "actual": {"columns": result["columns"], "rows": result["rows"]},
            "error": result["error"],
            "execution_time_ms": result["execution_time_ms"],
        })

    return {
        "passed": passed,
        "total": len(test_cases),
        "all_passed": passed == len(test_cases),
        "details": results,
    }


def validate_sql_syntax(sql: str, dialect: str = "mysql") -> Dict[str, Any]:
    """Validate SQL syntax without executing against real data."""
    conn = _get_connection(dialect)
    try:
        conn.execute(f"EXPLAIN {sql}")
        return {"valid": True, "error": None}
    except Exception as e:
        return {"valid": False, "error": str(e)}
    finally:
        conn.close()
