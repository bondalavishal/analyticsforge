import json
import re
import logging
from typing import Any, Dict, List, Optional

from app.llm.fallback_chain import get_chain_for_profile, get_local_chain_for_profile
from app.services.sql_service import execute_sql, validate_sql_syntax, _rows_equal_unordered

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert SQL problem designer for a platform like LeetCode.
Your job is to generate high-quality, educational SQL problems that test real database skills.
Always respond with valid JSON only — no markdown, no code blocks, no explanation outside the JSON."""

PROBLEM_PROMPT_TEMPLATE = """Generate a SQL practice problem with the following requirements:
- Topic: {topic}
- Difficulty: {difficulty}
- SQL Dialect: {dialect}
- Dataset context: {dataset_context}
- Additional constraints: {pinned_constraints}

Return a JSON object with EXACTLY this structure:
{{
  "title": "Short descriptive title",
  "description": "Full problem description in markdown. Include the task clearly.",
  "difficulty": "{difficulty}",
  "dialect": "{dialect}",
  "topic_tags": ["TAG1", "TAG2"],
  "schema_sql": "CREATE TABLE ... statements only",
  "sample_data_sql": "INSERT INTO ... statements for sample data",
  "expected_output": {{
    "columns": ["col1", "col2"],
    "rows": [[val1, val2], [val3, val4]]
  }},
  "hidden_test_cases": [
    {{
      "description": "Edge case description",
      "data_sql": "INSERT INTO ... statements for this test case",
      "expected_output": {{"columns": ["col1"], "rows": [[val]]}}
    }},
    {{
      "description": "Another edge case",
      "data_sql": "INSERT INTO ...",
      "expected_output": {{"columns": ["col1"], "rows": []}}
    }},
    {{
      "description": "NULL handling case",
      "data_sql": "INSERT INTO ...",
      "expected_output": {{"columns": ["col1"], "rows": [[null]]}}
    }}
  ],
  "hints": [
    "First hint — very general, points toward the approach without revealing SQL",
    "Second hint — more specific, mentions the SQL construct needed",
    "Third hint — near solution, shows structure without full answer"
  ],
  "editorial": [
    {{
      "approach_name": "Simple Approach",
      "explanation": "Detailed explanation of this approach",
      "solution_sql": "Full working SQL solution",
      "time_complexity": "O(n log n)",
      "space_complexity": "O(n)"
    }},
    {{
      "approach_name": "Optimal Approach",
      "explanation": "More efficient approach explanation",
      "solution_sql": "Optimized SQL solution",
      "time_complexity": "O(n)",
      "space_complexity": "O(1)"
    }}
  ]
}}

IMPORTANT:
- schema_sql and sample_data_sql must be valid SQL for the specified dialect
- The expected_output must be exactly what the optimal solution SQL produces on the sample data
- hidden_test_cases use the same schema_sql but different data (data_sql replaces sample_data_sql)
- Make the problem realistic and educational
- Difficulty: easy=single JOIN or GROUP BY, medium=multiple JOINs/subqueries/window functions, hard=complex CTEs/nested queries

STRICT TEST DATA RULES — boundary consistency is critical:
- NEVER place a data value exactly on a threshold mentioned in the problem (e.g. if the problem says "> 1000", no row should have a value of exactly 1000 in any test case). Use clearly above/below values instead (e.g. 999 or 1001).
- Every hidden_test_case expected_output must be produced by running the SAME solution SQL against that test case's data_sql. If the description says "greater than X", the solution uses "> X" — ensure NO test row lands on X exactly.
- Include at least one hidden test case where the correct answer is an empty result set (all rows filtered out).
- Numeric values in expected_output rows must match the type returned by the SQL (use integers for COUNT/integer columns, not floats)."""


ADAPTIVE_PROMPT_TEMPLATE = """Generate a SQL practice problem tailored to help a user improve their weak areas.

User's weakness analysis:
{weakness_analysis}

Additional requirements:
- Topic: {topic} (if "auto", choose based on weaknesses above)
- Difficulty: {difficulty} (if "auto", choose based on weaknesses)
- SQL Dialect: {dialect}

{base_problem_format}"""


def _extract_json(text: str) -> Dict:
    """Robustly extract JSON from LLM response, handling markdown code blocks."""
    # Remove markdown code blocks
    text = re.sub(r"```(?:json)?\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    text = text.strip()

    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Find first { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from LLM response: {text[:200]}")


def _validate_problem_json_response(text: str) -> None:
    """Validate that an LLM response contains a parseable JSON object."""
    _extract_json(text)


async def _self_vet(problem_dict: Dict, dialect: str) -> Dict:
    """Validate problem quality — checks schema, editorial solution, and all hidden TCs."""
    issues = []

    schema_sql = problem_dict.get("schema_sql", "")
    data_sql = problem_dict.get("sample_data_sql", "")
    expected = problem_dict.get("expected_output", {})

    if not schema_sql:
        issues.append("Missing schema_sql")
        return {"valid": False, "issues": issues}

    # Validate schema SQL
    schema_result = execute_sql("SELECT 1", dialect, schema_sql, "")
    if not schema_result["success"]:
        issues.append(f"Schema SQL invalid: {schema_result['error']}")

    # Validate editorial solution against visible expected output
    editorial = problem_dict.get("editorial", [])
    best_solution = ""
    if editorial:
        best_solution = editorial[-1].get("solution_sql", "")
        if best_solution:
            result = execute_sql(best_solution, dialect, schema_sql, data_sql)
            if not result["success"]:
                issues.append(f"Solution SQL error: {result['error']}")
            else:
                if not _rows_equal_unordered(expected.get("rows", []), result["rows"]):
                    issues.append("Solution output doesn't match expected_output — auto-fixing")
                    problem_dict["expected_output"] = {
                        "columns": result["columns"],
                        "rows": result["rows"],
                    }

    # Validate hidden test cases against the best editorial solution
    if best_solution:
        htcs = problem_dict.get("hidden_test_cases", [])
        for i, htc in enumerate(htcs):
            htc_data = htc.get("data_sql", data_sql)
            htc_expected = htc.get("expected_output", {})
            htc_result = execute_sql(best_solution, dialect, schema_sql, htc_data)
            if not htc_result["success"]:
                issues.append(f"HTC {i+1} SQL error: {htc_result['error']}")
            elif not _rows_equal_unordered(htc_expected.get("rows", []), htc_result["rows"]):
                issues.append(f"HTC {i+1} expected output mismatch — auto-fixing")
                htcs[i]["expected_output"] = {
                    "columns": htc_result["columns"],
                    "rows": htc_result["rows"],
                }
        problem_dict["hidden_test_cases"] = htcs

    return {"valid": len(issues) == 0, "issues": issues, "problem": problem_dict}


async def generate_problem(
    profile_id: str,
    db,
    topic: Optional[str] = None,
    difficulty: Optional[str] = None,
    dialect: str = "mysql",
    dataset_context: str = "LLM-invented schema",
    pinned_constraints: str = "None",
    telemetry: Optional[List[Dict[str, Any]]] = None,
) -> Dict:
    chain = await get_chain_for_profile(profile_id, db)

    topic_str = topic or "any SQL topic (JOIN, CTE, Window Function, Aggregation, Subquery)"
    difficulty_str = difficulty or "medium"

    prompt = PROBLEM_PROMPT_TEMPLATE.format(
        topic=topic_str,
        difficulty=difficulty_str,
        dialect=dialect,
        dataset_context=dataset_context,
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
            problem_dict["dialect"] = dialect
            problem_dict["language"] = "sql"

            # Self-vet
            vet_result = await _self_vet(problem_dict, dialect)
            if not vet_result["valid"] and attempt < max_attempts - 1:
                logger.warning(f"Problem failed vet (attempt {attempt+1}): {vet_result['issues']}")
                continue

            problem_dict = vet_result.get("problem", problem_dict)
            return problem_dict

        except Exception as e:
            logger.error(f"Problem generation attempt {attempt+1} failed: {e}")
            if attempt == max_attempts - 1:
                raise

    raise RuntimeError("Failed to generate valid problem after max attempts")


async def generate_adaptive_problem(
    profile_id: str,
    db,
    weakness_analysis: str,
    topic: str = "auto",
    difficulty: str = "auto",
    dialect: str = "mysql",
    local_only: bool = False,
    telemetry: Optional[List[Dict[str, Any]]] = None,
) -> Dict:
    chain = (
        await get_local_chain_for_profile(profile_id, db)
        if local_only
        else await get_chain_for_profile(profile_id, db)
    )

    base_format = PROBLEM_PROMPT_TEMPLATE.format(
        topic="{topic}", difficulty="{difficulty}", dialect=dialect,
        dataset_context="Choose an appropriate real-world dataset",
        pinned_constraints="Focus on the user's weak areas identified above",
    )

    prompt = ADAPTIVE_PROMPT_TEMPLATE.format(
        weakness_analysis=weakness_analysis,
        topic=topic,
        difficulty=difficulty,
        dialect=dialect,
        base_problem_format=base_format,
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
            problem_dict["dialect"] = dialect

            vet_result = await _self_vet(problem_dict, dialect)
            if not vet_result["valid"] and attempt < max_attempts - 1:
                logger.warning(f"Adaptive problem failed vet (attempt {attempt+1}): {vet_result['issues']}")
                continue

            return vet_result.get("problem", problem_dict)
        except Exception as e:
            logger.error(f"Adaptive problem generation attempt {attempt+1} failed: {e}")
            if attempt == max_attempts - 1:
                raise

    raise RuntimeError("Failed to generate valid adaptive problem after max attempts")


async def generate_wrong_answer_explanation(
    profile_id: str,
    db,
    problem_description: str,
    schema_sql: str,
    user_sql: str,
    expected_output: Dict,
    actual_output: Dict,
    dialect: str = "mysql",
) -> str:
    chain = await get_chain_for_profile(profile_id, db)

    prompt = f"""A student submitted an incorrect SQL answer. Explain what went wrong and how to fix it.

Problem: {problem_description}

Schema:
{schema_sql}

Student's SQL:
{user_sql}

Expected Output:
{json.dumps(expected_output, indent=2)}

Student's Actual Output:
{json.dumps(actual_output, indent=2)}

Provide a clear, educational explanation of:
1. What the student's SQL does wrong
2. Why the output differs from expected
3. The conceptual fix needed (don't just give the full answer)
Keep it concise and encouraging."""

    return await chain.try_generate(prompt, "You are a helpful SQL tutor.", max_tokens=1024)


async def generate_chat_response(
    profile_id: str,
    db,
    user_message: str,
    weakness_context: str = "",
    language: str = "sql",
) -> str:
    # AI assistant chat is local-first-only by product decision.
    chain = await get_local_chain_for_profile(profile_id, db)

    if (language or "sql").lower() == "python":
        system = """You are AnalyticsForge AI, a Python analytics practice assistant.
Help users find Python, data analysis, analytics engineering, and data science problems to practice.
When users ask for problems, recommend function-based Python practice and explain why.
Be concise, encouraging, and specific."""
    else:
        system = """You are AnalyticsForge AI, an SQL practice assistant.
Help users find SQL problems to practice, explain concepts, and guide their learning.
When users ask for problems, describe what kind of problem you'd recommend and why.
Be concise, encouraging, and specific."""

    prompt = user_message
    if weakness_context:
        prompt = f"User analytics context:\n{weakness_context}\n\nUser message: {user_message}"

    return await chain.try_generate(prompt, system, max_tokens=1024)
