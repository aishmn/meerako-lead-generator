/**
 * Environment Configuration
 * Centralized environment variable management with validation
 */

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  DATABASE_POOL_MIN: z.string().transform(Number).default('2'),
  DATABASE_POOL_MAX: z.string().transform(Number).default('10'),
  
  // Redis
  REDIS_URL: z.string().url().optional().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  
  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  BCRYPT_ROUNDS: z.string().transform(Number).default('12'),
  
  // Email (SendGrid)
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_FROM_NAME: z.string().default('Meerako Lead Generator'),
  
  // Email Tracking
  EMAIL_TRACKING_DOMAIN: z.string().optional(),
  EMAIL_TRACKING_ENABLED: z.string().transform(v => v === 'true').default('true'),
  
  // Lead Data Providers
  APOLLO_API_KEY: z.string().optional(),
  ZOOMINFO_API_KEY: z.string().optional(),
  CLEARBIT_API_KEY: z.string().optional(),
  LUSHAAPI_KEY: z.string().optional(),
  
  // Email Validation
  ZEROBOUNCE_API_KEY: z.string().optional(),
  HUNTER_API_KEY: z.string().optional(),
  NEVERBOUNCE_API_KEY: z.string().optional(),
  
  // Application
  APP_NAME: z.string().default('Meerako Lead Generator'),
  APP_URL: z.string().url().optional(),
  API_URL: z.string().url().optional(),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  
  // File Upload
  MAX_FILE_SIZE_MB: z.string().transform(Number).default('10'),
  ALLOWED_FILE_TYPES: z.string().default('.csv,.xlsx,.xls'),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FILE_PATH: z.string().default('./logs'),
  
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
  DATADOG_API_KEY: z.string().optional(),
  
  // Feature Flags
  FEATURE_AI_SCORING: z.string().transform(v => v === 'true').default('false'),
  FEATURE_INTENT_DATA: z.string().transform(v => v === 'true').default('false'),
  FEATURE_CRM_SYNC: z.string().transform(v => v === 'true').default('false'),
});

export type EnvConfig = z.infer<typeof envSchema>;

class EnvManager {
  private config: EnvConfig | null = null;

  validate(): EnvConfig {
    if (this.config) {
      return this.config;
    }

    const result = envSchema.safeParse(process.env);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => 
        `${e.path.join('.')}: ${e.message}`
      ).join('\n  ');
      
      throw new Error(`Invalid environment configuration:\n  ${errors}`);
    }

    this.config = result.data;
    return this.config;
  }

  get(): EnvConfig {
    if (!this.config) {
      return this.validate();
    }
    return this.config;
  }

  isProduction(): boolean {
    return this.get().NODE_ENV === 'production';
  }

  isDevelopment(): boolean {
    return this.get().NODE_ENV === 'development';
  }

  isTest(): boolean {
    return this.get().NODE_ENV === 'test';
  }

  hasLeadProvider(): boolean {
    const config = this.get();
    return !!(
      config.APOLLO_API_KEY ||
      config.ZOOMINFO_API_KEY ||
      config.CLEARBIT_API_KEY ||
      config.LUSHAAPI_KEY
    );
  }

  hasEmailValidation(): boolean {
    const config = this.get();
    return !!(
      config.ZEROBOUNCE_API_KEY ||
      config.HUNTER_API_KEY ||
      config.NEVERBOUNCE_API_KEY
    );
  }

  hasEmailDelivery(): boolean {
    const config = this.get();
    return !!(config.SENDGRID_API_KEY && config.SENDGRID_FROM_EMAIL);
  }
}

export const env = new EnvManager();

// Export validated config for direct access
export const config = env.get();
