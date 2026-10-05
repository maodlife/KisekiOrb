"""Exercise the exported app on a static server without isolation headers."""

import functools
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
            assert not errors, errors
            assert not failures, failures
            print("Pages browser check passed: subpath assets, first-visit isolation, Z3 solving, quartz family exclusions and saved state.")
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
