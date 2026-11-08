import { Injectable } from '@nestjs/common';
import type { Explanation } from '../../../core/types';
import type { ExplainerPort, ExplainInput } from '../explainer.port';
import { explainWithTemplate } from '../template';

/** Always-available fallback. Fixed Vietnamese sentences; numbers filled from deterministic data. */
@Injectable()
export class TemplateExplainer implements ExplainerPort {
  async explain(input: ExplainInput): Promise<Explanation> {
    return explainWithTemplate(input);
  }
}
