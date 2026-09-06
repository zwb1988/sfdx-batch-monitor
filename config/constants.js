const BATCH_ANALYSIS_BULK_WAIT_MINUTES = 180

module.exports = {
  PORT: process.env.PORT || 3000,
  DEFAULT_REFRESH_INTERVAL_SEC: 10,
  MIN_REFRESH_INTERVAL_SEC: 1,
  DEFAULT_SOQL_LIMIT: 100,
  MAX_SOQL_LIMIT: 2000,
  /** Hard cap on AsyncApexJob rows loaded into memory after bulk export. */
  BATCH_ANALYSIS_MAX_TOTAL_ROWS: 100000,
  /** Max minutes to wait for `sf data export bulk` (Bulk API 2.0 query job). */
  BATCH_ANALYSIS_BULK_WAIT_MINUTES,
  /** Child-process timeout: bulk wait window plus buffer for finishing I/O. */
  SF_CLI_BATCH_EXPORT_TIMEOUT_MS: (BATCH_ANALYSIS_BULK_WAIT_MINUTES * 60 + 120) * 1000,
  SF_CLI_TIMEOUT_MS: 60000,
  SF_CLI_MAX_BUFFER: 50 * 1024 * 1024,
  /** Connect REST API version used to list Data Cloud connectors and data streams. */
  DATA_CLOUD_CONNECT_API_VERSION: '62.0',
  DATA_CLOUD_MAX_CSV_BYTES: 150 * 1024 * 1024,
  DATA_CLOUD_MAX_CSV_FILES: 100,
  DATA_CLOUD_HTTP_TIMEOUT_MS: 180000,
  DATA_CLOUD_UPLOAD_TIMEOUT_MS: 600000,
  DATA_CLOUD_JOB_POLL_INTERVAL_MS: 5000
}
