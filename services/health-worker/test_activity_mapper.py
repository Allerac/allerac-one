import json
import math
import os
import unittest

import garmin

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _load_fixture(name: str) -> dict:
    with open(os.path.join(FIXTURES_DIR, name), encoding="utf-8") as f:
        return json.load(f)


class ActivityMapperTests(unittest.TestCase):
    def test_distinguishes_zero_from_missing(self):
        zero_result = garmin.normalize_activity_summary({"avgPower": 0})["normalized"]
        missing_result = garmin.normalize_activity_summary({})["normalized"]

        self.assertEqual(zero_result["average_power_watts"], 0.0)
        self.assertIsNone(missing_result["average_power_watts"])

    def test_rejects_non_finite_values(self):
        result = garmin.normalize_activity_summary({
            "avgPower": float("nan"),
            "maxPower": float("inf"),
        })["normalized"]

        self.assertIsNone(result["average_power_watts"])
        self.assertIsNone(result["max_power_watts"])

    def test_records_field_provenance_for_ambiguous_mappings(self):
        mapping = garmin.normalize_activity_summary({"movingDuration": 120})
        self.assertEqual(mapping["field_provenance"]["moving_time_seconds"], "movingDuration")

    def test_barcelona_run_fixture_maps_expected_units(self):
        activity = _load_fixture("barcelona-run.json")
        normalized = garmin.normalize_activity_summary(activity)["normalized"]

        self.assertEqual(normalized["provider"], "garmin")
        self.assertEqual(normalized["sport_type"], "running")
        self.assertEqual(normalized["timezone"], "Europe/Madrid")

        # 5.01 km in 34:56 -> ~6:59/km (419s/km)
        self.assertAlmostEqual(normalized["average_pace_seconds_per_km"], 419.0, delta=1.0)

        self.assertEqual(normalized["training_effect_aerobic"], 3.4)
        self.assertEqual(normalized["exercise_load"], 93.0)
        self.assertEqual(normalized["average_power_watts"], 229.0)
        self.assertEqual(normalized["average_cadence_spm"], 164.0)
        self.assertAlmostEqual(normalized["average_stride_length_meters"], 0.85, delta=1e-9)
        self.assertEqual(normalized["average_vertical_oscillation_cm"], 8.2)
        self.assertEqual(normalized["average_ground_contact_time_ms"], 285.0)
        self.assertEqual(normalized["beginning_stamina_percent"], 100.0)
        self.assertEqual(normalized["ending_stamina_percent"], 66.0)
        self.assertEqual(normalized["vo2_max"], 47.0)

    def test_strength_training_fixture_has_no_pace_or_cadence(self):
        activity = _load_fixture("strength-training.json")
        normalized = garmin.normalize_activity_summary(activity)["normalized"]

        self.assertEqual(normalized["sport_type"], "strength_training")
        self.assertIsNone(normalized["average_pace_seconds_per_km"])
        self.assertIsNone(normalized["average_cadence_spm"])
        self.assertEqual(normalized["moving_time_seconds"], 3200.0)


class ActivityDetailMapperTests(unittest.TestCase):
    def test_maps_laps_with_cumulative_offsets(self):
        splits = {
            "lapDTOs": [
                {"duration": 300.0, "distance": 1000.0, "averageSpeed": 3.33, "averageHR": 150},
                {"duration": 280.0, "distance": 1000.0, "averageSpeed": 3.57, "averageHR": 158},
            ]
        }
        laps = garmin._map_laps(splits)

        self.assertEqual(len(laps), 2)
        self.assertEqual(laps[0]["lap_index"], 1)
        self.assertEqual(laps[0]["start_offset_seconds"], 0.0)
        self.assertEqual(laps[1]["lap_index"], 2)
        self.assertEqual(laps[1]["start_offset_seconds"], 300.0)

    def test_maps_zones_with_percent_of_total(self):
        zones = [
            {"zoneNumber": 1, "secsInZone": 100.0, "zoneLowBoundary": 100},
            {"zoneNumber": 2, "secsInZone": 300.0, "zoneLowBoundary": 140},
        ]
        mapped = garmin._map_zones(zones, "heart_rate")

        self.assertEqual(len(mapped), 2)
        self.assertEqual(mapped[0]["metric_type"], "heart_rate")
        self.assertAlmostEqual(mapped[0]["percent"], 25.0)
        self.assertAlmostEqual(mapped[1]["percent"], 75.0)

    def test_one_failed_resource_does_not_abort_details(self):
        from unittest.mock import Mock, patch

        with patch("garmin._garmin_from_session") as from_session:
            client = Mock()
            from_session.return_value = client
            client.get_activity_splits.side_effect = RuntimeError("splits unavailable")
            client.get_activity_hr_in_timezones.return_value = [
                {"zoneNumber": 1, "secsInZone": 100.0, "zoneLowBoundary": 100},
            ]
            client.get_activity_power_in_timezones.side_effect = RuntimeError("no power meter")
            client.get_activity_details.side_effect = RuntimeError("no route data")

            result = garmin.fetch_activity_details("dump", "123")

        self.assertEqual(result["laps"], [])
        self.assertEqual(len(result["zones"]), 1)
        self.assertIn("laps", result["errors"])
        self.assertIn("zones_power", result["errors"])
        self.assertIn("route", result["errors"])
        self.assertNotIn("zones_heart_rate", result["errors"])


class RoutePolylineTests(unittest.TestCase):
    def test_douglas_peucker_collapses_collinear_points(self):
        points = [(0.0, 0.0), (1.0, 1.0), (2.0, 2.0), (3.0, 3.0)]
        simplified = garmin._douglas_peucker(points, epsilon=0.001)
        self.assertEqual(simplified, [(0.0, 0.0), (3.0, 3.0)])

    def test_douglas_peucker_preserves_a_real_bend(self):
        # Diagonal from (0,0) to (2,2), then a sharp turn straight up to (2,4).
        points = [(0.0, 0.0), (1.0, 1.0), (2.0, 2.0), (2.0, 3.0), (2.0, 4.0)]
        simplified = garmin._douglas_peucker(points, epsilon=0.001)
        self.assertIn((2.0, 2.0), simplified)
        self.assertEqual(simplified[0], (0.0, 0.0))
        self.assertEqual(simplified[-1], (2.0, 4.0))

    def test_simplify_route_respects_max_points(self):
        points = [(float(i) * 0.0001, float(i) * 0.00005) for i in range(1000)]
        simplified = garmin.simplify_route(points, epsilon=0.00001, max_points=50)
        self.assertLessEqual(len(simplified), 50)

    def test_simplify_route_is_a_no_op_under_the_cap(self):
        points = [(0.0, 0.0), (1.0, 1.0)]
        self.assertEqual(garmin.simplify_route(points, max_points=500), points)

    def test_encode_polyline_matches_google_reference_example(self):
        # Official example from Google's Encoded Polyline Algorithm Format docs.
        points = [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]
        encoded = garmin.encode_polyline(points)
        self.assertEqual(encoded, "_p~iF~ps|U_ulLnnqC_mqNvxq`@")


class MetricsAndGpsMergeTests(unittest.TestCase):
    def test_parses_activity_metrics_by_descriptor_index(self):
        details = _load_fixture("barcelona-run-details.json")
        samples = garmin._parse_activity_metrics(details)

        self.assertEqual(len(samples), 5)
        self.assertEqual(samples[0]["timestamp"], 1000.0)
        self.assertEqual(samples[0]["elapsed_seconds"], 0.0)
        self.assertEqual(samples[2]["heart_rate_bpm"], 162.0)
        self.assertAlmostEqual(samples[2]["pace_seconds_per_km"], 1000.0 / 2.5, delta=1e-6)
        self.assertIsNone(samples[0]["latitude"])

    def test_merges_gps_points_onto_existing_samples(self):
        details = _load_fixture("barcelona-run-details.json")
        samples = garmin._parse_activity_metrics(details)
        merged = garmin._merge_gps_points(samples, details["geoPolylineDTO"]["polyline"])

        self.assertEqual(merged[2]["latitude"], 10.0002)
        self.assertEqual(merged[2]["longitude"], 20.0002)
        # heart_rate from the metrics series must survive the merge
        self.assertEqual(merged[2]["heart_rate_bpm"], 162.0)

    def test_builds_samples_from_polyline_when_no_metrics_exist(self):
        polyline = [
            {"lat": 1.0, "lon": 2.0, "altitude": 5.0, "time": 1000},
            {"lat": 1.001, "lon": 2.001, "altitude": 5.5, "time": 2000},
        ]
        merged = garmin._merge_gps_points([], polyline)

        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[1]["elapsed_seconds"], 1000.0)
        self.assertEqual(merged[1]["latitude"], 1.001)

    def test_route_bounds_from_geo_polyline(self):
        details = _load_fixture("barcelona-run-details.json")
        bounds = garmin._route_bounds(details["geoPolylineDTO"])

        self.assertEqual(bounds["min_lat"], 10.0000)
        self.assertEqual(bounds["max_lat"], 10.0004)

    def test_fetch_activity_details_includes_route_and_samples(self):
        from unittest.mock import Mock, patch

        details_fixture = _load_fixture("barcelona-run-details.json")

        with patch("garmin._garmin_from_session") as from_session:
            client = Mock()
            from_session.return_value = client
            client.get_activity_splits.return_value = {"lapDTOs": []}
            client.get_activity_hr_in_timezones.return_value = []
            client.get_activity_power_in_timezones.return_value = []
            client.get_activity_details.return_value = details_fixture

            result = garmin.fetch_activity_details("dump", "123")

        self.assertEqual(result["errors"], {})
        self.assertEqual(len(result["samples"]), 5)
        self.assertIsNotNone(result["route_bounds"])
        self.assertIsInstance(result["route_simplified_polyline"], str)
        self.assertGreater(len(result["route_simplified_polyline"]), 0)


if __name__ == "__main__":
    unittest.main()
