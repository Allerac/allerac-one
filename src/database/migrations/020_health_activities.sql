-- Store Garmin activities for faster retrieval and historical tracking
CREATE TABLE health_activities (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id VARCHAR(255) NOT NULL,
  activity_name VARCHAR(255),
  activity_type VARCHAR(100),
  date DATE NOT NULL,
  start_time_seconds BIGINT,
  start_time_local VARCHAR(50),
  duration_seconds NUMERIC,
  calories NUMERIC,
  distance_meters NUMERIC,
  avg_heart_rate NUMERIC,
  max_heart_rate NUMERIC,
  elevation_gain NUMERIC,
  elevation_loss NUMERIC,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, activity_id)
);

CREATE INDEX idx_health_activities_user_id ON health_activities(user_id);
CREATE INDEX idx_health_activities_date ON health_activities(date);
CREATE INDEX idx_health_activities_user_date ON health_activities(user_id, date);
