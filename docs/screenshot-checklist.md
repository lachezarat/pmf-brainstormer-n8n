# Screenshot Checklist

Capture these before publishing the repo or portfolio page:

1. `PMF Brainstormer API`
   - take two kinds of shots, not one giant unreadable canvas
   - capture one full-map overview at roughly `35%` to `45%` zoom to show overall system scale
   - capture 2 or 3 tighter crops at readable zoom:
     - intake + research
     - LLM stages
     - finalization + Airtable + review branch
   - hide side panels and crop out empty canvas before exporting
   - this is the main architecture proof set
2. `PMF Gemini Stage Subflow`
   - show retry nodes, validation nodes, and fallback branch
   - this is the strongest JSON reliability screenshot
3. `PMF Airtable Control Plane Subflow`
   - show prompt-config lookup plus upsert path
   - this is the strongest control-plane screenshot
4. `PMF Brainstormer Review API`
   - show the operator decision path from gated run to approval
   - this proves gate-control structure
5. `PMF Brainstormer Error Handler`
   - show the error trigger and failed-run patch flow
6. Airtable base schema
   - include the 5 tables and linked `Run` relationships
   - `Prompt Configs` should be visible
7. Status response
   - capture one `awaiting_review` example
   - capture one final `completed` example after review approval
8. Export bundle
   - show the generated `workflow-backups/` folder

## Capture Guidance

- If the workflow is too long to read in one frame, that is normal.
- Use one overview image only to show complexity.
- Use separate close-up images for legibility.
- If needed, make a simple composite in Figma or Canva with labels like:
  - `Overview`
  - `Research + Intake`
  - `Structured AI Stages`
  - `Review + Control Plane`
- Prefer readable nodes over showing the entire canvas at once.
