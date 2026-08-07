// Explicit column whitelist for activity list/detail responses — never
// `SELECT *`. health_activities also holds `raw_data` (the original Garmin
// list payload) and `provider_details_raw` (the full Phase 2/3 detail-sync
// payload — easily hundreds of KB and the source of embedded GPS samples),
// kept only for reprocessing/audit, never for API responses. Per
// docs/api/control-api-v1/health.md's documented contract, these endpoints
// never include raw provider payloads or GPS coordinates — use the
// dedicated (redacted, bounded) /route endpoint for coordinates.
export const ACTIVITY_DETAIL_COLUMNS = `
  activity_id, activity_name, activity_type, sport_type, sub_sport_type, date,
  start_time_seconds, start_time_local, duration_seconds, moving_time_seconds,
  elapsed_time_seconds, calories, distance_meters, avg_heart_rate, max_heart_rate,
  elevation_gain, elevation_loss, average_pace_seconds_per_km, best_pace_seconds_per_km,
  average_power_watts, max_power_watts, min_elevation_meters, max_elevation_meters,
  average_cadence_spm, max_cadence_spm, average_stride_length_meters,
  average_vertical_oscillation_cm, average_vertical_ratio_percent,
  average_ground_contact_time_ms, estimated_sweat_loss_ml, beginning_stamina_percent,
  ending_stamina_percent, minimum_stamina_percent, training_effect_aerobic,
  training_effect_anaerobic, training_benefit, exercise_load, vo2_max, provider,
  provider_activity_id, timezone, detail_sync_status, detail_synced_at, payload_version
`;
