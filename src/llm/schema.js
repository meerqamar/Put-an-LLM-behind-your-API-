import { z } from 'zod';

export const triageInputSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const TriageCategoryEnum = z.enum(['billing', 'bug', 'feature', 'other']);
export const TriageUrgencyEnum = z.enum(['low', 'normal', 'high']);

export const triageOutputSchema = z.object({
  category: TriageCategoryEnum,
  urgency: TriageUrgencyEnum,
  confidence: z.number().min(0.0).max(1.0),
  reason: z.string(),
});
