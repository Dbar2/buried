# Kiro session 036: exact corrections to the write-up draft and two stale lines

Agent: mechanic (claude-haiku-5.5). Make only these edits. If a line to change is not found, say
so and change nothing else.

## `docs/submission/kiro-writeup.md`

1. Section 2: "The coder wrote the Explorer's first draft unable to run anything (session 010),
   and a builder compiled, tested and fixed it." Change to: "The coder wrote the Explorer's first
   draft unable to run anything (session 009), and a builder compiled, tested and fixed it
   (session 010)."
2. Section 2: "No brief records a mechanic or archivist run, and `docs/sources/` does not exist
   (to confirm)." Change to: "The mechanic's first run was session 036, which made corrections to
   this document. The archivist has not been run yet, so `docs/sources/` does not exist."
3. Section 3: "We have no record of the hook blocking a real write (to confirm)." Change to: "We
   tested the guard script by hand with a write event that names plate 232 in the extraction
   parameters: it exited 2 with its refusal message, and exited 0 for an ordinary write. No agent
   has tripped it in a real session."
4. Section 3: "Kiro refused agent writes under `.kiro/hooks/` (to confirm), so" Change to: "Kiro
   refused the architect's writes under `.kiro/hooks/` in session 012, although its permission
   rules allowed that folder, so".
5. Section 4: "The specs reached about 10,000 lines (to confirm)" Change to: "The specs reached
   about 10,000 lines (10,039 at the time of writing)".
6. Section 7, last bullet: "The counterexample is not in the notes (to confirm)." Change to: "The
   counterexample: footprints F = (0,0) to (7,7) and G = (0,4) to (7,11) go to review at a
   pairwise error of 1.0 m and become a clear absence at 2.5 m, because the larger shrink pulls
   F's core off G. It is kept as a regression test."

## `.kiro/steering/tech.md`

7. Wherever it says the held-out hook in `.kiro/hooks/held-out.json` is disabled or
   `"enabled": false`, change the statement to say it is enabled (`"enabled": true`) since
   session 025's script landed. Do not change anything else in the file.

## `README.md`

8. If it says the session briefs run "001 to 031", change "031" to "036".

Reply with the list of edits made, by number.
