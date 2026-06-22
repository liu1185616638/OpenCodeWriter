#!/usr/bin/env python3
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def read_payload():
    raw = sys.stdin.read().strip()
    return json.loads(raw) if raw else {}


def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def run(command, cwd):
    executable = shutil.which(command[0])
    if not executable:
        return subprocess.CompletedProcess(command, 127, "", f"找不到命令：{command[0]}")
    command = [executable, *command[1:]]
    return subprocess.run(command, cwd=cwd, text=True, capture_output=True)


def root_for(payload):
    cwd = Path(payload.get("cwd") or os.getcwd()).resolve()
    result = run(["git", "rev-parse", "--show-toplevel"], cwd)
    return Path(result.stdout.strip()).resolve() if result.returncode == 0 else cwd


def state_dir(root):
    path = root / ".codex" / ".state"
    path.mkdir(parents=True, exist_ok=True)
    return path


def deny_pretool(reason):
    emit({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason}})


def command_text(payload):
    tool_input = payload.get("tool_input") or {}
    return tool_input.get("command", "") if isinstance(tool_input, dict) else ""


def verify_project(root):
    checks = []
    package = root / "package.json"
    if package.exists():
        try:
            scripts = json.loads(package.read_text(encoding="utf-8")).get("scripts", {})
        except (OSError, json.JSONDecodeError) as exc:
            return False, f"package.json 无法读取：{exc}"
        for name in ("typecheck", "build"):
            if name in scripts:
                checks.append((["npm", "run", name], f"npm run {name}"))
    elif (root / "Cargo.toml").exists():
        checks.append((["cargo", "check"], "cargo check"))
    elif (root / "go.mod").exists():
        checks.append((["go", "test", "./..."], "go test ./..."))
    elif (root / "pyproject.toml").exists() or (root / "requirements.txt").exists():
        checks.append(([sys.executable, "-m", "compileall", "-q", "."], "python -m compileall -q ."))

    for argv, label in checks:
        result = run(argv, root)
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()[-1200:]
            return False, f"提交前验证失败：{label}\n{detail}"
    return True, ""


def pre_tool_shell(payload):
    if not re.search(r"(?:^|[;&|]\s*)git\s+commit\b", command_text(payload), re.I):
        emit({})
        return
    root = root_for(payload)
    if (root / ".codex" / ".state" / "review-needed").exists():
        deny_pretool("代码审查尚未通过；完成两阶段审查并清除 review-needed 状态后再提交。")
        return
    ok, reason = verify_project(root)
    deny_pretool(reason) if not ok else emit({})


def successful_response(payload):
    response = payload.get("tool_response")
    if isinstance(response, dict):
        for key in ("exit_code", "exitCode", "code"):
            if key in response:
                return response[key] == 0
        if response.get("success") is not None:
            return bool(response["success"])
    text = json.dumps(response, ensure_ascii=False) if response is not None else ""
    return bool(re.search(r"Exit code:\s*0|Process exited with code 0", text, re.I))


def auto_push(payload):
    if not re.search(r"(?:^|[;&|]\s*)git\s+commit\b", command_text(payload), re.I) or not successful_response(payload):
        emit({})
        return
    root = root_for(payload)
    branch = run(["git", "branch", "--show-current"], root).stdout.strip()
    if not branch or re.fullmatch(r"main|master|release(?:/.*)?|production", branch, re.I):
        emit({"systemMessage": f"自动推送已跳过保护分支：{branch or 'detached HEAD'}"})
        return
    if run(["git", "remote", "get-url", "origin"], root).returncode != 0:
        emit({"systemMessage": "自动推送已跳过：未配置 origin。"})
        return
    if os.environ.get("CODEX_HOOK_DRY_RUN") == "1":
        emit({"systemMessage": f"auto-push dry-run: git push origin {branch}"})
        return
    result = run(["git", "push", "origin", branch], root)
    if result.returncode != 0:
        reason = (result.stderr or result.stdout).strip()[-1200:]
        emit({"decision": "block", "reason": f"提交成功但自动推送失败：{reason}"})
        return
    emit({"systemMessage": f"已自动推送 origin/{branch}。"})


def stop_gate(payload):
    root = root_for(payload)
    if not (root / ".codex" / ".state" / "review-needed").exists():
        emit({})
        return
    reason = "检测到代码变更尚未完成两阶段审查。请先审查、修复并重新验证。"
    if payload.get("stop_hook_active"):
        emit({"continue": False, "systemMessage": reason})
    else:
        emit({"decision": "block", "reason": reason})


CODE_EXTENSIONS = {
    ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".h", ".hpp", ".html",
    ".java", ".js", ".jsx", ".kt", ".kts", ".php", ".ps1", ".py", ".rb",
    ".rs", ".scss", ".sh", ".sql", ".swift", ".ts", ".tsx", ".vue",
}


def changed_files(root):
    files = set()
    for argv in (["git", "diff", "--name-only"], ["git", "diff", "--cached", "--name-only"], ["git", "ls-files", "--others", "--exclude-standard"]):
        result = run(argv, root)
        if result.returncode == 0:
            files.update(line.strip() for line in result.stdout.splitlines() if line.strip())
    return files


def mark_review_needed(payload):
    root = root_for(payload)
    code = sorted(path for path in changed_files(root) if Path(path).suffix.lower() in CODE_EXTENSIONS and not path.startswith(".codex/.state/"))
    if not code:
        emit({})
        return
    marker = state_dir(root) / "review-needed"
    marker.write_text("\n".join(code) + "\n", encoding="utf-8")
    emit({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": f"代码已变更，提交前需审查：{', '.join(code[:8])}"}})


FEEDBACK = re.compile(r"你又|还是没|仍然没|我说过|不是这样|不对|错了|为什么又|别再|不要再|you ignored|still wrong|not what i asked|don't do that", re.I)


def detect_feedback(payload):
    prompt = payload.get("prompt") or ""
    if not FEEDBACK.search(prompt):
        emit({})
        return
    root = root_for(payload)
    target = root / ".codex" / "evolution" / "signals.jsonl"
    target.parent.mkdir(parents=True, exist_ok=True)
    signal = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_id": payload.get("session_id"),
        "prompt": prompt,
        "status": "pending",
    }
    with target.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(signal, ensure_ascii=False, separators=(",", ":")) + "\n")
    emit({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "已记录一条纠正信号；不要自动修改规则。"}})


def check_evolution(payload):
    root = root_for(payload)
    target = root / ".codex" / "evolution" / "signals.jsonl"
    count = 0
    if target.exists():
        count = sum(1 for line in target.read_text(encoding="utf-8").splitlines() if line.strip())
    if count:
        emit({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": f"进化队列有 {count} 条待处理信号。提醒用户是否运行 evolution-engine；未经逐条确认不要修改规则。"}})
    else:
        emit({})


ACTIONS = {
    "pre-tool-shell": pre_tool_shell,
    "auto-push": auto_push,
    "stop-gate": stop_gate,
    "mark-review-needed": mark_review_needed,
    "detect-feedback-signal": detect_feedback,
    "check-evolution": check_evolution,
}


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ACTIONS:
        raise SystemExit("usage: hook-runner.py <hook-name>")
    ACTIONS[sys.argv[1]](read_payload())


if __name__ == "__main__":
    main()
