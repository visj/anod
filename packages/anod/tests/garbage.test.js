import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signal, compute } from "./_helper.js";

describe("garbage collection", { skip: true }, () => {
    it("placeholder — requires runtime-specific GC APIs", () => {});
});
