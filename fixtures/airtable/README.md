# Airtable Fixture Templates

Use these files to create the Airtable control-plane tables with the exact field names expected by the workflow.

Recommended import order:

1. `runs-template.csv`
2. `stage-attempts-template.csv`
3. `gate-decisions-template.csv`
4. `experiments-template.csv`
5. `prompt-configs.csv`

After import:

- rename the tables to `Runs`, `Stage Attempts`, `Gate Decisions`, `Experiments`, and `Prompt Configs`
- convert the `Run` field in child tables into a linked record pointing to `Runs`
- convert `Enabled` in `Prompt Configs` into a checkbox

Exact field types and setup steps are documented in [airtable-setup.md](../../docs/airtable-setup.md).
