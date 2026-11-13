/**
 * The position error of a lot from the City's property boundaries layer, in metres. The only place
 * the value appears. `lotRelation` adds it to every feature's own error (spec 05 requirement 2.1),
 * so a larger value only ever moves a finding from "on this lot" to "near this lot".
 *
 * Reason (session 007): the property boundaries layer is a mapping product, not a survey, so its
 * lines are not survey-accurate; 2.0 m matches the floor Buried uses for a plate's alignment error.
 * Spec 05 task 1.1 (the maintainer reads the package page and metadata on the City's portal for a
 * stated positional accuracy) has not been done; if the City states a figure, it replaces this value
 * by the rule in design.md "Lot position error", and never goes below 2.0 m.
 */
export const LOT_POSITION_ERROR_M = 2.0;
