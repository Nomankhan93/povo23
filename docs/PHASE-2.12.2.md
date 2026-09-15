# Survey Template Library & Draft Editing

Ten bundled read-only starter definitions: Education, Orphans, Health, Disability, Food/Ration, Livelihood, Household Vulnerability, Beneficiary Registration, Follow-up, Post-Assistance Monitoring. They are not database-published templates until a user copies, reviews and publishes one. Bundled updates never modify existing drafts or publications.

Survey management access remains POEM super_admin/admin/survey_manager. No new NGO template authoring permissions. My Templates lists the author's latest 100 saved drafts and the existing paginated published template list visible to that role.

Use template copies question objects with fresh IDs and remapped dependencies. Draft source records library ID/version or published template ID for context; source metadata is descriptive, not verification authority. New-version copies of published templates retain question IDs. Existing name-based version numbering remains unchanged: the same exact trimmed name publishes the next version. Rename to publish under another name.

Draft editing supports label/type/options/required/conditions/date comparisons/number bounds, adding, removing, duplicating and Move up/Move down. Drag-and-drop is not included. Removing a referenced question is blocked until its dependent conditions are cleared. Reordering that breaks previous-question dependencies is blocked. Other invalid draft configurations can be saved and repaired; existing server validation is authoritative at publication.

Save draft persists incomplete forms to an owner-scoped server table. Version checks reject stale writes. Save before leaving the module; this is explicit save, not autosave/offline drafting. Browser reload/close gets an unsaved-change warning where supported. Switching drafts asks before discarding edits; in-app navigation to another module requires saving first. The UI clearly labels unsaved state.

Publish requires a saved draft. The server locks it, calls the existing immutable publisher and records the resulting template ID atomically. Retrying publication of that same draft/version returns the same template ID, including after a lost acknowledgement. Published draft content is closed to further edits. Existing legacy publish RPC stays compatible. To edit further, use the published version's next-version button.

A failed/uncertain draft save: reopen the saved draft from the list to inspect server state before retrying edits. Reload may be needed after network recovery. Stale writes are never silently overwritten. Drafts cannot be shared with another author or deleted in this release.

Preview provides text/number/date/choice/yes-no/multiple controls and conditional visibility. Household, GPS and attachments are labelled placeholders; real capture and project consent are tested in the existing survey workflow. Preview answers never submit or persist.

Starter questions are all optional deliberately; mark necessary fields required for the specific project. CNIC/documents/photos are not compulsory defaults. Household answers do not automatically create canonical people. Monitoring answers do not automatically mark assistance delivered or needs met. Existing review, registry, consent and assistance workflows remain authoritative.
