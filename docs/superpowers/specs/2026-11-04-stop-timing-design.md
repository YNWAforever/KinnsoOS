# Optional timing for saved manual stops

Continue the homepage → reviewed brief → device trip journey. The existing
editor preserves stop times but cannot edit them. Add optional 24-hour start
times and whole-minute durations to saved manual stops, using the existing
Next/React editor and explicit device save/readback.

This is an implementation choice under the user's continuing development
instruction. Reuse the device editor rather than a separate schedule screen:
it already owns moves, unsaved changes and recovery. Automatic scheduling would
require assumptions about travel time and availability and is outside this phase.

Start time accepts HH:mm from 00:00 to 23:59 or blank. Duration accepts digits
representing 1–1440 minutes or blank. Blank means unknown, not midnight or zero.
Times are wall-clock values in the trip's chosen time zone; no date conversion,
sorting, overlap rejection or inferred schedule. A late stop may cross midnight.

Keep raw partial/invalid input attached to the stop's transient editor identity.
Show bilingual field errors and block Save (including save-and-leave) before any
storage write until corrected or cleared. Valid changes remain unsaved until
exact readback confirms the same device record. Input, notes and times follow
day/stop moves and cross-day transfers. Removed stops discard their input only
after the existing removal confirmation. New stops begin unscheduled.

Guide-derived copies keep existing controls and source data. Timing handlers
reject stale account generations, removed keys and pending writes/readback.
Account changes keep authored input in the tab, under existing recovery behavior.
Transient input and keys are removed from storage and parent notifications;
deletion still works even when an unsaved time is invalid.

Verify boundaries, invalid-input recovery, clearing, same-copy save/readback,
movement, account/busy guards, save-and-leave and bilingual narrow-screen reopen.
Preserve existing dirty work on branch work. No dependencies, schema, remote
push, backend connection, deployment or external upload. Windows delivery stays
paused; packaging is local only.
