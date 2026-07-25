import unittest
from unittest.mock import Mock, patch

import garmin


class ActivityCorrectionTests(unittest.TestCase):
    @patch("garmin._garmin_from_session")
    def test_updates_and_verifies_exercise_sets(self, from_session):
        client = Mock()
        from_session.return_value = client
        sets = [{
            "setType": "ACTIVE",
            "repetitionCount": 10,
            "exercises": [{"category": "BENCH_PRESS", "name": "BARBELL_BENCH_PRESS"}],
        }]
        client.get_activity_exercise_sets.return_value = {
            "activityId": 123,
            "exerciseSets": sets,
        }

        result = garmin.update_activity_exercise_sets("dump", "123", sets)

        client.garth.request.assert_called_once_with(
            "PUT",
            "connectapi",
            "/activity-service/activity/123/exerciseSets",
            api=True,
            json={"activityId": 123, "exerciseSets": sets},
        )
        client.get_activity_exercise_sets.assert_called_once_with("123")
        self.assertEqual(result["activity_id"], "123")

    def test_rejects_invalid_activity_id(self):
        with self.assertRaises(ValueError):
            garmin.update_activity_exercise_sets("dump", "../123", [{}])


if __name__ == "__main__":
    unittest.main()
