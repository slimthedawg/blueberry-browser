import * as z from "zod";

/**
 * Custom agent state schema extending LangChain's default message state
 * This allows us to track additional context like planning state, visual context, etc.
 */
export const customAgentState = z.object({
  // Messages are handled automatically by LangChain
  // We can extend with custom fields for planning and context
  observations: z.array(z.object({
    stepNumber: z.number(),
    observation: z.string(),
    timestamp: z.number(),
  })).optional(),
  planningContext: z.object({
    screenshot: z.any().optional(),
    domSnapshot: z.any().optional(),
  }).optional(),
  subgoals: z.array(z.object({
    id: z.string(),
    description: z.string(),
    completed: z.boolean(),
  })).optional(),
  reflections: z.array(z.object({
    stepNumber: z.number(),
    reflection: z.string(),
    timestamp: z.number(),
  })).optional(),
});

export type CustomAgentState = z.infer<typeof customAgentState>;



















