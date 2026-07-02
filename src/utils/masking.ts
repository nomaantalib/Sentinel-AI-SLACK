export class SecurityMasker {
  // Regex patterns for sensitive data
  private static patterns = {
    geminiKey: /(AIzaSy[a-zA-Z0-9_\-]{33})/g,
    customKey: /(AQ\.[a-zA-Z0-9]{40,})/g,
    mongoUri: /(mongodb\+srv:\/\/)([^:]+):([^@]+)(@[a-zA-Z0-9.-]+\/?[^?\s]*)/gi,
    ipv4: /(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)\.(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)\.(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)\.(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)/g,
    slackWebhook: /(https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/)([a-zA-Z0-9]{24})/gi,
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    genericPassword: /(password|secret|passwd|token|key|pwd)\s*[:=]\s*["']?([a-zA-Z0-9_\-@#$!%^&*()+=]{6,})["']?/gi
  };

  /**
   * Masks sensitive information inside any string.
   */
  public static maskData(input: string): string {
    if (!input) return input;
    let sanitized = input;

    // 1. Mask MongoDB connection parameters
    sanitized = sanitized.replace(this.patterns.mongoUri, (match, protocol, user, pass, host) => {
      const maskedUser = user.slice(0, 3) + '***';
      return `${protocol}${maskedUser}:[REDACTED_PASSWORD]${host}`;
    });

    // 2. Mask Gemini API Keys
    sanitized = sanitized.replace(this.patterns.geminiKey, '[REDACTED_GEMINI_KEY]');
    sanitized = sanitized.replace(this.patterns.customKey, '[REDACTED_SECURE_TOKEN]');

    // 3. Mask Slack webhooks
    sanitized = sanitized.replace(this.patterns.slackWebhook, (match, prefix) => {
      return `${prefix}[REDACTED_SLACK_TOKEN]`;
    });

    // 4. Mask IPv4 Addresses
    sanitized = sanitized.replace(this.patterns.ipv4, 'XXX.XXX.XXX.XXX');

    // 5. Mask Email Addresses
    sanitized = sanitized.replace(this.patterns.email, 'xxxx@xxxxx.com');

    // 6. Generic password / key values (e.g. password: "abc", secret = "123")
    sanitized = sanitized.replace(this.patterns.genericPassword, (match, key) => {
      return `${key}: "[REDACTED]"`;
    });

    return sanitized;
  }
}
