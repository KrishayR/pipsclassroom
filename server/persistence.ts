import fs from "node:fs";
import { randomUUID } from "node:crypto";

export function atomicWriteFileSync(path: string, content: string) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, content);
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(temporary, path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt === 5 || !["EPERM", "EACCES", "EBUSY"].includes(code ?? ""))
        throw error;
      // Windows sync/antivirus locks can briefly prevent atomic replacement.
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        50 * 2 ** attempt,
      );
    }
  }
}
