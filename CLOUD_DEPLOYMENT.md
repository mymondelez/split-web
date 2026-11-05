# Split 2 Cloud — ready for separate Firebase project setup

## Isolation
- The original public app remains in GitHub branch \`main\`, unchanged.
- The separate local-only V2 demo remains in branch \`v2-redesign\`, unchanged.
- This branch, \`v2-cloud\`, contains a new cloud-backed build under \`v2/\`.
- The Firebase **V1** project \`split-da653\` MUST NOT be configured or deployed here.
- Hosting \`firebase.json\` publishes only the \`v2/\` directory, not V1.

## Why deployment is not active yet
This repository does not grant Google Firebase project-management credentials. The file
\`v2/firebase-config.js\` and \`.firebaserc\` intentionally contain placeholders. The app
must not claim to store data online until Firebase is configured and tested.

## Setup checklist
1. Create a NEW Firebase project with a new project ID, e.g. \`split-cloud-v2-XXXXX\`.
2. Enable Firebase Authentication > Anonymous sign-in.
3. Create Cloud Firestore in production mode in an appropriate region.
4. Register a web app and update \`v2/firebase-config.js\` with that NEW project's web config.
5. Set \`.firebaserc\` default project to the NEW project ID.
6. Verify the \`firestore.rules\` security model, then deploy rules and hosting into the NEW project:
   \`\`\`sh
   firebase login
   firebase deploy --project <NEW_PROJECT_ID> --only firestore:rules,hosting
   \`\`\`
7. Open the NEW hosting URL, create a test room, record an expense, open its invitation link
   from a second mobile browser, and verify realtime updates and reload persistence.
8. Verify the V1 URL and data are unchanged.

## Database design
- \`roomsV2/{roomCode}\` contains group name, participants and creator UID.
- \`roomsV2/{roomCode}/expenses/{expenseId}\` contains expenses, amounts in integer cents,
  payer, participants, description and optional category.
- \`usersV2/{anonymousUid}/splits/{roomCode}\` is an individual recent-group index.

The room code uses **24 characters from 32 unambiguous symbols** (~120-bit entropy).
The code or invitation link is the access key: **any signed-in person with the link can
read, create, edit categories and delete expenses**. They cannot delete the full group
unless they are the original creator on that Firebase anonymous account.

The app uses anonymous authentication (no registration). Different devices get different
anonymous user IDs. Sharing a room link lets them collaborate, but the private "I miei
gruppi" list is not synchronized between devices without a future account sign-in
feature. If the creator clears browser identity, they may lose their ability to delete
the whole room; this matches the limitation of anonymous identities.

For stronger personal privacy (revocable access, membership/roles) implement accounts
and membership checks/Cloud Functions before storing sensitive financial information.

## Local-only demo migration
Data stored on the old \`raw.githack.com\` origin cannot be read automatically by a new
Firebase Hosting origin because browsers isolate localStorage by origin.
No automatic transfer of existing test groups is claimed. The cloud build contains
an importer for groups available in its OWN browser origin; a file export/import
workflow is a separate enhancement for cross-origin migration.

## Web app / PWA
Firebase Hosting publishes directory \`v2/\` as the root of the new independent site,
using \`v2/index.html\`, its CSS, ES modules, manifest and copied original icons.
It supports the browser's Add to Home Screen action; there is no offline database
synchronization guarantee in this release.

## Checks
Run \`cd v2 && npm test\`. UI rendering and Firebase permissions must still be
tested against a dedicated Firebase test project/emulator before real usage.
