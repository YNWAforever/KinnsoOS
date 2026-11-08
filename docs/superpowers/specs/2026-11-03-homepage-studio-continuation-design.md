# Homepage to studio continuation

The user selected completing the homepage-to-studio flows as the next phase. The
target is the Journeys app, whose real homepage already renders ConversationHome.

Keep the existing Next.js/React architecture and all original workflows. Improve
the shared entry rather than replace either application or enable backend gates.
Traveller, creator and merchant requests should reach the appropriate task. A
question must survive the documents/templates detour without entering a URL or
browser storage, and must never cross an account or unrelated task boundary.

The next increment is a manual task brief for traveller/merchant tasks when their
connected stores are absent: edit the question and own notes, review and explicitly
copy the brief, then open the existing workflow. It must say that the brief has not
been saved. Existing connected/fixture flows retain their own readers and writers.
Creator panels and fixture flows receive the same staged question. The template
catalogue can be filtered by audience and remains reachable from the homepage.

Approaches considered: connecting the prototype stores to production would falsely
present sample data as persisted work; enabling native services requires separate
database/provider acceptance. A manual intake using the current workflows delivers
a useful complete entry flow within the selected scope. This is an implementation
choice, not a claim that connected traveller/merchant persistence is complete.

Validate English and Traditional Chinese intents, ambiguous input, all audience
entries, typed-question detours, account invalidation, unavailable services,
clipboard failure, reload, and mobile layout. No deployment, schema changes,
credentials, providers, dependency upgrades or capability changes are required.
