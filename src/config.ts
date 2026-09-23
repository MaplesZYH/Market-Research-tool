import 'dotenv/config';
import { z } from 'zod';

const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().optional());
const booleanFromEnv = z.preprocess((value) => value === undefined ? undefined : value === true || value === 'true', z.boolean());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  GITHUB_TOKEN: optionalString,
  GITHUB_MAX_RESULTS: z.coerce.number().int().positive().max(1000).default(100),
  GITHUB_FETCH_README: booleanFromEnv.default(true),
  GITHUB_README_MAX_CHARS: z.coerce.number().int().positive().max(100000).default(20000),
  LAYA_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  LAYA_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  LAYA_INPUT_TOKEN_BUDGET: z.coerce.number().int().positive().max(900).default(700),
  AI_API_BASE_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
  AI_API_KEY: optionalString,
  AI_API_MODEL: optionalString,
  AI_API_CHAT_PATH: z.string().default('/v1/chat/completions'),
  AI_API_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});

export const config = envSchema.parse(process.env);
