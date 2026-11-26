import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import app

client = TestClient(app)


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


class ReportTest(unittest.TestCase):
    @patch("app.ask_openrouter", return_value="Signups are flat.")
    @patch("app.httpx.post")
    def test_report_runs_metabase_card_with_days_parameter(self, post, ask_llm):
        post.side_effect = [
            FakeResponse({"data": {"rows": [[1, 10], [2, 20]],
                                   "cols": [{"name": "stage"}, {"name": "users"}]}}),
            FakeResponse({"choices": [{"message": {"content": "unused"}}]}),
        ]
        response = client.post("/api/report", json={"preset": "funnel", "days": 7})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["rows"], [[1, 10], [2, 20]])
        self.assertEqual(body["columns"], ["stage", "users"])
        self.assertEqual(body["insight"], "Signups are flat.")
        self.assertEqual(body["question_id"], 41)
        self.assertIn("/api/card/41/query", post.call_args_list[0].args[0])
        params = post.call_args_list[0].kwargs["json"]["parameters"]
        self.assertEqual(params[0]["value"], 7)
        self.assertEqual(params[0]["target"], ["variable", ["template-tag", "days"]])

    def test_unknown_preset_is_422(self):
        self.assertEqual(client.post("/api/report", json={"preset": "nope"}).status_code, 422)

    def test_health(self):
        self.assertEqual(client.get("/api/health").json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
