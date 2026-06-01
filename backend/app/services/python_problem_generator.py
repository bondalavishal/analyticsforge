import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.llm.fallback_chain import get_chain_for_profile, get_local_chain_for_profile
from app.services.python_service import build_python_test_cases, execute_python_function, run_python_test_cases

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert Python problem designer for an analytics and data science practice platform.
Generate educational Python coding problems for learners practicing basics, data analysis, analytics engineering, and data science.
Always respond with valid JSON only — no markdown, no code blocks, no explanation outside the JSON."""

PYTHON_TOPICS = [
    "Python Basics",
    "Data Analysis",
    "Analytics Engineering",
    "Data Science",
]

PYTHON_PROBLEM_PROMPT = """Generate a Python function-based practice problem with these requirements:
- Topic area: {topic}
- Difficulty: {difficulty}
- Additional constraints: {pinned_constraints}

Return a JSON object with EXACTLY this structure:
{{
  "title": "Short descriptive title",
  "description": "Full problem description in markdown. Include examples with input/output.",
  "difficulty": "{difficulty}",
  "topic_tags": ["TAG1", "TAG2"],
  "function_name": "snake_case_function_name",
  "starter_code": "def function_name(...):\\n    # Your code here\\n    pass",
  "expected_output": {{
    "inputs": {{"arg1": value1, "arg2": value2}},
    "expected": <expected return value — list, dict, number, string, bool, or null>,
    "compare_unordered": false
  }},
  "hidden_test_cases": [
    {{
      "description": "Edge case description",
      "inputs": {{"arg1": value}},
      "expected": <expected return value>,
      "compare_unordered": false
    }},
    {{
      "description": "Another edge case",
      "inputs": {{}},
      "expected": <value>
    }},
    {{
      "description": "Empty or boundary case",
      "inputs": {{}},
      "expected": <value>
    }}
  ],
  "hints": [
    "First hint — general approach without revealing the solution",
    "Second hint — mentions the Python construct or pattern needed",
    "Third hint — near solution structure without full code"
  ],
  "editorial": [
    {{
      "approach_name": "Simple Approach",
      "explanation": "Detailed explanation",
      "solution_python": "def function_name(...):\\n    ...",
      "time_complexity": "O(n)",
      "space_complexity": "O(1)"
    }},
    {{
      "approach_name": "Optimal Approach",
      "explanation": "More efficient explanation",
      "solution_python": "def function_name(...):\\n    ...",
      "time_complexity": "O(n)",
      "space_complexity": "O(1)"
    }}
  ]
}}

TOPIC GUIDANCE:
- Python Basics: types, loops, comprehensions, strings, dicts/lists, functions, basic algorithms
- Data Analysis: pandas/numpy patterns, filtering, groupby-style logic, aggregations (can use lists of dicts if pandas is heavy)
- Analytics Engineering: data cleaning, deduplication, incremental logic, date parsing, schema normalization
- Data Science: statistics, feature prep, train/test splits, simple sklearn-style logic (describe algorithmically; use pure Python or numpy when possible)

IMPORTANT:
- function_name must match the def in starter_code and all editorial solutions
- starter_code must include a valid function signature with pass or ... body
- All test case inputs must match the function parameter names exactly
- expected values must be JSON-serializable (lists, dicts, numbers, strings, booleans, null)
- For list results where order does not matter, set compare_unordered: true
- Include at least 3 hidden test cases including one edge/boundary case
- Difficulty: easy=single concept, medium=combining 2 concepts or moderate logic, hard=multi-step analytics/DS reasoning
- Allowed imports in solutions: stdlib, pandas, numpy only when truly needed for the topic"""


ADAPTIVE_PYTHON_PROMPT = """Generate a Python practice problem tailored to the user's weak areas.

User weakness analysis:
{weakness_analysis}

Requirements:
- Topic: {topic} (if "auto", pick from weaknesses)
- Difficulty: {difficulty} (if "auto", pick appropriately)

{base_format}"""


def _extract_json(text: str) -> Dict:
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        return json.loads(text[start:end + 1])
    raise ValueError(f"Could not extract valid JSON from LLM response: {text[:200]}")


def _validate_problem_json_response(text: str) -> None:
    _extract_json(text)


async def _self_vet_python(problem_dict: Dict) -> Dict:
    issues = []
    function_name = problem_dict.get("function_name", "")
    if not function_name:
        issues.append("Missing function_name")
        return {"valid": False, "issues": issues}

    editorial = problem_dict.get("editorial", [])
    best_solution = ""
    if editorial:
        best_solution = editorial[-1].get("solution_python", "") or editorial[-1].get("solution_sql", "")

    if not best_solution:
        issues.append("Missing editorial solution")
        return {"valid": False, "issues": issues, "problem": problem_dict}

    # Ensure starter code defines the function
    starter = problem_dict.get("starter_code", "")
    if function_name not in starter:
        issues.append("starter_code missing function_name")

    test_cases = build_python_test_cases(problem_dict)
    tc_result = run_python_test_cases(best_solution, function_name, test_cases)

    for i, detail in enumerate(tc_result["details"]):
        if not detail["passed"]:
            issues.append(f"Test case {i + 1} failed — auto-fixing expected value")
            if i == 0:
                problem_dict.setdefault("expected_output", {})
                problem_dict["expected_output"]["expected"] = detail["actual"]["value"]
            else:
                htcs = problem_dict.get("hidden_test_cases", [])
                hidden_idx = i - 1
                if hidden_idx < len(htcs):
                    htcs[hidden_idx]["expected"] = detail["actual"]["value"]
                problem_dict["hidden_test_cases"] = htcs

    # Re-run after fixes
    test_cases = build_python_test_cases(problem_dict)
    tc_result = run_python_test_cases(best_solution, function_name, test_cases)
    if not tc_result["all_passed"]:
        issues.append(f"Reference solution still failing: {tc_result['passed']}/{tc_result['total']}")

    return {
        "valid": tc_result["all_passed"] and not any("Missing" in i for i in issues),
        "issues": issues,
        "problem": problem_dict,
    }


async def generate_python_problem(
    profile_id: str,
    db,
    topic: Optional[str] = None,
    difficulty: Optional[str] = None,
    pinned_constraints: str = "None",
    telemetry: Optional[List[Dict[str, Any]]] = None,
) -> Dict:
    chain = await get_chain_for_profile(profile_id, db)

    topic_str = topic or "any topic from Python Basics, Data Analysis, Analytics Engineering, or Data Science"
    difficulty_str = difficulty or "medium"

    prompt = PYTHON_PROBLEM_PROMPT.format(
        topic=topic_str,
        difficulty=difficulty_str,
        pinned_constraints=pinned_constraints,
    )

    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            raw = await chain.try_generate(
                prompt,
                SYSTEM_PROMPT,
                max_tokens=4096,
                validate_response=_validate_problem_json_response,
                telemetry=telemetry,
            )
            problem_dict = _extract_json(raw)
            problem_dict["language"] = "python"

            vet_result = await _self_vet_python(problem_dict)
            if not vet_result["valid"] and attempt < max_attempts - 1:
                logger.warning(f"Python problem failed vet (attempt {attempt + 1}): {vet_result['issues']}")
                continue

            return vet_result.get("problem", problem_dict)
        except Exception as e:
            logger.error(f"Python generation attempt {attempt + 1} failed: {e}")
            if attempt == max_attempts - 1:
                raise

    raise RuntimeError("Failed to generate valid Python problem after max attempts")


async def generate_adaptive_python_problem(
    profile_id: str,
    db,
    weakness_analysis: str,
    topic: str = "auto",
    difficulty: str = "auto",
    local_only: bool = False,
    telemetry: Optional[List[Dict[str, Any]]] = None,
) -> Dict:
    chain = (
        await get_local_chain_for_profile(profile_id, db)
        if local_only
        else await get_chain_for_profile(profile_id, db)
    )

    base_format = PYTHON_PROBLEM_PROMPT.format(
        topic="{topic}",
        difficulty="{difficulty}",
        pinned_constraints="Focus on the user's weak areas identified above",
    )

    prompt = ADAPTIVE_PYTHON_PROMPT.format(
        weakness_analysis=weakness_analysis,
        topic=topic,
        difficulty=difficulty,
        base_format=base_format,
    )

    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            raw = await chain.try_generate(
                prompt,
                SYSTEM_PROMPT,
                max_tokens=4096,
                validate_response=_validate_problem_json_response,
                telemetry=telemetry,
            )
            problem_dict = _extract_json(raw)
            problem_dict["language"] = "python"

            vet_result = await _self_vet_python(problem_dict)
            if not vet_result["valid"] and attempt < max_attempts - 1:
                continue

            return vet_result.get("problem", problem_dict)
        except Exception as e:
            logger.error(f"Adaptive Python generation attempt {attempt + 1} failed: {e}")
            if attempt == max_attempts - 1:
                raise

    raise RuntimeError("Failed to generate valid adaptive Python problem")
