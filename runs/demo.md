# Decision ledger · shift-2026-11-13T19-47-34-663Z

System 1: `jev-1.14.0` · System 2: `Qwen/Qwen3.8-27B`

- **30 decisions** in 11 Jev calls, 136 ms average, $0.000288 total
- 45.6 s of LLM build time
- 3 merged · 1 bounced · 0 escalated · 1 sloppy attempt(s) caught

## CAPY-1 · Bug: isSoaking is still true at the end minute

**merged** after 1 attempt(s)

| Stage | Attempt | Check | Answer | Threshold | Result |
|---|---|---|---|---|---|
| intake |  | Specific enough to build | P(yes) 0.82 (318 ms call) | 0.50 | pass |
| triage |  | Kind of work | bug (1.00) (76 ms call) |  | · |
| triage |  | Risk if shipped unreviewed | Medium (0.62) (76 ms call) |  | · |
| build | 1 | qwen agent | Make the soak end minute exclusive in isSoaking and add a regression test for the end minute and after. | | |
| tests | 1 | node:test | 4 passed, 0 failed | | pass |
| gate | 1 | No TODOs or placeholders | P(yes) 0.03 (107 ms call) | 0.50 | pass |
| gate | 1 | No debug logs or dead code | P(yes) 0.02 (107 ms call) | 0.50 | pass |
| gate | 1 | Precise types | P(yes) 0.03 (107 ms call) | 0.50 | pass |
| gate | 1 | Stays within the ticket | P(yes) 0.07 (107 ms call) | 0.50 | pass |
| gate | 1 | Tests assert the new behavior | P(yes) 0.88 (107 ms call) | 0.50 | pass |

## CAPY-2 · Add yuzuNeeded(guests)

**merged** after 2 attempt(s)

| Stage | Attempt | Check | Answer | Threshold | Result |
|---|---|---|---|---|---|
| intake |  | Specific enough to build | P(yes) 0.93 (196 ms call) | 0.50 | pass |
| triage |  | Kind of work | feature (1.00) (111 ms call) |  | · |
| triage |  | Risk if shipped unreviewed | Low (0.12) (111 ms call) |  | · |
| build | 1 | sloppy agent | Added yuzuNeeded. | | |
| tests | 1 | node:test | 5 passed, 0 failed | | pass |
| gate | 1 | No TODOs or placeholders | P(yes) 0.98 (114 ms call) | 0.50 | **FAIL** |
| gate | 1 | No debug logs or dead code | P(yes) 0.99 (114 ms call) | 0.50 | **FAIL** |
| gate | 1 | Precise types | P(yes) 0.94 (114 ms call) | 0.50 | **FAIL** |
| gate | 1 | Stays within the ticket | P(yes) 0.81 (114 ms call) | 0.50 | **FAIL** |
| gate | 1 | Tests assert the new behavior | P(yes) 0.01 (114 ms call) | 0.50 | **FAIL** |
| build | 2 | qwen agent | Add yuzuNeeded with integer validation and tests for the listed guest counts and invalid inputs. | | |
| tests | 2 | node:test | 10 passed, 0 failed | | pass |
| gate | 2 | No TODOs or placeholders | P(yes) 0.03 (120 ms call) | 0.50 | pass |
| gate | 2 | No debug logs or dead code | P(yes) 0.03 (120 ms call) | 0.50 | pass |
| gate | 2 | Precise types | P(yes) 0.04 (120 ms call) | 0.50 | pass |
| gate | 2 | Stays within the ticket | P(yes) 0.11 (120 ms call) | 0.50 | pass |
| gate | 2 | Tests assert the new behavior | P(yes) 0.86 (120 ms call) | 0.50 | pass |

## CAPY-3 · Make the onsen better

**bounced** after 0 attempt(s)

| Stage | Attempt | Check | Answer | Threshold | Result |
|---|---|---|---|---|---|
| intake |  | Specific enough to build | P(yes) 0.07 (161 ms call) | 0.50 | **FAIL** |

## CAPY-4 · Add minutesLeft(booking, nowMinute)

**merged** after 1 attempt(s)

| Stage | Attempt | Check | Answer | Threshold | Result |
|---|---|---|---|---|---|
| intake |  | Specific enough to build | P(yes) 0.78 (108 ms call) | 0.50 | pass |
| triage |  | Kind of work | feature (1.00) (94 ms call) |  | · |
| triage |  | Risk if shipped unreviewed | Low (0.25) (94 ms call) |  | · |
| build | 1 | qwen agent | Add minutesLeft to src/onsen.ts and cover before, during, end, and after cases in test/onsen.test.ts. | | |
| tests | 1 | node:test | 14 passed, 0 failed | | pass |
| gate | 1 | No TODOs or placeholders | P(yes) 0.03 (89 ms call) | 0.50 | pass |
| gate | 1 | No debug logs or dead code | P(yes) 0.02 (89 ms call) | 0.50 | pass |
| gate | 1 | Precise types | P(yes) 0.03 (89 ms call) | 0.50 | pass |
| gate | 1 | Stays within the ticket | P(yes) 0.07 (89 ms call) | 0.50 | pass |
| gate | 1 | Tests assert the new behavior | P(yes) 0.95 (89 ms call) | 0.50 | pass |
