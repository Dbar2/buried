import { INDUSTRIAL_ENTRIES } from '../evidence';
import { HOW_KICKER, HOW_STEPS, HOW_TITLE, KIRO_HEADING, KIRO_LINES, LIST_NOTE } from './howCopy';
import { RegistrationCrosses } from './night';
import '../styles/lotcheck.css';

/** How it works (spec 08 requirement 6): four steps with a picture each, then what Kiro did. */
export function HowPage() {
  return (
    <main className="lc-how" data-testid="lc-how">
      <RegistrationCrosses />
      <p className="lc-kicker">{HOW_KICKER}</p>
      <h1>{HOW_TITLE}</h1>
      <ol className="lc-steps">
        {HOW_STEPS.map((step, i) => (
          <li key={step.heading} className="lc-step" data-testid="lc-step">
            <p className="lc-step-number">Step {i + 1}</p>
            <h2>{step.heading}</h2>
            <p>{step.body}</p>
            {i === HOW_STEPS.length - 1 ? (
              <p className="lc-small" data-testid="lc-list">
                {INDUSTRIAL_ENTRIES.join(', ')}. {LIST_NOTE}
              </p>
            ) : null}
            <img className="lc-step-picture" src={step.picture} alt={step.alt} width={640} loading="lazy" decoding="async" />
          </li>
        ))}
      </ol>
      <section className="lc-kiro" aria-labelledby="lc-kiro-heading">
        <h2 id="lc-kiro-heading">{KIRO_HEADING}</h2>
        {KIRO_LINES.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>
    </main>
  );
}
