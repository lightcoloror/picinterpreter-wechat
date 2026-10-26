"""Bounded IDE close/reopen proof; no product persistence or IDE calls on import.

Intent: distinguish wx's current in-memory readback from the IDE's delayed disk
write. Decision: wait for exact synthetic values on disk and an actual native
window-close event before reopening. Only an explicitly named synthetic offline
scope is inspected; no other user's storage values are decoded or returned.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

DRAFT_SUFFIX = "cboard_communication_expression_draft_v1"


class BoundaryError(RuntimeError):
    pass


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


@dataclass(frozen=True)
class SyntheticScope:
    prefix: str
    marker_suffix: str = "close-open-proof"

    def __post_init__(self):
        if not re.fullmatch(r"communication-v2:offline:synthetic-[a-zA-Z0-9_-]+:synthetic-[a-zA-Z0-9_-]+:", self.prefix):
            raise BoundaryError("An explicit synthetic offline family/profile scope is required")
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", self.marker_suffix) or self.marker_suffix == DRAFT_SUFFIX:
            raise BoundaryError("Invalid synthetic marker suffix")

    @property
    def draft_key(self):
        return self.prefix + DRAFT_SUFFIX

    @property
    def marker_key(self):
        return self.prefix + self.marker_suffix

    @property
    def keys(self):
        return (self.draft_key, self.marker_key)


def project_hash(value):
    """Installed IDE's project identity hash, using UTF-16 code units."""
    result = 0
    encoded = value.encode("utf-16-le")
    for offset in range(0, len(encoded), 2):
        result = (result * 31 + int.from_bytes(encoded[offset:offset + 2], "little")) & 0xffffffff
    return abs(result if result < 0x80000000 else result - 0x100000000)


def _skip_space(text, pos):
    while pos < len(text) and text[pos].isspace():
        pos += 1
    return pos


def _skip_value(text, pos):
    """Locate a JSON value boundary without decoding an unrelated value."""
    pos = _skip_space(text, pos)
    start = pos
    stack = []
    in_string = False
    escaped = False
    while pos < len(text):
        char = text[pos]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
                if not stack and text[start] == '"':
                    return pos + 1
        elif char == '"':
            in_string = True
        elif char in "[{":
            stack.append(char)
        elif char in "]}":
            if not stack:
                return pos
            expected = "[" if char == "]" else "{"
            if stack.pop() != expected:
                raise ValueError("Malformed JSON container")
            if not stack:
                return pos + 1
        elif char == "," and not stack:
            return pos
        pos += 1
    if in_string or stack or pos == start:
        raise ValueError("Incomplete JSON value")
    return pos


def _object_entries(text, start=0):
    pos = _skip_space(text, start)
    if pos >= len(text) or text[pos] != "{":
        raise ValueError("Expected object")
    pos += 1
    decoder = json.JSONDecoder()
    while True:
        pos = _skip_space(text, pos)
        if pos < len(text) and text[pos] == "}":
            return
        key, pos = decoder.raw_decode(text, pos)
        if not isinstance(key, str):
            raise ValueError("Expected object key")
        pos = _skip_space(text, pos)
        if pos >= len(text) or text[pos] != ":":
            raise ValueError("Expected colon")
        value_start = _skip_space(text, pos + 1)
        value_end = _skip_value(text, value_start)
        yield key, value_start, value_end
        pos = _skip_space(text, value_end)
        if pos >= len(text):
            raise ValueError("Incomplete object")
        if text[pos] == "}":
            return
        if text[pos] != ",":
            raise ValueError("Expected comma")
        pos += 1


def read_synthetic_storage(storage_dir, project_id, scope, namespace="0"):
    """Hash only two allowlisted values in one exact project/namespace.

    Other namespaces and keys are skipped lexically. File paths and raw values
    never leave this reader. More than one project partition fails closed.
    """
    if not isinstance(scope, SyntheticScope):
        raise BoundaryError("Synthetic scope validation required")
    if not re.fullmatch(r"\d+", str(namespace)):
        raise BoundaryError("Explicit numeric storage namespace required")
    numeric_hash = project_hash(str(project_id))
    files = list(Path(storage_dir).glob(f"storage_{numeric_hash}_*.json"))
    result = {"projectHash": numeric_hash, "candidateCount": len(files),
              "namespace": str(namespace), "hashes": {}}
    if len(files) != 1:
        result["issue"] = "missing_partition" if not files else "ambiguous_partition"
        return result
    file = files[0]
    result["fileIdentitySha256"] = hashlib.sha256(str(file).encode()).hexdigest()
    try:
        text = file.read_text("utf-8-sig")
        spaces = [(start, end) for key, start, end in _object_entries(text) if key == str(namespace)]
        if len(spaces) != 1:
            result["issue"] = "missing_or_duplicate_namespace"
            return result
        seen = set()
        for key, start, end in _object_entries(text, spaces[0][0]):
            if key not in scope.keys:
                continue
            if key in seen:
                raise ValueError("Duplicate synthetic key")
            seen.add(key)
            entry = json.loads(text[start:end])
            value = entry.get("data") if isinstance(entry, dict) else entry
            result["hashes"][key] = digest(value)
        result["mtimeNs"] = file.stat().st_mtime_ns
    except (OSError, ValueError, TypeError) as error:
        result["hashes"] = {}
        result["issue"] = "read_error"
        result["errorType"] = type(error).__name__
    return result


def _wait(read, accept, timeout, interval, monotonic, sleep, evidence):
    if not 0 < timeout <= 60 or not 0 < interval <= 5:
        raise BoundaryError("Wait must be bounded to at most 60 seconds")
    started = monotonic()
    attempts = 0
    while True:
        latest = read()
        attempts += 1
        evidence.update({"attempts": attempts, "elapsedSeconds": monotonic() - started, "last": latest})
        if accept(latest):
            return latest
        if monotonic() - started >= timeout:
            raise BoundaryError("Boundary wait timed out")
        sleep(min(interval, timeout - (monotonic() - started)))


def wait_for_persisted(read_disk, expected_hashes, *, timeout=30, interval=1,
                       monotonic=time.monotonic, sleep=time.sleep, evidence=None):
    if len(expected_hashes) != 2:
        raise BoundaryError("Both synthetic draft and marker hashes are required")
    previous_identity = None
    def accepted(item):
        nonlocal previous_identity
        matched = (not item.get("issue") and item.get("candidateCount") == 1
                   and item.get("hashes") == expected_hashes and item.get("fileIdentitySha256"))
        identity = item.get("fileIdentitySha256") if matched else None
        stable = identity is not None and identity == previous_identity
        previous_identity = identity
        return stable
    return _wait(read_disk, accepted, timeout, interval, monotonic, sleep,
                 evidence if evidence is not None else {})


def read_native_close_events(log_dir, win_id, since):
    if not re.fullmatch(r"s\d+", win_id):
        raise BoundaryError("An identified old window is required")
    since_time = datetime.fromisoformat(since)
    if since_time.tzinfo is not None:
        raise BoundaryError("Use the IDE log's local timestamp without timezone")
    events = []
    files = sorted(Path(log_dir).glob("*.log"), key=lambda item: item.stat().st_mtime, reverse=True)[:12]
    for file in files:
        with file.open("r", encoding="utf-8", errors="replace") as stream:
            for line in stream:
                event = next((name for name in ("native-window-closed", "native-window-close-cancelled") if name in line), None)
                if not event or not re.search(r"winId:\s*['\"]" + re.escape(win_id) + r"['\"]", line):
                    continue
                stamp = re.match(r"^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?)", line)
                if not stamp or datetime.fromisoformat(stamp.group(1)) < since_time:
                    continue
                events.append({"timestamp": stamp.group(1), "event": event, "winId": win_id,
                               "lineSha256": hashlib.sha256(line.encode()).hexdigest()})
    return sorted(events, key=lambda item: item["timestamp"])


def wait_for_native_closed(read_events, win_id, since, *, timeout=30, interval=1,
                           monotonic=time.monotonic, sleep=time.sleep, evidence=None):
    def accepted(events):
        relevant = [event for event in events if event.get("winId") == win_id and event.get("timestamp", "") >= since]
        if any(event.get("event") == "native-window-close-cancelled" for event in relevant):
            raise BoundaryError("Native window close was cancelled; do not reopen")
        return any(event.get("event") == "native-window-closed" for event in relevant)
    return _wait(read_events, accepted, timeout, interval, monotonic, sleep,
                 evidence if evidence is not None else {})


def bind_runtime_once_retry(ide, *, sleep=time.sleep, on_progress=lambda _event: None):
    """A binding timeout allows one read-only retry, never another refresh."""
    errors = []
    for attempt in range(2):
        on_progress({"stage": "runtime-binding", "attempt": attempt + 1})
        try:
            return {"result": ide.call("automation_runtime_info", action="currentPage"), "readErrors": errors}
        except Exception as error:
            # Do not hide permissions, protocol errors, or arbitrary failures.
            if "timeout" not in str(error).lower() and "timed out" not in str(error).lower() and not isinstance(error, TimeoutError):
                raise
            errors.append(type(error).__name__)
            on_progress({"stage": "runtime-binding-timeout", "attempt": attempt + 1,
                         "errorType": type(error).__name__})
            if attempt:
                raise BoundaryError("Runtime binding timed out after one read-only retry") from error
            sleep(1)


def close_open_boundary(ide, *, scope, expected_hashes, old_window_id, read_disk,
                        read_events, read_runtime_hashes, evidence, timeout=30,
                        monotonic=time.monotonic, sleep=time.sleep,
                        on_progress=lambda _event: None,
                        now=lambda: datetime.now().isoformat(sep=" ", timespec="milliseconds")):
    """The transport is injected; importing/tests never control the real IDE."""
    if not isinstance(scope, SyntheticScope) or set(expected_hashes) != set(scope.keys):
        raise BoundaryError("Expected hashes must name exactly the synthetic draft and marker")
    if not re.fullmatch(r"s\d+", old_window_id):
        raise BoundaryError("Old window ID must come from its actual open receipt")
    evidence["diskPersistence"] = {}
    on_progress({"stage": "waiting-for-synthetic-disk"})
    wait_for_persisted(read_disk, expected_hashes, timeout=timeout, monotonic=monotonic,
                       sleep=sleep, evidence=evidence["diskPersistence"])
    if read_runtime_hashes() != expected_hashes:
        raise BoundaryError("Runtime changed while awaiting disk; do not close")
    since = now()
    evidence["closeSince"] = since
    on_progress({"stage": "closing-persisted-project"})
    evidence["closeReceipt"] = ide.call("close_project_window")
    evidence["nativeClose"] = {}
    on_progress({"stage": "waiting-for-native-closed"})
    wait_for_native_closed(lambda: read_events(old_window_id, since), old_window_id, since,
                           timeout=timeout, monotonic=monotonic, sleep=sleep,
                           evidence=evidence["nativeClose"])
    on_progress({"stage": "opening-new-full-mode-window"})
    opened = ide.call("open_project_window", **{"window-mode": "fullMode"})
    evidence["openReceipt"] = opened
    if not isinstance(opened, dict) or opened.get("type") != "newopen" or not re.fullmatch(r"s\d+", str(opened.get("winId", ""))):
        raise BoundaryError("Expected a newly opened window, not a reused window")
    evidence["runtimeBinding"] = bind_runtime_once_retry(ide, sleep=sleep, on_progress=on_progress)
    return evidence
