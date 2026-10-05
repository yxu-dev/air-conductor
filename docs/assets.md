# Local assets

- `web/public/midi/ode.mid`: copied from `Final/ode.mid` during setup. Intended source: Mutopia's Ode to Joy, https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528 . The Mutopia page labels its edition Public Domain. The copied file's provenance has not been independently compared with the download.
- `web/public/models/gesture_recognizer.task`: copied from the Lab4 prototype during setup; no Lab4 path is referenced at runtime. Official model URL: https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task .
- `web/public/mediapipe/wasm/`: synchronized from the locked `@mediapipe/tasks-vision` npm dependency. Re-run `npm run sync:wasm` after dependency updates; `npm run build` also performs synchronization.

Third-party assets and dependencies retain their upstream licensing. The repository's MIT license applies to its own code.
