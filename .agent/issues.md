## to-do

## back-log
- rethink how we curate patterns. today: patterns live inline in each manifest, the library is a hand-written index pointing at them, and reuse means copy-and-rebind because patterns are welded to absolute data paths. the sequence discussed was (1) generate the inventory from the manifests, (2) add path parameters so one pattern serves several data paths, (3) only then move patterns into `patterns/*.yaml` resolved by id. worth revisiting once a second agent has actually tried to reuse something — that attempt is the evidence for what a pattern's parameters should be.
- deploy on vercel and allow writing to github to simulate db

## done
- [x] the current scratch-pad is based on google's critical user journey (CUJ) framework (user, goal, tasks, success criteria)---i think we need to develop a generalizable protocol to guide an agent creator from CUJ to the formulation of the fsm (based on which to confirm or select ui patterns)
- [x] we will start curating a ui pattern library from scratch (piggybacking the agents we will be creating). note that the format of patterns is intended to work with A2UI
- [x] see the scratch-pad.md in agents/kids-party-planner, is it enough to compile an agnet manifest? (like before, i want to focus on how to specify interaction model (fsm) and ui patterns while leaving other attributes like memory management automatically handled)
- [x] /weight-tracker 685
Could not run log_weight with that input. past 7 days: 0 kg change, latest 68.5 kg
i was expecting a ui asking me to confirm this number rather than simply rejecting it
- [x] i want to let the agent sanity check the user's entered weight before logging/updating it. for example, if user accidentally enter 685, the agent will ask (or even suggest correction 68.5)---help me update the fsm diagram
- [x] minor issues on fsm diagram
    - user input should be described in natural language (concisely)
    - each piece of info (user input, tool use, etc) should take up its own line (i added <br/> manually)
- [x] use icons on fsm mermaid diagram for better differentiating notations:
    - 👨🏻‍💻 user input
    - 🧰 tool use
    - 🖥️ ui (pattern)
    - 📍 state description
- [x] formalize fsm notation rules:
    - what's in a node (state):
        - desc: a concise text label that describes this state
        - pattern[state]: reference to a UI pattern to be shown and it's current state (here a UI's state refers to one of multiple variations of its rendering, e.g., whether a certain element will appear)
    - what's in an edge (transition):
        - user input
        - agent tool use
- [x] add to the agent creation rules, when compiling, also generate a README.md and visualize the fsm interaction model (e.g., using mermaid)
- [x] i am thinking of using a finite state machine (FSM) approach to specify interaction model, which also means the generated ui can be integrated into this representation (i.e., each state comes with a designer-specified **pattern** of ui to be generated). help me figure out what'd be a textual way to author such an FSM in agents/weight-tracker/scratch-pad.md
- [x] i am trying to explore what kinds of support should be provided for a designer to create an agentic app and specify its interactive behaviors. for example, the designer can use an FSM to specify the interaction model and provide UI templates for the agentically-genearted UI as part of the response. but i am not sure for other things, such as memory, how much involved the designer should specify. i don't want to overstep what's already being taken care of. perhaps i need to see a spec of a manifest of an agent: what aspects need to be defined and which ones are mostly taken care of (better not to mess with) vs. what are currently unspecified (e.g., interaction model, ui templates)
- [x] the current ui looks a little too boring. we want to demonstrate the vision of the future of agent-native applications. read scratch-pad.md and propose a ui redesign.

## nope