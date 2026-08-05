# kids party planner — CUJ
#
# Protocol from here to a compilable fsm: .agent/cuj-to-fsm.md
# Patterns a state can bind: .agent/pattern-library.md

## user
parents of (young) kids

## goal
planning a birthday party for a kid

## tasks
- provide basic info:
    - kid's name
    - birthday
    - optional: venue/location (at home or not, indoor vs. outdoor)
    - optional: special request (e.g., spiderman theme)
    - optional: constraint (e.g., budget, guest headcount)

- decide on a weekend (sat or sun) that is closest to the birthday

- select a venue

- select a cake provider

- select other foods (the menu)

- select fun activities (e.g., magic show, face tattoo, water play, science experiment, mascot)

## success criteria
<!-- MISSING — step 0 of .agent/cuj-to-fsm.md: without this there is nothing to place
     `end: true` on, so the machine cannot be compiled. What does a parent have when
     they're done: every slot filled? a bookable plan? something shareable? -->

## open decisions before the fsm
<!-- 1. Where do candidates come from — live search tools, the model's own knowledge, or a
        list the parent supplies? Until this is settled, `do:` cannot be written for any
        selection edge.
     2. Do budget/headcount constraints hold across every selection? The notation has no
        place for cross-cutting invariants (see the parked `policies:` sketch in
        agents/weight-tracker/recycle.md).
     3. Does the plan persist across invocations? R5 ends the machine per invocation; a
        party plan is a working document a parent returns to for weeks. -->


## success criteria
the user obtains a documentation of the birthday plan that is ready to be implemented