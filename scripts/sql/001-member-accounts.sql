-- MariaDB 11.4 / MySQL 8. Select the site's database in phpMyAdmin first.
-- Non-destructive: no DROP, ALTER or existing-data changes.
CREATE TABLE IF NOT EXISTS maestro_users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  username VARCHAR(30) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role ENUM('member', 'admin') NOT NULL DEFAULT 'member',
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY maestro_users_email_unique (email),
  UNIQUE KEY maestro_users_username_unique (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maestro_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token_hash),
  KEY maestro_sessions_expiry (expires_at),
  KEY maestro_sessions_user (user_id),
  CONSTRAINT maestro_sessions_user_fk FOREIGN KEY (user_id)
    REFERENCES maestro_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maestro_auth_limits (
  bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (bucket_key),
  KEY maestro_auth_limits_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
