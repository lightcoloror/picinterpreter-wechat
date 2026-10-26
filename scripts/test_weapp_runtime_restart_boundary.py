"""Offline fault-injection tests. No IDE, network, user profile or model access."""
import json
import tempfile
import unittest
from pathlib import Path

from weapp_runtime_restart_boundary import (
    BoundaryError, SyntheticScope, bind_runtime_once_retry, close_open_boundary,
    digest, project_hash, read_native_close_events, read_synthetic_storage,
    wait_for_native_closed, wait_for_persisted,
)


SCOPE = SyntheticScope("communication-v2:offline:synthetic-family:synthetic-profile:")
VALUES = {SCOPE.draft_key: '{"synthetic":{"revision":3,"rejected":true}}', SCOPE.marker_key: "synthetic-proof"}
HASHES = {key: digest(value) for key, value in VALUES.items()}
SINCE = "2026-10-21 08:00:00.000"


class Clock:
    def __init__(self):
        self.value = 0

    def monotonic(self):
        return self.value

    def sleep(self, value):
        self.value += value


class Ide:
    def __init__(self, opened=None, bind_errors=0):
        self.calls = []
        self.opened = opened or {"type": "newopen", "winId": "s2"}
        self.bind_errors = bind_errors

    def call(self, tool, **options):
        self.calls.append((tool, options))
        if tool == "open_project_window":
            return self.opened
        if tool == "automation_runtime_info":
            if self.bind_errors:
                self.bind_errors -= 1
                raise TimeoutError("synthetic binding timed out")
            return {"pageId": 2}
        return {"success": True}


def disk(hashes=None):
    return {"candidateCount": 1, "namespace": "0", "fileIdentitySha256": "synthetic-file-a",
            "hashes": HASHES if hashes is None else hashes}


def closed(win="s1", stamp="2026-10-21 08:00:00.001"):
    return {"winId": win, "timestamp": stamp, "event": "native-window-closed"}


class RestartBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()

    def timer(self):
        return {"timeout": 3, "monotonic": self.clock.monotonic, "sleep": self.clock.sleep}

    def test_scope_rejects_user_online_or_unbounded_storage(self):
        for value in ("cboard_communication_expression_draft_v1", "communication-v2:user:family:profile:",
                      "communication-v2:offline:real-family:synthetic-profile:"):
            with self.subTest(value=value), self.assertRaises(BoundaryError):
                SyntheticScope(value)
        with self.assertRaises(BoundaryError):
            SyntheticScope(SCOPE.prefix, "../unbounded")

    def test_delayed_disk_write_waits_for_both_exact_values(self):
        records = [disk({}), disk({SCOPE.draft_key: HASHES[SCOPE.draft_key]}), disk(), disk()]
        evidence = {}
        wait_for_persisted(lambda: records.pop(0), HASHES, evidence=evidence, **self.timer())
        self.assertEqual(evidence["attempts"], 4)
        self.assertEqual(self.clock.value, 3)

    def test_same_content_in_changing_partition_is_not_stable(self):
        records = [disk(), {**disk(), "fileIdentitySha256": "synthetic-file-b"},
                   {**disk(), "fileIdentitySha256": "synthetic-file-b"}]
        evidence = {}
        wait_for_persisted(lambda: records.pop(0), HASHES, evidence=evidence, **self.timer())
        self.assertEqual(evidence["attempts"], 3)
        self.assertEqual(self.clock.value, 2)

    def test_incomplete_write_resets_stability_count(self):
        records = [disk(), {**disk(), "issue": "read_error"}, disk(), disk()]
        evidence = {}
        wait_for_persisted(lambda: records.pop(0), HASHES, evidence=evidence, **self.timer())
        self.assertEqual(evidence["attempts"], 4)

    def test_stale_or_missing_partition_times_out(self):
        for snapshot in (disk({}), {**disk(), "candidateCount": 2, "issue": "ambiguous_partition"}):
            self.clock = Clock()
            with self.subTest(snapshot=snapshot), self.assertRaises(BoundaryError):
                wait_for_persisted(lambda: snapshot, HASHES, **self.timer())
            self.assertEqual(self.clock.value, 3)

    def test_disk_reader_exact_project_namespace_and_no_other_values(self):
        with tempfile.TemporaryDirectory() as folder:
            project = "D:\\synthetic\\candidate"
            file = Path(folder) / f"storage_{project_hash(project)}_test.json"
            entries = {key: {"data": value} for key, value in VALUES.items()}
            file.write_text(json.dumps({"0": {**entries, "another-user": {"data": "PRIVATE_DO_NOT_RETURN"}},
                                        "1": {SCOPE.draft_key: {"data": "wrong namespace"}}}), "utf-8")
            result = read_synthetic_storage(folder, project, SCOPE)
            self.assertEqual(result["hashes"], HASHES)
            self.assertNotIn("PRIVATE_DO_NOT_RETURN", json.dumps(result))
            self.assertNotIn(str(file), json.dumps(result))
            self.assertEqual(read_synthetic_storage(folder, "different-project", SCOPE)["candidateCount"], 0)
            wrong = read_synthetic_storage(folder, project, SCOPE, "1")
            self.assertNotEqual(wrong["hashes"], HASHES)
            with self.assertRaises(BoundaryError):
                wait_for_persisted(lambda: wrong, HASHES, **self.timer())

    def test_disk_reader_duplicate_partition_and_partial_json_fail_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / f"storage_{project_hash('synthetic')}_one.json"
            file.write_text('{"0": {', "utf-8")
            result = read_synthetic_storage(folder, "synthetic", SCOPE)
            self.assertEqual(result["issue"], "read_error")
            self.assertEqual(result["hashes"], {})
            file.with_name(file.name.replace("one", "two")).write_text("{}", "utf-8")
            self.assertEqual(read_synthetic_storage(folder, "synthetic", SCOPE)["issue"], "ambiguous_partition")

    def test_log_reader_ignores_wrong_window_old_events_and_unrelated_data(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "synthetic.log").write_text(
                "[2026-10-21 07:59:59.999+08:00] native-window-closed winId: 's1'\n"
                "[2026-10-21 08:00:00.002+08:00] native-window-closed winId: 's3'\n"
                "[2026-10-21 08:00:00.003+08:00] unrelated PRIVATE_DO_NOT_RETURN\n"
                "[2026-10-21 08:00:00.004+08:00] native-window-closed winId: 's1'\n", "utf-8")
            result = read_native_close_events(folder, "s1", SINCE)
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["timestamp"], "2026-10-21 08:00:00.004")
            self.assertNotIn("PRIVATE_DO_NOT_RETURN", json.dumps(result))

    def test_close_cancelled_immediately_stops(self):
        event = {**closed(), "event": "native-window-close-cancelled"}
        with self.assertRaisesRegex(BoundaryError, "cancelled"):
            wait_for_native_closed(lambda: [event], "s1", SINCE, **self.timer())
        self.assertEqual(self.clock.value, 0)

    def test_close_ack_or_wrong_window_is_not_closed(self):
        with self.assertRaisesRegex(BoundaryError, "timed out"):
            wait_for_native_closed(lambda: [closed("s99"), closed(stamp="2026-10-21 07:00:00.000")],
                                   "s1", SINCE, **self.timer())

    def run_boundary(self, ide, events=None, runtime_hashes=None):
        evidence = {}
        close_open_boundary(ide, scope=SCOPE, expected_hashes=HASHES, old_window_id="s1",
                            read_disk=disk, read_events=events or (lambda *_: [closed()]),
                            read_runtime_hashes=lambda: HASHES if runtime_hashes is None else runtime_hashes,
                            evidence=evidence, now=lambda: SINCE, **self.timer())
        return evidence

    def test_delayed_native_closed_waits_then_opens_full_mode_once(self):
        ide = Ide()
        events = [[], [], [closed()]]
        result = self.run_boundary(ide, events=lambda *_: events.pop(0))
        self.assertEqual(result["nativeClose"]["attempts"], 3)
        self.assertEqual(ide.calls, [("close_project_window", {}),
                                     ("open_project_window", {"window-mode": "fullMode"}),
                                     ("automation_runtime_info", {"action": "currentPage"})])

    def test_close_timeout_does_not_open(self):
        ide = Ide()
        with self.assertRaises(BoundaryError):
            self.run_boundary(ide, events=lambda *_: [])
        self.assertEqual(ide.calls, [("close_project_window", {})])

    def test_close_cancel_does_not_open(self):
        ide = Ide()
        with self.assertRaises(BoundaryError):
            self.run_boundary(ide, events=lambda *_: [{**closed(), "event": "native-window-close-cancelled"}])
        self.assertEqual(ide.calls, [("close_project_window", {})])

    def test_runtime_change_during_persistence_wait_never_closes(self):
        ide = Ide()
        with self.assertRaisesRegex(BoundaryError, "Runtime changed"):
            self.run_boundary(ide, runtime_hashes={})
        self.assertEqual(ide.calls, [])

    def test_reused_window_is_rejected_and_not_bound(self):
        ide = Ide(opened={"type": "reuse", "winId": "s1"})
        with self.assertRaisesRegex(BoundaryError, "newly opened"):
            self.run_boundary(ide)
        self.assertEqual(len(ide.calls), 2)

    def test_binding_timeout_only_one_read_only_retry_no_refresh(self):
        ide = Ide(bind_errors=1)
        result = self.run_boundary(ide)
        self.assertEqual(result["runtimeBinding"]["readErrors"], ["TimeoutError"])
        self.assertEqual([call[0] for call in ide.calls].count("automation_runtime_info"), 2)
        self.assertNotIn("simulator_refresh", [call[0] for call in ide.calls])
        with self.assertRaises(BoundaryError):
            bind_runtime_once_retry(Ide(bind_errors=2), sleep=self.clock.sleep)


if __name__ == "__main__":
    unittest.main()
