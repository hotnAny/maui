v0: a vanilla chat-native interface
- think of this as a strip-down minimal viable version of a prototypical chat UI---a common denominator of chatgpt, claude, gemini, and alike
- the ultimate goal is to allow designer to add agents as plug-ins onto this simple platform
    - the designer will upload a package that contains AGENT.md, a set of tools (e.g., .py files), example UI (patterns), etc. of course this is well beyond v0. i just want to give a big picture.
- left: a canvas that can display a dashboard, a data view (e.g., spreadsheet, charts, files, photos), etc.
- right: a conventional chat UI, although AI's response might contain UI generated on the fly so the display of AI response cannot assume it's just text
- visual style: minimalistic, muted, black/grey/white
    - additionally: identify a family of icons with such styles to use in lieu of text when appropriate
- other technical details
    - i will provide an openai api key