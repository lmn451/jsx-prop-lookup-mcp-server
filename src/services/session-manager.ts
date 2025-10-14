import { SessionData } from '../types/logging-types.js';
import { generateMachineFingerprint, generateSessionId, getSystemInfo, getUserAgent } from '../utils/fingerprint.js';

export class SessionManager {
  private currentSession: SessionData | null = null;
  private sessionStartTime: number = 0;

  /**
   * Initialize or retrieve current session
   */
  public async getOrCreateSession(): Promise<SessionData> {
    if (this.currentSession) {
      // Update last activity
      this.currentSession.lastActivity = new Date();
      return this.currentSession;
    }

    // Create new session
    const userFingerprint = generateMachineFingerprint();
    const systemInfo = getSystemInfo();
    const userAgent = getUserAgent();

    this.currentSession = {
      id: generateSessionId(),
      userFingerprint,
      createdAt: new Date(),
      lastActivity: new Date(),
      sessionCount: 1, // This would be incremented if we track across restarts
      userAgent,
      systemInfo,
    };

    this.sessionStartTime = Date.now();
    return this.currentSession;
  }

  /**
   * Get current session without creating a new one
   */
  public getCurrentSession(): SessionData | null {
    return this.currentSession;
  }

  /**
   * Update session activity timestamp
   */
  public updateActivity(): void {
    if (this.currentSession) {
      this.currentSession.lastActivity = new Date();
    }
  }

  /**
   * Get session duration in milliseconds
   */
  public getSessionDuration(): number {
    return this.sessionStartTime > 0 ? Date.now() - this.sessionStartTime : 0;
  }

  /**
   * End current session
   */
  public endSession(): void {
    this.currentSession = null;
    this.sessionStartTime = 0;
  }

  /**
   * Check if session is active (within last 24 hours)
   */
  public isSessionActive(): boolean {
    if (!this.currentSession) {
      return false;
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.currentSession.lastActivity > twentyFourHoursAgo;
  }
}