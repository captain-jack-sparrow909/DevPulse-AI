import assert from "node:assert/strict";
import test from "node:test";
import { summarizeReadiness } from "@/lib/operations/readiness";

const check = (status: "ready" | "warning" | "missing") => ({
  key: "test",
  label: "Test",
  status,
  message: "Safe status message",
});

test("readiness is ready when the database and config are ready", () => {
  assert.deepEqual(summarizeReadiness([check("ready")], true), {
    status: "ready",
    httpStatus: 200,
  });
});

test("warnings degrade without taking the deployment out of rotation", () => {
  assert.deepEqual(summarizeReadiness([check("warning")], true), {
    status: "degraded",
    httpStatus: 200,
  });
});

test("missing required config or database connectivity is unready", () => {
  assert.equal(summarizeReadiness([check("missing")], true).httpStatus, 503);
  assert.equal(summarizeReadiness([check("ready")], false).httpStatus, 503);
});
