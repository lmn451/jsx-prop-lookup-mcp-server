import * as os from 'os';
import * as crypto from 'crypto';

export interface SystemInfo {
  platform: string;
  nodeVersion: string;
  arch: string;
  cpus: number;
}

/**
 * Generate a machine fingerprint for user identification
 * This creates a consistent identifier based on system characteristics
 */
export function generateMachineFingerprint(): string {
  const systemInfo = getSystemInfo();
  
  // Create a hash from system characteristics
  const fingerprintData = [
    systemInfo.platform,
    systemInfo.arch,
    systemInfo.nodeVersion,
    systemInfo.cpus.toString(),
    os.hostname(),
    os.userInfo().username,
  ].join('|');

  return crypto
    .createHash('sha256')
    .update(fingerprintData)
    .digest('hex')
    .substring(0, 32); // Use first 32 characters for shorter identifier
}

/**
 * Get detailed system information
 */
export function getSystemInfo(): SystemInfo {
  return {
    platform: os.platform(),
    nodeVersion: process.version,
    arch: os.arch(),
    cpus: os.cpus().length,
  };
}

/**
 * Get user agent string for web-like identification
 */
export function getUserAgent(): string {
  const systemInfo = getSystemInfo();
  return `jsx-prop-lookup-mcp-server/1.0.0 (${systemInfo.platform}; ${systemInfo.arch}) Node.js/${systemInfo.nodeVersion}`;
}

/**
 * Generate a session UUID
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}