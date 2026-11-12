/**
 * The Evidence Library: the single implementation of the date logic and the honesty rules.
 * Nothing outside web/src/evidence/ may import its internal modules; import from here.
 *
 * Lot relations, findings and the banned-word check are added by spec 01 tasks 7 and 8.
 */
export type {
  Dated,
  DateSummary,
  NoPresence,
  ObservationRef,
  Visibility,
} from './dates';
export { datePhrases, summariseDates, summariseSet } from './dates';
export type { EraFeature, EraFeatureList, EraRange } from './eras';
export { drawnMember, featuresForEra, isDrawnInEra } from './eras';
export { linkedSets } from './links';
export type { LinkedSet } from './links';
export { EvidenceLoadError, checkContract, parseContract } from './load';
export { parseEvidenceFile, parseProject, parseSourceRegistry } from './load';
export { positionPhrase } from './position';
export { definitionNames, isValid, validate } from './schema';
export type { ContractOf, DefName, ValidationResult } from './schema';
export { indexSources, sourceYearsText } from './sources';
export type { SourceIndex } from './sources';
export { reviewedAreaCovers } from './coverage';
export type { CoverageKind } from './coverage';
export type * from './types.generated';
