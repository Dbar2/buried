/* eslint-disable */
/**
 * GENERATED FILE. Do not edit by hand.
 * Source: data/schema/finds.schema.json. Regenerate with `npm run gen:types` (from web/).
 */

/**
 * data/finds.json: the finds of the first visit (spec 06). A find is one thing the plans letter on the block, with the lettering crop that names it. schema_version is 1.0.0. Shape only: that each feature_id is a published feature of its source, that each crop lies inside the source's map area, and that id, slug and order are unique are checked by `buried validate` (pipeline/buried_pipeline/validate/finds.py). Crops use the evidence Schema's cropPx shape: integer pixels on the full-resolution source raster, GDAL convention.
 */
export interface FindsFile {
  schema_version: '1.0.0';
  /**
   * @minItems 1
   */
  finds: [Find, ...Find[]];
}
/**
 * One find: a building or an area, with one reading per plan that letters it.
 *
 * This interface was referenced by `FindsFile`'s JSON-Schema
 * via the `definition` "find".
 */
export interface Find {
  id: string;
  slug: string;
  kind: 'building' | 'area';
  /**
   * Position in the row of find tags; the lowest is the first find.
   */
  order: number;
  /**
   * The paper tag's text.
   */
  tag: string;
  /**
   * One plain word for the thing, used in sentences.
   */
  noun: string;
  /**
   * @minItems 1
   */
  readings: [Reading, ...Reading[]];
}
/**
 * What one plan letters at the find, and the crop it was read from.
 *
 * This interface was referenced by `FindsFile`'s JSON-Schema
 * via the `definition` "reading".
 */
export interface Reading {
  /**
   * A source id, built as in structure.md: lowercase snake_case.
   */
  source: string;
  /**
   * <bld|use>_<source id>_<4 digits>: the published feature on that source.
   */
  feature_id: string;
  /**
   * The lines of lettering, exactly as lettered on the plan. The first line is the card title.
   *
   * @minItems 1
   */
  lettered: [string, ...string[]];
  crop_px: CropPx;
  /**
   * The person who read the lettering.
   */
  read_by: string;
  /**
   * An ISO 8601 calendar date.
   */
  read_on: string;
}
/**
 * An integer pixel rectangle on a source raster at full resolution (GDAL convention). The same shape as cropPx in evidence.schema.json.
 *
 * This interface was referenced by `FindsFile`'s JSON-Schema
 * via the `definition` "cropPx".
 */
export interface CropPx {
  x: number;
  y: number;
  width: number;
  height: number;
}
