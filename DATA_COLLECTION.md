# Data Collection Documentation

## Overview

The JSX Prop Lookup MCP Server implements comprehensive data collection to provide detailed analytics, debugging insights, and usage patterns. This document outlines what data is collected, how it's stored, and how you can control the collection process.

## Data Collection Scope

### ✅ Data We Collect

- **Tool Usage Patterns**: Frequency and timing of `analyze_jsx_props` and `query_components` tool usage
- **Performance Metrics**: Response times, error rates, and execution statistics
- **File Paths**: Complete file paths of analyzed JSX/TSX files
- **Component Information**: Actual component names found in your code
- **Prop Details**: Prop names, values, types, and line numbers
- **Code Content**: Surrounding code context and analysis results
- **Session Data**: Persistent user identification across sessions
- **System Information**: Operating system, Node.js version, and system architecture
- **Request Parameters**: Complete request parameters and configuration options
- **Response Data**: Full analysis results including code content

### 🎯 Purpose of Data Collection

- **Analytics**: Understanding usage patterns and popular components/props
- **Debugging**: Identifying common errors and performance bottlenecks
- **Feature Development**: Informing future feature development based on actual usage
- **Performance Optimization**: Monitoring and improving response times
- **User Experience**: Understanding how developers interact with the tool

## Data Storage and Retention

### Database Structure

Data is stored in a Supabase PostgreSQL database with the following tables:

- **sessions**: User identification and session tracking
- **request_logs**: Detailed request and response information
- **component_data**: Individual component and prop analysis results
- **performance_metrics**: Aggregated performance statistics

### Data Retention

- **Default Retention**: 365 days
- **Configurable**: Set via `DATA_RETENTION_DAYS` environment variable
- **Automatic Cleanup**: Old data is automatically purged based on retention settings

## Configuration Options

### Environment Variables

```bash
# Enable/disable logging (default: true)
ENABLE_ANALYTICS_LOGGING=true

# Supabase configuration
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key

# Data collection granularity
COLLECT_DETAILED_DATA=true    # Store paths, component names, prop names, values
STORE_CODE_CONTENT=true       # Include code content in responses
LOG_PERFORMANCE_THRESHOLD_MS=5 # Log all requests above this threshold
DATA_RETENTION_DAYS=365       # How long to retain data
```

### Disabling Data Collection

To completely disable data collection:

1. Set `ENABLE_ANALYTICS_LOGGING=false` in your environment
2. Or remove/comment out the Supabase configuration variables

When disabled, the MCP server functions normally without any data collection.

## Data Security and Privacy

### User Identification

- **Machine Fingerprinting**: Uses system characteristics (OS, CPU, Node version) to create consistent user identification
- **Session Tracking**: Persistent sessions across server restarts
- **No Personal Information**: No usernames, emails, or personal data collected

### Data Protection

- **Encrypted Storage**: All data stored in Supabase with encryption at rest
- **Secure Transmission**: HTTPS/TLS for all data transmission
- **Access Control**: Row Level Security (RLS) policies implemented
- **Anonymous Access**: Data collection uses anonymous database access

### Sensitive Data Handling

- **Parameter Sanitization**: Automatically redacts sensitive keys (password, token, secret, etc.)
- **String Truncation**: Large strings truncated to prevent database issues
- **Error Handling**: Graceful degradation if logging fails

## Data Usage and Analytics

### Real-time Analytics

The system provides real-time insights into:

- Daily usage statistics by tool
- Popular components and props
- Performance trends
- Error patterns
- File usage patterns

### Analytics Views

Pre-built database views provide:

- `daily_usage_stats`: Daily usage metrics by tool
- `popular_components`: Most frequently analyzed components
- `popular_props`: Most common props across components

## Data Management

### Manual Data Cleanup

You can manually clean up old data using the provided database function:

```sql
SELECT cleanup_old_data(30); -- Clean data older than 30 days
```

### Data Export

All data can be exported from Supabase for analysis or backup purposes.

### Data Deletion

To delete all collected data:

1. Access your Supabase dashboard
2. Truncate the analytics tables
3. Or use the cleanup function with a very short retention period

## Compliance and Transparency

### Data Transparency

- **Open Source**: All data collection code is open source and auditable
- **Clear Documentation**: This document outlines exactly what data is collected
- **Configuration Control**: Full control over data collection granularity

### Compliance Considerations

- **No Personal Data**: No personally identifiable information collected
- **Opt-out Available**: Easy to disable data collection entirely
- **Data Retention Limits**: Configurable retention periods
- **Secure Storage**: Industry-standard security practices

## Support and Questions

If you have questions about data collection:

1. Review this documentation
2. Check the source code in the `src/services/logging-service.ts` file
3. Open an issue on the GitHub repository
4. Contact the maintainers

## Changes to Data Collection

Any changes to data collection practices will be:

1. Documented in this file
2. Announced in release notes
3. Implemented with backward compatibility
4. Made available for review in the open source repository

---

*Last updated: 2025-07-25*
*Version: 1.0.0*