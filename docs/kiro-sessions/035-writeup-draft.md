# Kiro session 035: draft the "how Kiro was used" write-up

Agent: architect (claude-sonnet-5.5). Write only `docs/submission/kiro-writeup.md` and
`docs/submission/demo-script.md`. No other file.

Read: every file in `docs/kiro-sessions/` (the briefs given to Kiro and the `*-notes.md` files
Kiro's builders wrote), `.kiro/hooks/README.md`, the agent files in `.kiro/agents/`,
`.kiro/settings/mcp.json`, `docs/qa/`, `docs/gate/README.md`, `README.md`, and `git log --oneline`
is not available to you, so rely on those files. Do not read the specs end to end; read their
`tasks.md` headings only if you need a count.

## The write-up (`kiro-writeup.md`)

The Kiroween submission form asks how Kiro was used. Answer its questions in order, each under
its own heading, in plain first-person-plural prose with specifics a judge can verify in the
repository (file paths, numbers, what broke and how it was found):

1. Kiro IDE, CLI, Web, Crew: which were used and how they differed. Be exact: this project was
   built through Kiro CLI in non-interactive sessions, one task brief per session, with several
   sessions in parallel in separate git worktrees. Say plainly that the IDE was installed but the
   build ran through the CLI, and that Web and Crew were not used.
2. Custom agents: architect, builder, coder, mechanic, archivist, plate-qa. What each may and may
   not do (their permission rules), which model each uses, and what difference they made. Include
   the plate-qa story from `docs/qa/` and the session notes: its first runs failed because the MCP
   tool returned 199 KB with no paging, the tools were fixed, and its reports then found likely
   duplicates and merged lots in the draft data.
3. Agent hooks: the seven hook files, what each guards, and the held-out-plate write guard.
   Kiro refuses agent writes under `.kiro/hooks/`, so the hooks were drafted by an agent and moved
   into place by hand; say so.
4. Spec-driven development: five specs, how they were structured, where the spec caught something
   before code did (the revised-edition year range; reviewed areas before any absence is
   inferred), and an honest comparison with vibe coding, including the cost: the specs grew to
   about 10,000 lines and reading them wasted credits until briefs named exact sections.
5. Steering docs: the six files, the strategy that mattered (hard honesty rules; one coordinate
   system; "the spec that needs a decision makes it"), and the day-two reframe written into
   steering (the place page, search first, the lit map sheet).
6. MCP: the `buried-evidence` server, its tools, who uses it, and why it serves facts and never
   derives dates or "on this lot".
7. Property-based testing: list the real catches with their counterexamples where the notes give
   them (the alignment property at UTM-scale coordinates; hole bridging in the triangulator; the
   13 mm fold-back in a City building; the inward wall on a 39-vertex footprint; the false
   monotonicity property in matching, which led to a new matching rule). Say which were bugs in
   code and which were wrong properties.
8. Kiro powers: none were used. Say so in one sentence.

Also a short "What we would do differently" section. Under 1,400 words in total. Every number
must come from a file you read; where you are unsure, write "(to confirm)" rather than guess.
Do not mention any tool other than Kiro as having written code.

## The demo script (`demo-script.md`)

A shot list for a video under three minutes, second by second, using only what exists today:
the landing and search; the place page for 541 Queen St E; digging to 1911; the Lantern at
Today; the evidence card with the untouched scan; the Studio tracing "COAL & WOOD YARD" and
publishing; the place page for 2A Percy St showing it; the Report print view; then 20 seconds on
`.kiro/` (a spec, a hook blocking a write that mentions plate 232, the plate-qa report). Give the
exact URL or command for each shot and one line of voice-over each, plain and specific.

Reply with the two file paths and the items you marked "(to confirm)".
