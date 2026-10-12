import type { TwentyObject, FieldOptions } from "../types.js";
import { fetchTwenty } from "../../../../lib/twenty/client/index.js";

/** Find a metadata object by singular or plural name. Pure. */
export function findTargetObject(allObjects: TwentyObject[], objectName: string): TwentyObject | undefined {
  return allObjects.find(obj =>
    obj.nameSingular === objectName || obj.namePlural === objectName
  );
}

/**
 * Every custom object in one read. The metadata endpoint defaults to 60
 * rows while the workspace holds more (69 and growing), so an explicit
 * limit is required — without it objects past the first page (e.g.
 * agencyLeads) silently miss and callers 404. Verified against live
 * Twenty: ?limit=200 returns all rows with hasNextPage false.
 */
export async function fetchMetadataObjects(): Promise<TwentyObject[]> {
  const response = await fetchTwenty<{ data: TwentyObject[] }>("/metadata/objects", { limit: 200 });
  return response.data || [];
}

/** Flatten SELECT field options into a field-name map. Pure. */
export function extractFieldOptions(targetObject: TwentyObject): FieldOptions {
  const fieldOptions: FieldOptions = {};
  for (const field of targetObject.fields) {
    if (field.options && field.options.length > 0) {
      fieldOptions[field.name] = field.options;
    }
  }
  return fieldOptions;
}
