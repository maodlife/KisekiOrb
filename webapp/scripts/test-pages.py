"""Exercise the exported app on a static server without isolation headers."""

import functools
import json
import os
import re
import tempfile
import threading
import unicodedata
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


base_path = os.environ.get("NEXT_PUBLIC_BASE_PATH", "/KisekiOrb").rstrip("/")
dist = Path("dist/client").resolve()
assert (dist / "index.html").is_file(), "Build the Pages site first"
assert (dist / "vendor/z3-built.wasm").is_file(), "Z3 WASM must be hosted locally"
characters = json.loads(Path("data/characters.json").read_text())["characters"]
kloe = next(character for character in characters if character["id"] == "kloe")

with tempfile.TemporaryDirectory(prefix="orbment-pages-") as directory:
    root = Path(directory)
    if base_path:
        mount = root / base_path.lstrip("/")
        mount.parent.mkdir(parents=True, exist_ok=True)
        mount.symlink_to(dist, target_is_directory=True)
    else:
        root = dist
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(root))
    )
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}{base_path}/"
    try:
        with sync_playwright() as playwright:
            options = {"headless": True, "args": ["--no-sandbox"]}
            if os.environ.get("CHROMIUM_EXECUTABLE"):
                options["executable_path"] = os.environ["CHROMIUM_EXECUTABLE"]
            browser = playwright.chromium.launch(**options)
            context = browser.new_context()
            page = context.new_page()
            errors = []
            failures = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("response", lambda response: failures.append(response.url)
                    if response.status >= 400 else None)
            page.goto(url)
            page.wait_for_function(
                "window.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'",
                timeout=30_000,
            )
            expect(page.get_by_text("已自动保存", exact=True)).to_be_visible()
            expect(page.get_by_role("heading", name="导力器配装求解", exact=True)).to_be_visible()
            page.get_by_role("combobox", name="选择角色").select_option("kloe")
            page.get_by_label("尝试时间", exact=False).fill("10")
            page.get_by_role("button", name=re.compile("开始求解")).click()
            expect(page.locator(".build-card").first).to_be_visible(timeout=60_000)
            expect(page.get_by_role("button", name=re.compile("开始求解"))).to_be_enabled(timeout=30_000)
            assert page.locator(".empty-result").count() == 0, page.locator("#results").inner_text()
            # Check every displayed improvement, including legacy data with null family fields.
            for card in page.locator(".build-card").all():
                card.locator(".build-summary").click()
                names = card.locator(".detail-row b").all_text_contents()
                assert len(names) == 7, names
                families = []
                for name in names:
                    match = re.fullmatch(r"(.*?)\s*[0-9]+", unicodedata.normalize("NFKC", name.strip()))
                    if match and match[1].strip():
                        families.append(match[1].strip().lower())
                assert len(families) == len(set(families)), names
                named_slots = dict(zip((slot["id"] for slot in kloe["slots"]), names))
                for line in kloe["lines"]:
                    for suffix in ["刃", "盾"]:
                        matches = [name for slot_id in line["slots"]
                                   if re.search(rf"之{suffix}(?:\s*[0-9]+)?$",
                                                name := unicodedata.normalize("NFKC", named_slots[slot_id].strip()))]
                        assert len(matches) <= 1, (line["id"], matches)
                assert not ({"异香", "阳炎"} <= set(names)), names
            # Revisit with the existing Service Worker and persisted player state.
            page.reload()
            page.wait_for_function("window.crossOriginIsolated", timeout=30_000)
            expect(page.get_by_role("combobox", name="选择角色")).to_have_value("kloe")
            # Requiring both drive levels must fail rather than show an illegal build.
            for name in ["驱动2", "驱动3"]:
                page.get_by_role("button", name=f"{name}必须装备", exact=True).click()
            page.get_by_role("button", name=re.compile("开始求解")).click()
            expect(page.locator(".empty-result")).to_contain_text("没有合法方案", timeout=30_000)
            expect(page.locator(".build-card")).to_have_count(0)
            # Exercise the compiled worker with a small persisted custom topology.
            # The earth-only center is shared; the water-only leaves are disjoint.
            empty = dict.fromkeys(["earth", "water", "fire", "wind", "time", "space", "mirage"], 0)
            slots = [{"id": slot_id, "x": 50 if slot_id == 9 else 20,
                      "y": 50, "currentLevel": 1, "maxGameLevel": 3,
                      "restriction": "earth" if slot_id == 9 else "water"}
                     for slot_id in [9, 13, 42]]
            character = {"id": "rules-browser", "name": "规则测试", "centralSlotId": 9,
                         "slots": slots, "lines": [
                             {"id": "L1", "name": "L1", "slots": [9, 13]},
                             {"id": "L2", "name": "L2", "slots": [9, 42]}]}

            def check_required_pair(first, second, first_element, expected_solved):
                quartz = [{"id": f"test-{index}", "name": name, "family": None,
                           "quartzLevel": 1, "uniqueEquip": None,
                           "series": element, "elements": {**empty, element: 2},
                           "stats": {}, "tags": []}
                          for index, (name, element) in enumerate([
                              (first, first_element), (second, "water")])]
                game = {"version": "browser-rules-test", "characters": [character],
                        "quartz": quartz, "arts": []}
                player = {"version": "browser-rules-test", "resources": {
                    item["id"]: {"quartzId": item["id"], "ownedCount": 1,
                                 "shopAvailable": False, "shopPrice": None,
                                 "shopPurchaseLimit": None} for item in quartz},
                    "slotLevels": {character["id"]: {str(slot["id"]): 1 for slot in slots}},
                    "equipment": {}, "lastSolver": {"characterId": character["id"],
                        "resourceMode": "owned_only", "rankingPreset": "extra_arts",
                        "mustHaveArts": [], "mustHaveQuartz": [item["id"] for item in quartz],
                        "timeoutSeconds": 10}}
                page.evaluate("""([game, player]) => {
                    localStorage.setItem('kiseki-orbment.game-data.v1', JSON.stringify(game));
                    localStorage.setItem('kiseki-orbment.player-state.v1', JSON.stringify(player));
                }""", [game, player])
                page.reload()
                page.wait_for_function("window.crossOriginIsolated", timeout=30_000)
                expect(page.get_by_role("combobox", name="选择角色")).to_have_value(character["id"])
                page.get_by_role("button", name=re.compile("开始求解")).click()
                if expected_solved:
                    expect(page.locator(".build-card").first).to_be_visible(timeout=30_000)
                else:
                    expect(page.locator(".empty-result")).to_contain_text("没有合法方案", timeout=30_000)
                    expect(page.locator(".build-card")).to_have_count(0)
                expect(page.get_by_role("button", name=re.compile("开始求解"))).to_be_enabled()

            check_required_pair("毒之刃", "冻结之刃", "earth", False)
            check_required_pair("黄玉之盾", "苍玉之盾", "earth", False)
            check_required_pair("毒之刃", "黄玉之盾", "earth", True)
            check_required_pair("毒之刃", "冻结之刃", "water", True)
            check_required_pair("异香", "阳炎", "water", False)
            assert not errors, errors
            assert not failures, failures
            print("Pages browser check passed: subpath assets, first-visit isolation, Z3 solving, global exclusions, shared-center quotas, disjoint branches and saved state.")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
