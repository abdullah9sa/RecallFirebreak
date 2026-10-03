"""Tool-calling agent loop (OpenAI-compatible chat/completions, default: Gemini).

`run_agent` is an async generator yielding UI events, so Milestone 3 can stream
it straight over SSE. CLI:  python -m backend.agent --test
"""
import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any, AsyncIterator, Dict

import httpx

from . import config
from .state import state
from .tools import TOOL_FUNCS, TOOL_SCHEMAS, RunContext

DATA_DIR = Path(__file__).parent / "data"

SYSTEM_PROMPT = """You are RecallFirebreak, an autonomous pharmaceutical recall safety agent \
for Region Stockholm hospitals. You receive one regulatory bulletin (Läkemedelsverket style, \
often Swedish). Act with clinical judgment using ONLY the tools provided.

WORKFLOW
1. Call extract_recall with the facts from the bulletin. Include ONLY the recalled lot numbers \
(bulletins often name safe lots that must stay dispensable - never include those). \
If validation fails, fix the fields and call it again.
2. Decide by hazard_class:
   - CLASS_I or CLASS_II (patient-safety risk):
       a. lock_items for the recalled GTIN + lots IMMEDIATELY (before anything else).
       b. get_inventory for the GTIN.
       c. If the result says urgent, call find_substitutes with atc_code and units_needed \
(units_needed_for_14_day_buffer), then draft_purchase_order for the best candidate that has \
sufficient stock. Order exactly units_needed_for_14_day_buffer units.
       d. If not urgent, do not order; say why.
   - CLASS_III (cosmetic / administrative, no patient risk):
       Do NOT lock anything, do NOT check procurement. Call log_audit_note once explaining that \
the product stays dispensable and what to review at the next routine audit. Locking safe stock \
would cause an artificial shortage.
3. Finish with a 2-3 sentence final summary of what you did and why (this is the audit trail).

HARD RULES
- You can only DRAFT purchase orders. A human approves them. You have no approval tool.
- Never invent GTINs, lots, SKUs or quantities; use values from the bulletin and tool results.
- Call tools one step at a time in the order above.
- Write all notes, rationales and summaries in English, even though the bulletin may be Swedish."""


def load_bulletin(kind: str) -> str:
    files = {"class1": "bulletin_amoxicillin_class1.txt", "class3": "bulletin_alvedon_class3.txt"}
    return (DATA_DIR / files[kind]).read_text(encoding="utf-8")


async def _chat(client: httpx.AsyncClient, messages: list) -> Dict[str, Any]:
    resp = await client.post(
        "/chat/completions",
        headers={"Authorization": f"Bearer {config.LLM_API_KEY}"},
        json={
            "model": config.LLM_MODEL,
            "messages": messages,
            "tools": TOOL_SCHEMAS,
            "tool_choice": "auto",
            "temperature": 0,
        },
    )
    if resp.status_code != 200:
        raise RuntimeError(f"LLM HTTP {resp.status_code}: {resp.text[:400]}")
    return resp.json()


async def run_agent(bulletin_text: str) -> AsyncIterator[dict]:
    """Run the agent on one bulletin, yielding events for the UI/trace."""
    if not config.LLM_API_KEY:
        raise RuntimeError("No LLM API key found. Set ai_studio_key (or LLM_API_KEY) in .env")

    ctx = RunContext()
    started = time.perf_counter()
    tokens = {"prompt": 0, "completion": 0}
    messages: list = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"REGULATORY BULLETIN:\n\n{bulletin_text}"},
    ]
    final_text = ""

    async with httpx.AsyncClient(base_url=config.LLM_BASE_URL, timeout=config.LLM_TIMEOUT_S) as client:
        for _ in range(config.MAX_AGENT_STEPS):
            data = await _chat(client, messages)
            usage = data.get("usage") or {}
            tokens["prompt"] += usage.get("prompt_tokens", 0)
            tokens["completion"] += usage.get("completion_tokens", 0)

            msg = data["choices"][0]["message"]
            messages.append(msg)  # pass through untouched (keeps provider-specific fields)
            tool_calls = msg.get("tool_calls") or []

            if not tool_calls:
                final_text = (msg.get("content") or "").strip()
                break

            for call in tool_calls:
                name = call["function"]["name"]
                try:
                    args = json.loads(call["function"].get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                yield {"type": "tool_call", "tool": name, "args": args}

                fn = TOOL_FUNCS.get(name)
                result = fn(ctx, args) if fn else {"error": f"UNKNOWN_TOOL {name}"}

                # Emit side-effect events (lockout / inventory / po_draft / audit_note) first.
                for ev in ctx.events:
                    yield ev
                ctx.events.clear()

                yield {"type": "tool_result", "tool": name, "result": result}
                messages.append({
                    "role": "tool",
                    "tool_call_id": call.get("id", name),
                    "content": json.dumps(result, ensure_ascii=False),
                })
        else:
            final_text = "Stopped: reached the maximum number of agent steps."

    yield {"type": "agent_summary", "text": final_text}
    yield {
        "type": "done",
        "elapsed_ms": int((time.perf_counter() - started) * 1000),
        "tokens": tokens,
        "model": config.LLM_MODEL,
    }


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _print_event(ev: dict) -> None:
    t = ev["type"]
    if t == "tool_call":
        print(f"  -> {ev['tool']}({json.dumps(ev['args'], ensure_ascii=False)[:160]})")
    elif t == "tool_result":
        print(f"  <- {json.dumps(ev['result'], ensure_ascii=False)[:200]}")
    elif t == "agent_summary":
        print(f"\n  SUMMARY: {ev['text']}")
    elif t == "done":
        print(f"  [{ev['model']}] {ev['elapsed_ms']}ms, tokens={ev['tokens']}")


async def _run_case(kind: str) -> list:
    state.reset()
    events = []
    async for ev in run_agent(load_bulletin(kind)):
        _print_event(ev)
        events.append(ev)
    return events


def _check(label: str, ok: bool, failures: list) -> None:
    print(f"  {'PASS' if ok else 'FAIL'}: {label}")
    if not ok:
        failures.append(label)


async def _selftest() -> int:
    failures: list = []

    print("=== CASE A: Class 1 (Amimox contamination) ===")
    ev = await _run_case("class1")
    tools_a = [e["tool"] for e in ev if e["type"] == "tool_call"]
    _check("extracted the recall", "extract_recall" in tools_a, failures)
    _check("locked recalled lot L9824B", state.is_quarantined("07350012345678", "L9824B"), failures)
    _check("did NOT lock safe lot L1100A", not state.is_quarantined("07350012345678", "L1100A"), failures)
    inv = next((e for e in ev if e["type"] == "inventory"), None)
    _check("inventory 11.4d -> 3.2d", bool(inv) and inv["days_before"] == 11.4 and inv["days_remaining"] == 3.2, failures)
    pos = state.get_staged_pos()
    _check("staged exactly one PO", len(pos) == 1, failures)
    _check("PO substitute is Spektramox (J01CR02)",
           bool(pos) and pos[0]["recommended_substitute"]["atc_code"] == "J01CR02", failures)
    _check("PO awaits human approval", bool(pos) and pos[0]["status"] == "AWAITING_APPROVAL", failures)

    print("\n=== CASE B: Class 3 (Alvedon label misprint) ===")
    ev = await _run_case("class3")
    tools_b = [e["tool"] for e in ev if e["type"] == "tool_call"]
    _check("extracted the recall", "extract_recall" in tools_b, failures)
    _check("did NOT call lock_items", "lock_items" not in tools_b, failures)
    _check("did NOT draft a PO", "draft_purchase_order" not in tools_b and not state.get_staged_pos(), failures)
    _check("nothing quarantined", not state.get_quarantined_items(), failures)
    _check("logged an audit note", "log_audit_note" in tools_b, failures)

    state.reset()
    print("\nRESULT:", "ALL PASSED" if not failures else f"{len(failures)} FAILED: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    if "--test" in sys.argv:
        sys.exit(asyncio.run(_selftest()))
    kind = sys.argv[1] if len(sys.argv) > 1 else "class1"
    state.reset()

    async def _one():
        async for e in run_agent(load_bulletin(kind)):
            _print_event(e)

    asyncio.run(_one())
