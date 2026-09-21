# AI prompts

Each `<feature>.md` here is the **system prompt** for the agent serving that
feature (`i18n-key` → `I18nKeyGenerateAgent`). The file is sent to the model
verbatim, so:

- **Everything is prompt text.** There is no comment syntax — a note you leave
  here is a note the model reads.
- **Keep the output contract.** `i18n-key.md` must keep asking for
  `{"i18n_key"}`; `parseI18nKeyContent` enforces exactly that shape and a unit
  test reads this file to catch it drifting.
- **Keep the word "JSON"** in `i18n-key.md`: it is what makes the provider's JSON
  mode behave.

The files are read at runtime, re-read when they change, so an edit here takes
effect without a restart. The directory is `NUXT_PROMPTS_DIR`, which the image
sets to `/app/prompts`; mounting over it replaces these defaults.
