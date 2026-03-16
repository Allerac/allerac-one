-- OIDC provider model storage
-- Stores all oidc-provider model types: Session, AccessToken, AuthorizationCode,
-- RefreshToken, ClientCredentials, Interaction, Grant, etc.
-- One table handles all model types via the (model_name, id) composite key.

CREATE TABLE IF NOT EXISTS oidc_models (
  model_name  TEXT   NOT NULL,
  id          TEXT   NOT NULL,
  payload     JSONB  NOT NULL DEFAULT '{}',
  granted_at  BIGINT,
  consumed_at BIGINT,
  expires_at  BIGINT,
  uid         TEXT,            -- Session uid (used by findByUid)
  user_code   TEXT,            -- DeviceCode user_code (used by findByUserCode)
  PRIMARY KEY (model_name, id)
);

-- Fast lookup by Session uid
CREATE UNIQUE INDEX IF NOT EXISTS uidx_oidc_models_uid
  ON oidc_models (model_name, uid)
  WHERE uid IS NOT NULL;

-- Fast lookup by DeviceCode user_code
CREATE UNIQUE INDEX IF NOT EXISTS uidx_oidc_models_user_code
  ON oidc_models (model_name, user_code)
  WHERE user_code IS NOT NULL;

-- Efficient expiry-based cleanup
CREATE INDEX IF NOT EXISTS idx_oidc_models_expires_at
  ON oidc_models (expires_at)
  WHERE expires_at IS NOT NULL;

-- Fast revocation by grantId (cross-model-type)
CREATE INDEX IF NOT EXISTS idx_oidc_models_grant_id
  ON oidc_models ((payload->>'grantId'))
  WHERE payload->>'grantId' IS NOT NULL;
