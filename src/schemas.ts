/**
 * Runtime validation schemas for CLI and MCP tool inputs.
 * Uses Zod to ensure type-safe, validated payloads.
 */

import { z } from "zod";

/**
 * Valid command names
 */
export const AnalyzeCommand = z.literal("analyze_jsx_props");
export const FindPropUsageCommand = z.literal("find_prop_usage");
export const GetComponentPropsCommand = z.literal("get_component_props");
export const FindComponentsWithoutPropCommand = z.literal("find_components_without_prop");

export const Command = z.union([
  AnalyzeCommand,
  FindPropUsageCommand,
  GetComponentPropsCommand,
  FindComponentsWithoutPropCommand,
]);

/**
 * Common path validation
 */
export const CommonPath = z.object({
  path: z.string().min(1, "path is required and must be non-empty"),
});

/**
 * analyze_jsx_props schema
 */
export const AnalyzeJSXPropsArgs = CommonPath.extend({
  componentName: z.string().optional(),
  propName: z.string().optional(),
  includeTypes: z.boolean().optional().default(true),
});

/**
 * find_prop_usage schema
 */
export const FindPropUsageArgs = CommonPath.extend({
  propName: z.string().min(1, "propName is required and must be non-empty"),
  componentName: z.string().optional(),
});

/**
 * get_component_props schema
 */
export const GetComponentPropsArgs = CommonPath.extend({
  componentName: z.string().min(1, "componentName is required and must be non-empty"),
});

/**
 * find_components_without_prop schema
 */
export const FindComponentsWithoutPropArgs = CommonPath.extend({
  componentName: z.string().min(1, "componentName is required and must be non-empty"),
  requiredProp: z.string().min(1, "requiredProp is required and must be non-empty"),
  assumeSpreadHasRequiredProp: z.boolean().optional().default(true),
});

/**
 * Inferred TypeScript types from schemas
 */
export type CommandType = z.infer<typeof Command>;
export type AnalyzeJSXPropsArgsType = z.infer<typeof AnalyzeJSXPropsArgs>;
export type FindPropUsageArgsType = z.infer<typeof FindPropUsageArgs>;
export type GetComponentPropsArgsType = z.infer<typeof GetComponentPropsArgs>;
export type FindComponentsWithoutPropArgsType = z.infer<typeof FindComponentsWithoutPropArgs>;
