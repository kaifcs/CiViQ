// Registers the extension-resolving hook before any test module is loaded.
// Referenced by the `test` script with a relative specifier, which Node accepts
// on every platform.

import { register } from "node:module"

register("./resolve-hook.mjs", import.meta.url)
