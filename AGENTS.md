<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Forja rules
- AI calls go through `askForja` (src/lib/ai.functions.ts); provider rotation logic lives in pure `src/lib/ai-providers.ts` (tested) so keys come only from env vars (`GROQ_API_KEYS`, `GEMINI_API_KEYS`, `OPENROUTER_API_KEYS`, comma-separated, or numbered forms such as `GEMINI_API_KEY_1`; )
- Local files are accessed only in the browser via File System Access API (`src/lib/fs.ts`); the server never sees the user's folder except file contents sent as AI context.
- The IDE renders inside `<ClientOnly>` because Monaco and the file APIs are browser-only.
- Preview HTML is parsed with source offsets and rendered in an opaque-origin sandbox with only the Forja inspection bridge; this keeps local text edits precise and project scripts isolated from IDE permissions.
- Preview annotations remain session-scoped and can be attached to the existing chat; external previews support overlays but never claim cross-origin DOM inspection.
- Use one folder-session EditHistory for code, preview text, annotation and AI transactions; keep code and preview mounted across view switches so chronological undo cannot lose state. Clipboard commands remain native in text fields and Monaco; the sandbox bridge handles selected local preview text only.
- Chat dictation uses the browser speech recognition service with explicit user activation; text attachments stay in memory until sent through askForja, and explicit project context takes priority over automatic context.
- Chat modes and the agent team live in pure `src/lib/agents.ts` (tested); askForja runs relevant specialists in parallel on different rotated keys, then a lead integrates their notes. Plan mode is enforced server-side by discarding edits.
