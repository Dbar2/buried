/**
 * The Evidence Library: the single implementation of the date logic and the honesty rules.
 * Nothing outside web/src/evidence/ may import its internal modules; import from here.
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
export { LotInputError, lotRelation } from './lot';
export type { Lot, LotFeature, LotRelation } from './lot';
export {
  checkedRecordsText,
  createFinding,
  createNotCovered,
  createNothingFound,
  statusLabel,
} from './findings';
export type { CheckedInput, CheckedRecord, Finding, FindingInput, FindingStatus } from './findings';
export { BANNED_WORDS, HonestyError, findBannedWords } from './text';
export { EMPTY_PACK, checkSentence } from './sentences';
export type { SentenceCheck, SentencePack } from './sentences';
export type { BannedWord } from './text';
export { EvidenceLoadError, checkContract, parseContract } from './load';
export { parseEvidenceFile, parseProject, parseSourceRegistry } from './load';
export { positionPhrase } from './position';
export { definitionNames, isValid, validate } from './schema';
export type { ContractOf, DefName, ValidationResult } from './schema';
export { indexSources, sourceYearsText } from './sources';
export {
  originPhrase,
  plainSourceName,
  plainSourceNumbers,
  plainYears,
  provenanceFacts,
} from './plainWords';
export type { ProvenanceFacts } from './plainWords';
export type { SourceIndex } from './sources';
export { reviewedAreaCovers } from './coverage';
export type { CoverageKind } from './coverage';
export type * from './types.generated';
