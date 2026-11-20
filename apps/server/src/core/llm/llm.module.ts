import { Logger, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { createJsonLlm, type JsonLlm } from './json-llm';
import { LlmQuota } from './quota';

export const JSON_LLM = Symbol('JSON_LLM');
export const LLM_QUOTA = Symbol('LLM_QUOTA');

/**
 * The configured LLM and its shared per-minute budget. Import this module wherever an LLM is called: Nest keeps one
 * instance per process, so the explainer and the red-team brain draw from the same quota.
 */
@Module({
  providers: [
    {
      provide: JSON_LLM,
      inject: [ENV],
      useFactory: (env: Env): JsonLlm => {
        const llm = createJsonLlm(env);
        new Logger('LlmModule').log(llm.available ? `LLM: ${llm.label} (max ${llm.rpm}/min shared)` : 'LLM: off (rules and templates only)');
        return llm;
      },
    },
    { provide: LLM_QUOTA, inject: [JSON_LLM], useFactory: (llm: JsonLlm) => new LlmQuota(llm.rpm) },
  ],
  exports: [JSON_LLM, LLM_QUOTA],
})
export class LlmModule {}
