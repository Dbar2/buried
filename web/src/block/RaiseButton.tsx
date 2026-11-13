import { RAISE_LABEL, WAITING_LABEL } from './raiseState';

export type RaiseButtonProps = {
  /** True once pressed and the Player is not ready: the button reads "Lighting the lamp". */
  waiting: boolean;
  onPress: () => void;
};

/**
 * "Raise the past", the one primary action on the Block page. It is a real button from first paint and does not
 * depend on the Unity loader (requirement 2.1). While waiting it says so, and a polite live region announces the
 * change (requirement 2.2). Pressing it again while waiting does nothing: the press is already kept.
 */
export function RaiseButton({ waiting, onPress }: RaiseButtonProps) {
  return (
    <>
      <button
        type="button"
        className="raise-button"
        data-testid="raise-button"
        aria-disabled={waiting ? true : undefined}
        aria-busy={waiting ? true : undefined}
        onClick={waiting ? undefined : onPress}
      >
        {waiting ? WAITING_LABEL : RAISE_LABEL}
      </button>
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="raise-status">
        {waiting ? WAITING_LABEL : ''}
      </p>
    </>
  );
}
