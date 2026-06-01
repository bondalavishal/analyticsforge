"""Sandboxed Python execution for function-based practice problems."""

import ast
import json
import subprocess
import sys
import tempfile
import textwrap
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

EXECUTION_TIMEOUT_SECONDS = 30

ALLOWED_MODULES = frozenset({
    "math", "re", "json", "collections", "itertools", "functools",
    "datetime", "typing", "statistics", "copy", "decimal", "fractions",
    "heapq", "bisect", "string", "random", "pandas", "numpy",
})

BLOCKED_BUILTINS = frozenset({
    "open", "exec", "eval", "compile", "__import__", "input", "breakpoint",
    "exit", "quit", "help", "license", "credits", "globals", "locals",
    "vars", "dir", "getattr", "setattr", "delattr", "memoryview",
})

BLOCKED_DUNDER_ATTRIBUTES = frozenset({
    "__base__", "__bases__", "__builtins__", "__class__", "__closure__",
    "__code__", "__dict__", "__func__", "__getattribute__", "__globals__",
    "__mro__", "__self__", "__subclasses__",
})

RUNNER_SCRIPT = textwrap.dedent(
    """
    import builtins
    import json
    import sys
    import traceback

    ALLOWED_MODULES = {
        "math", "re", "json", "collections", "itertools", "functools",
        "datetime", "typing", "statistics", "copy", "decimal", "fractions",
        "heapq", "bisect", "string", "random", "pandas", "numpy",
    }

    def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
        root = name.split(".")[0]
        if root not in ALLOWED_MODULES:
            raise ImportError(f"Import not allowed: {name}")
        return builtins.__import__(name, globals, locals, fromlist, level)

    SAFE_BUILTINS = {
        "__build_class__": builtins.__build_class__,
        "__import__": _safe_import,
        "ArithmeticError": ArithmeticError,
        "AssertionError": AssertionError,
        "AttributeError": AttributeError,
        "BaseException": BaseException,
        "Exception": Exception,
        "IndexError": IndexError,
        "KeyError": KeyError,
        "LookupError": LookupError,
        "NameError": NameError,
        "RuntimeError": RuntimeError,
        "StopIteration": StopIteration,
        "TypeError": TypeError,
        "ValueError": ValueError,
        "ZeroDivisionError": ZeroDivisionError,
        "abs": abs,
        "all": all,
        "any": any,
        "bool": bool,
        "callable": callable,
        "chr": chr,
        "dict": dict,
        "divmod": divmod,
        "enumerate": enumerate,
        "filter": filter,
        "float": float,
        "format": format,
        "frozenset": frozenset,
        "hash": hash,
        "int": int,
        "isinstance": isinstance,
        "issubclass": issubclass,
        "iter": iter,
        "len": len,
        "list": list,
        "map": map,
        "max": max,
        "min": min,
        "next": next,
        "ord": ord,
        "pow": pow,
        "print": print,
        "range": range,
        "repr": repr,
        "reversed": reversed,
        "round": round,
        "set": set,
        "slice": slice,
        "sorted": sorted,
        "str": str,
        "sum": sum,
        "tuple": tuple,
        "zip": zip,
    }

    def _serialize(obj):
        try:
            import pandas as pd
            import numpy as np
            if isinstance(obj, pd.DataFrame):
                return {"__type__": "dataframe", "columns": list(obj.columns), "rows": obj.values.tolist()}
            if isinstance(obj, pd.Series):
                return {"__type__": "series", "index": list(obj.index), "values": obj.tolist()}
            if isinstance(obj, np.ndarray):
                return {"__type__": "ndarray", "value": obj.tolist()}
            if isinstance(obj, (np.integer,)):
                return int(obj)
            if isinstance(obj, (np.floating,)):
                return float(obj)
            if isinstance(obj, (np.bool_,)):
                return bool(obj)
        except ImportError:
            pass
        if isinstance(obj, (list, tuple)):
            return [_serialize(v) for v in obj]
        if isinstance(obj, dict):
            return {str(k): _serialize(v) for k, v in obj.items()}
        if isinstance(obj, (str, int, float, bool)) or obj is None:
            return obj
        return str(obj)

    def main():
        payload = json.loads(sys.stdin.read())
        user_code = payload["user_code"]
        function_name = payload["function_name"]
        inputs = payload.get("inputs") or {}

        namespace = {"__name__": "__user__", "__builtins__": SAFE_BUILTINS}
        try:
            exec(compile(user_code, "<user>", "exec"), namespace)
        except Exception:
            print(json.dumps({"success": False, "error": traceback.format_exc()}))
            return

        fn = namespace.get(function_name)
        if fn is None or not callable(fn):
            print(json.dumps({"success": False, "error": f"Function '{function_name}' not found or not callable"}))
            return

        try:
            result = fn(**inputs)
            print(json.dumps({"success": True, "result": _serialize(result), "error": None}))
        except Exception:
            print(json.dumps({"success": False, "error": traceback.format_exc()}))

    if __name__ == "__main__":
        main()
    """
)


class PythonSecurityError(ValueError):
    pass


def _validate_imports(source: str) -> None:
    """Reject imports outside the allowlist."""
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        raise PythonSecurityError(f"Syntax error: {e}") from e

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in ALLOWED_MODULES:
                    raise PythonSecurityError(f"Import not allowed: {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                root = node.module.split(".")[0]
                if root not in ALLOWED_MODULES:
                    raise PythonSecurityError(f"Import not allowed: {node.module}")
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in BLOCKED_BUILTINS:
                raise PythonSecurityError(f"Built-in not allowed: {node.func.id}")
        elif isinstance(node, ast.Attribute):
            if node.attr in BLOCKED_DUNDER_ATTRIBUTES:
                raise PythonSecurityError(f"Attribute not allowed: {node.attr}")


def _normalize_value(value: Any) -> Any:
    if isinstance(value, dict) and value.get("__type__") == "dataframe":
        return {"columns": value.get("columns", []), "rows": value.get("rows", [])}
    if isinstance(value, dict) and value.get("__type__") == "series":
        return {"index": value.get("index", []), "values": value.get("values", [])}
    if isinstance(value, dict) and value.get("__type__") == "ndarray":
        return value.get("value")
    if isinstance(value, float):
        return round(value, 9)
    if isinstance(value, list):
        return [_normalize_value(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _normalize_value(v) for k, v in value.items()}
    return value


def _values_equal(expected: Any, actual: Any, *, unordered: bool = False) -> bool:
    expected = _normalize_value(expected)
    actual = _normalize_value(actual)

    if isinstance(expected, float) and isinstance(actual, (int, float)):
        return abs(float(expected) - float(actual)) < 1e-6
    if isinstance(actual, float) and isinstance(expected, (int, float)):
        return abs(float(actual) - float(expected)) < 1e-6

    if isinstance(expected, list) and isinstance(actual, list):
        if unordered:
            try:
                return sorted(json.dumps(_normalize_value(v), sort_keys=True) for v in expected) == sorted(
                    json.dumps(_normalize_value(v), sort_keys=True) for v in actual
                )
            except TypeError:
                pass
        return len(expected) == len(actual) and all(
            _values_equal(e, a) for e, a in zip(expected, actual)
        )

    if isinstance(expected, dict) and isinstance(actual, dict):
        if set(expected.keys()) != set(actual.keys()):
            return False
        return all(_values_equal(expected[k], actual[k]) for k in expected)

    return expected == actual


def _run_in_subprocess(user_code: str, function_name: str, inputs: Dict[str, Any]) -> Dict[str, Any]:
    _validate_imports(user_code)

    payload = json.dumps({
        "user_code": user_code,
        "function_name": function_name,
        "inputs": inputs or {},
    })

    with tempfile.TemporaryDirectory() as tmp:
        runner_path = Path(tmp) / "runner.py"
        runner_path.write_text(RUNNER_SCRIPT, encoding="utf-8")

        start = time.perf_counter()
        try:
            proc = subprocess.run(
                [sys.executable, str(runner_path)],
                input=payload,
                capture_output=True,
                text=True,
                timeout=EXECUTION_TIMEOUT_SECONDS,
                cwd=tmp,
            )
        except subprocess.TimeoutExpired:
            elapsed_ms = (time.perf_counter() - start) * 1000
            return {
                "success": False,
                "result": None,
                "execution_time_ms": round(elapsed_ms, 2),
                "error": f"Execution timed out after {EXECUTION_TIMEOUT_SECONDS}s",
            }

        elapsed_ms = (time.perf_counter() - start) * 1000

        if proc.returncode != 0:
            err = proc.stderr.strip() or proc.stdout.strip() or "Unknown execution error"
            return {
                "success": False,
                "result": None,
                "execution_time_ms": round(elapsed_ms, 2),
                "error": err[:4000],
            }

        try:
            data = json.loads(proc.stdout.strip() or "{}")
        except json.JSONDecodeError:
            return {
                "success": False,
                "result": None,
                "execution_time_ms": round(elapsed_ms, 2),
                "error": f"Invalid runner output: {proc.stdout[:500]}",
            }

        data["execution_time_ms"] = round(elapsed_ms, 2)
        return data


def execute_python_function(
    user_code: str,
    function_name: str,
    inputs: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Run user code and call function_name(**inputs)."""
    try:
        result = _run_in_subprocess(user_code, function_name, inputs or {})
        return {
            "success": bool(result.get("success")),
            "output": result.get("result"),
            "execution_time_ms": result.get("execution_time_ms", 0),
            "error": result.get("error"),
        }
    except PythonSecurityError as e:
        return {
            "success": False,
            "output": None,
            "execution_time_ms": 0,
            "error": str(e),
        }
    except Exception as e:
        return {
            "success": False,
            "output": None,
            "execution_time_ms": 0,
            "error": str(e),
        }


def run_python_test_cases(
    user_code: str,
    function_name: str,
    test_cases: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Run user code against multiple Python test cases."""
    results = []
    passed = 0

    for i, tc in enumerate(test_cases):
        inputs = tc.get("inputs") or {}
        expected = tc.get("expected")
        unordered = bool(tc.get("compare_unordered", False))

        run_result = execute_python_function(user_code, function_name, inputs)

        if run_result["success"]:
            is_correct = _values_equal(expected, run_result["output"], unordered=unordered)
        else:
            is_correct = False

        if is_correct:
            passed += 1

        results.append({
            "test_case_index": i,
            "passed": is_correct,
            "inputs": inputs,
            "expected": {"value": expected},
            "actual": {"value": run_result["output"]},
            "error": run_result["error"],
            "execution_time_ms": run_result["execution_time_ms"],
        })

    return {
        "passed": passed,
        "total": len(test_cases),
        "all_passed": passed == len(test_cases),
        "details": results,
    }


def build_python_test_cases(problem: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Build full test case list from a problem dict or ORM object."""
    visible = {
        "description": "Visible test case",
        "inputs": (problem.get("expected_output") or {}).get("inputs", {}),
        "expected": (problem.get("expected_output") or {}).get("expected"),
        "compare_unordered": (problem.get("expected_output") or {}).get("compare_unordered", False),
    }
    hidden = []
    for htc in problem.get("hidden_test_cases") or []:
        hidden.append({
            "description": htc.get("description", "Hidden test case"),
            "inputs": htc.get("inputs") or {},
            "expected": htc.get("expected"),
            "compare_unordered": htc.get("compare_unordered", False),
        })
    return [visible] + hidden
