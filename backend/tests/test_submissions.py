import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.db.models import Problem, Submission, UserProblemState
from app.routers import submissions


class SubmissionStatusTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        self.db = self.Session()
        self.profile_id = "profile-1"
        self.problem = Problem(
            id="problem-1",
            problem_number=1,
            title="Partial Credit",
            description="Return ids",
            language="sql",
            difficulty="easy",
            dialect="sqlite",
            topic_tags=["SELECT"],
            schema_sql="CREATE TABLE t (id INT);",
            sample_data_sql="INSERT INTO t VALUES (1);",
            expected_output={"columns": ["id"], "rows": [[1]]},
            hidden_test_cases=[],
            hints=[],
            editorial=[],
            created_by_profile_id=self.profile_id,
        )
        self.db.add(self.problem)
        self.python_problem = Problem(
            id="problem-python-1",
            problem_number=1,
            title="Partial Python",
            description="Return x",
            language="python",
            difficulty="easy",
            dialect="mysql",
            function_name="solve",
            starter_code="def solve(x):\n    pass",
            topic_tags=["Python Basics"],
            schema_sql="",
            sample_data_sql="",
            expected_output={"inputs": {"x": 1}, "expected": 1},
            hidden_test_cases=[],
            hints=[],
            editorial=[],
            created_by_profile_id=self.profile_id,
        )
        self.db.add(self.python_problem)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _submit_with_result(self, tc_result):
        with patch.object(submissions, "run_test_cases", return_value=tc_result):
            return submissions.submit_solution(
                submissions.SubmitRequest(
                    profile_id=self.profile_id,
                    problem_id=self.problem.id,
                    sql="SELECT 1",
                    dialect="sqlite",
                ),
                db=self.db,
            )

    def test_any_passing_test_case_is_accepted_and_solved(self):
        response = self._submit_with_result({
            "passed": 1,
            "total": 2,
            "all_passed": False,
            "details": [
                {"execution_time_ms": 1, "error": None},
                {"execution_time_ms": 1, "error": None},
            ],
        })

        self.assertEqual(response["status"], "accepted")
        self.assertFalse(response["all_passed"])
        self.assertEqual(response["test_cases_passed"], 1)

        state = self.db.query(UserProblemState).filter_by(
            profile_id=self.profile_id,
            problem_id=self.problem.id,
        ).one()
        self.assertEqual(state.status, "solved")

        submission = self.db.query(Submission).one()
        self.assertEqual(submission.status, "accepted")

    def test_python_any_passing_test_case_is_accepted_and_solved(self):
        with patch.object(submissions, "run_python_test_cases", return_value={
            "passed": 1,
            "total": 2,
            "all_passed": False,
            "details": [
                {"execution_time_ms": 1, "error": None},
                {"execution_time_ms": 1, "error": None},
            ],
        }):
            response = submissions.submit_solution(
                submissions.SubmitRequest(
                    profile_id=self.profile_id,
                    problem_id=self.python_problem.id,
                    sql="def solve(x):\n    return x",
                    dialect="mysql",
                ),
                db=self.db,
            )

        self.assertEqual(response["status"], "accepted")
        self.assertFalse(response["all_passed"])

        state = self.db.query(UserProblemState).filter_by(
            profile_id=self.profile_id,
            problem_id=self.python_problem.id,
        ).one()
        self.assertEqual(state.status, "solved")

    def test_zero_passing_test_cases_is_wrong_answer_without_errors(self):
        response = self._submit_with_result({
            "passed": 0,
            "total": 2,
            "all_passed": False,
            "details": [
                {"execution_time_ms": 1, "error": None},
                {"execution_time_ms": 1, "error": None},
            ],
        })

        self.assertEqual(response["status"], "wrong_answer")

        state = self.db.query(UserProblemState).filter_by(
            profile_id=self.profile_id,
            problem_id=self.problem.id,
        ).one()
        self.assertEqual(state.status, "attempted")


if __name__ == "__main__":
    unittest.main()
