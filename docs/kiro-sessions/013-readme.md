# Kiro session 013: the README

Agent: coder (claude-sonnet-5.5), write-only.

Write `README.md` at the repository root. The repository is public
(`https://github.com/Dbar2/buried`) and this is the first thing a Kiroween judge or a curious
developer reads. Read `.kiro/steering/`, `docs/gate/README.md`, `.kiro/steering/tech.md`
"Commands", and skim the five specs' requirements introductions before writing.

## What it must do

1. Say what Buried is in two sentences, then show it: embed
   `docs/gate/gate-1911-bank-closeup.jpg` with a one-line caption that says exactly what the image
   is (the one hand-traced gate building standing on its drawing on the 1911 plate).
2. **Be honest about status.** A short "Where it stands" section with a dated table: what works
   today (alignment measured on two plates, pipeline commands that exist, the evidence schema and
   date logic, the Unity WebGL gate build with one building and two eras), what is specified but
   not built (the Studio, the Report, the full Explorer look, extraction), and what is a draft
   awaiting review (the control points and the one traced building). No future feature is
   described in the present tense anywhere in the README.
3. How to run what exists, with the exact commands from `tech.md`: pipeline setup and tests,
   web install, test, build and preview, the Unity build through `tools/unity.sh`, and the gate
   end-to-end test. State prerequisites (Python 3.12 with uv, Node, Unity 6000.3.26f1 with WebGL
   build support, and that `tools/unity.sh` reads `UNITY_BIN`). Say what each command should print.
4. How the repository is laid out, in a short tree with one line per top-level folder.
5. **Built with Kiro**: a section pointing at `.kiro/steering/`, `.kiro/specs/`, `.kiro/hooks/`,
   `.kiro/agents/` and `docs/kiro-sessions/` (the task brief given to Kiro for each session), with
   one sentence each on what a reader will find there. Mention the property-based tests and name
   two real things they caught, taken from the session briefs and commit messages you can read
   (the precision failure in the alignment property at UTM-scale coordinates; the hole-bridging bug
   in the triangulator). Do not invent others.
6. Sources and credits: the attribution lines from `.kiro/steering/sources.md`, verbatim, and the
   rights note for the 1931-35 edition in one or two plain sentences.
7. What Buried is not: it screens, it does not certify; its maps are not utility locates; link
   Ontario Dig Authority. One short paragraph.
8. Licence: MIT.

## Voice

Plain, specific, a little dry. Write like someone who measured things. Lead with facts and
numbers that are in the repo (2.140 m, 4.3 m, 7.9 MB, test counts). No emoji, no badges, no
"powerful", "seamless", "cutting-edge", "revolutionary", no rhetorical questions, no "Features"
bullet list of adjectives. Short paragraphs. Under 200 lines.

Do not state anything about what stood on the showcase block beyond what
`data/evidence/fip_v3_1911_229.geojson` records.

End your reply with the facts you were unsure of, so the maintainer can check them.
