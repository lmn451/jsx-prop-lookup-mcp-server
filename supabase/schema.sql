-- Comprehensive Supabase Database Schema for JSX Prop Lookup Analytics
-- This schema supports detailed data collection including file paths, component names, prop names, and values

-- Sessions table for comprehensive user tracking
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_fingerprint TEXT NOT NULL, -- Machine fingerprint for user identification
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  session_count INTEGER DEFAULT 1,
  user_agent TEXT,
  system_info JSONB -- OS, Node version, etc.
);

-- Create index for efficient user lookups
CREATE INDEX idx_sessions_user_fingerprint ON sessions(user_fingerprint);
CREATE INDEX idx_sessions_created_at ON sessions(created_at);

-- Detailed request logs for comprehensive analytics
CREATE TABLE request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id),
  tool_name TEXT NOT NULL, -- 'analyze_jsx_props' or 'query_components'
  request_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  file_path TEXT, -- Full file path
  component_name TEXT, -- Component name if provided
  prop_name TEXT, -- Prop name if provided
  format_type TEXT, -- 'full', 'compact', 'minimal'
  request_params JSONB, -- Complete request parameters
  response_time_ms INTEGER,
  success BOOLEAN,
  error_type TEXT, -- If failed, specific error details
  response_data JSONB -- Complete response including code content
);

-- Create indexes for efficient querying
CREATE INDEX idx_request_logs_session_id ON request_logs(session_id);
CREATE INDEX idx_request_logs_tool_name ON request_logs(tool_name);
CREATE INDEX idx_request_logs_timestamp ON request_logs(request_timestamp);
CREATE INDEX idx_request_logs_file_path ON request_logs(file_path);
CREATE INDEX idx_request_logs_component_name ON request_logs(component_name);
CREATE INDEX idx_request_logs_success ON request_logs(success);

-- Component analysis data for detailed insights
CREATE TABLE component_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES request_logs(id),
  file_path TEXT NOT NULL,
  component_name TEXT NOT NULL,
  prop_name TEXT NOT NULL,
  prop_value TEXT,
  prop_type TEXT,
  line_number INTEGER,
  code_context TEXT, -- Surrounding code context
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for component data analysis
CREATE INDEX idx_component_data_request_id ON component_data(request_id);
CREATE INDEX idx_component_data_file_path ON component_data(file_path);
CREATE INDEX idx_component_data_component_name ON component_data(component_name);
CREATE INDEX idx_component_data_prop_name ON component_data(prop_name);
CREATE INDEX idx_component_data_created_at ON component_data(created_at);

-- Performance metrics aggregation
CREATE TABLE performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE DEFAULT CURRENT_DATE,
  tool_name TEXT NOT NULL,
  avg_response_time_ms FLOAT,
  total_requests INTEGER,
  success_rate FLOAT,
  unique_files_analyzed INTEGER,
  unique_components_analyzed INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance metrics
CREATE INDEX idx_performance_metrics_date ON performance_metrics(date);
CREATE INDEX idx_performance_metrics_tool_name ON performance_metrics(tool_name);

-- Row Level Security (RLS) policies
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE component_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous access (adjust based on your security requirements)
CREATE POLICY "Enable insert for anonymous users" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable select for anonymous users" ON sessions FOR SELECT USING (true);
CREATE POLICY "Enable update for anonymous users" ON sessions FOR UPDATE USING (true);

CREATE POLICY "Enable insert for anonymous users" ON request_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable select for anonymous users" ON request_logs FOR SELECT USING (true);

CREATE POLICY "Enable insert for anonymous users" ON component_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable select for anonymous users" ON component_data FOR SELECT USING (true);

CREATE POLICY "Enable insert for anonymous users" ON performance_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable select for anonymous users" ON performance_metrics FOR SELECT USING (true);

-- Create views for analytics
CREATE VIEW daily_usage_stats AS
SELECT 
  DATE(request_timestamp) as date,
  tool_name,
  COUNT(*) as total_requests,
  COUNT(DISTINCT session_id) as unique_sessions,
  AVG(response_time_ms) as avg_response_time,
  COUNT(*) FILTER (WHERE success = true) * 100.0 / COUNT(*) as success_rate
FROM request_logs
GROUP BY DATE(request_timestamp), tool_name
ORDER BY date DESC, tool_name;

CREATE VIEW popular_components AS
SELECT 
  component_name,
  COUNT(*) as usage_count,
  COUNT(DISTINCT file_path) as files_used_in,
  COUNT(DISTINCT prop_name) as unique_props
FROM component_data
WHERE component_name IS NOT NULL AND component_name != ''
GROUP BY component_name
ORDER BY usage_count DESC;

CREATE VIEW popular_props AS
SELECT 
  prop_name,
  component_name,
  COUNT(*) as usage_count,
  COUNT(DISTINCT file_path) as files_used_in
FROM component_data
WHERE prop_name IS NOT NULL AND prop_name != ''
GROUP BY prop_name, component_name
ORDER BY usage_count DESC;

-- Function to clean up old data (data retention)
CREATE OR REPLACE FUNCTION cleanup_old_data(retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
  cutoff_date := NOW() - INTERVAL '1 day' * retention_days;
  
  -- Delete old component data
  DELETE FROM component_data WHERE created_at < cutoff_date;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Delete old request logs
  DELETE FROM request_logs WHERE request_timestamp < cutoff_date;
  
  -- Delete old sessions that are no longer referenced
  DELETE FROM sessions 
  WHERE created_at < cutoff_date 
    AND id NOT IN (SELECT DISTINCT session_id FROM request_logs WHERE session_id IS NOT NULL);
  
  -- Delete old performance metrics
  DELETE FROM performance_metrics WHERE created_at < cutoff_date;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-analytics-data', '0 2 * * *', 'SELECT cleanup_old_data(365);');

-- Grant necessary permissions for the anonymous role
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT, SELECT, UPDATE ON sessions TO anon;
GRANT INSERT, SELECT ON request_logs TO anon;
GRANT INSERT, SELECT ON component_data TO anon;
GRANT INSERT, SELECT ON performance_metrics TO anon;
GRANT SELECT ON daily_usage_stats TO anon;
GRANT SELECT ON popular_components TO anon;
GRANT SELECT ON popular_props TO anon;