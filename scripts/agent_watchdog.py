#!/usr/bin/env python3
"""
Agent Watchdog - Überwacht laufende Agenten und setzt Tasks bei Provider-Ausfällen fort.
Läuft alle 30 Minuten via Cron.
"""

import os
import json
import time
import glob
import subprocess
from datetime import datetime

WORKSPACE_BASE = os.path.expanduser("~/.openclaw")
AGENT_PROFILES = [
    "openclaw-tareno/agents/main",
    "openclaw-tareno/agents/social",
    "openclaw-tareno/agents/tarenoblog",
    "openclaw-blog/agents/main",
    "openclaw-blog/agents/social",
    "openclaw-social/agents/main",
]

STATE_FILE = "/tmp/agent_watchdog_state.json"

def log(msg):
    timestamp = datetime.now().isoformat()
    print(f"[{timestamp}] {msg}", flush=True)

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "last_check": None,
        "failed_sessions": {},
        "last_gateway_restart_check": 0,
    }

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)

def check_session_transcript(transcript_path):
    """Prüfe ob Session wegen Provider-Fehler abgebrochen wurde."""
    if not os.path.exists(transcript_path):
        return None
    
    try:
        with open(transcript_path, 'r') as f:
            lines = f.readlines()[-20:]  # Letzte 20 Zeilen
        
        content = ''.join(lines)
        
        # Provider-Fehler-Indikatoren
        error_patterns = [
            "429 Too Many Requests",
            "503 Service Unavailable",
            "Connection reset by peer",
            "Network error",
            "rate limit",
            "timeout",
            "abortedLastRun",
            "model"
        ]
        
        for pattern in error_patterns:
            if pattern.lower() in content.lower():
                log(f"⚠️ Provider-Fehler erkannt in {transcript_path}: {pattern}")
                return {
                    "type": "provider_error",
                    "pattern": pattern,
                    "path": transcript_path
                }
        
        return None
    except Exception as e:
        log(f"Fehler beim Lesen {transcript_path}: {e}")
        return None

def get_recent_sessions(minutes=35):
    """Finde Sessions, die in den letzten Minuten aktiv waren."""
    sessions = []
    cutoff = time.time() - (minutes * 60)
    
    for profile in AGENT_PROFILES:
        sessions_dir = os.path.join(WORKSPACE_BASE, profile, "sessions")
        if not os.path.exists(sessions_dir):
            continue
            
        for session_file in glob.glob(os.path.join(sessions_dir, "*.json")):
            try:
                mtime = os.path.getmtime(session_file)
                if mtime > cutoff:
                    with open(session_file) as f:
                        data = json.load(f)
                        sessions.append({
                            "file": session_file,
                            "data": data,
                            "mtime": mtime
                        })
            except:
                pass
    
    return sessions

def find_transcripts_for_session(session_key):
    """Finde Transkript-Dateien für eine Session."""
    transcripts = []
    workspace = os.path.expanduser("~/.openclaw/workspace-tareno")
    
    # Suche nach Session-ID im Dateinamen oder Inhalt
    if "sessionId" in session_key:
        session_id = session_key.split("sessionId")[1].split("|~|")[0]
        pattern = os.path.join(workspace, f"{session_id}*.jsonl")
        transcripts = glob.glob(pattern)
    
    return transcripts

def send_wake_event(agent_id, message="Provider recovery - resuming task"):
    """Platzhalter für Recovery-Hook (CLI hat aktuell keinen wake-Subcommand)."""
    log(f"ℹ️ Recovery-Hook aufgerufen für Agent {agent_id}: {message}")
    return False

def restart_stalled_task(session_info):
    """Versuche einen hängengebliebenen Task neu zu starten."""
    session_key = session_info.get("key", "unknown")
    log(f"🔄 Versuche Session zu erneuern: {session_key}")

    # Aktuell nur Wake-Event als sichere Recovery-Aktion.
    if send_wake_event("main"):
        return True
    return False


def count_gateway_restarts_since(last_check_ts):
    """Zählt Gateway-Restarts (SIGUSR1/restarting) seit letztem Check."""
    log_file = f"/tmp/openclaw/openclaw-{datetime.utcnow().strftime('%Y-%m-%d')}.log"
    if not os.path.exists(log_file):
        return 0

    restart_markers = ["signal SIGUSR1 received", "received SIGUSR1; restarting"]
    count = 0

    try:
        with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if any(marker in line for marker in restart_markers):
                    try:
                        ts_part = line.split(" ", 1)[0]
                        ts = datetime.fromisoformat(ts_part.replace("Z", "+00:00")).timestamp()
                    except Exception:
                        ts = 0
                    if ts >= last_check_ts:
                        count += 1
    except Exception as e:
        log(f"⚠️ Fehler beim Restart-Check: {e}")

    return count

def main():
    log("🔍 Agent Watchdog Start")
    
    state = load_state()
    now_ts = time.time()
    last_restart_check = state.get("last_gateway_restart_check", now_ts - 3600)
    state["last_check"] = datetime.now().isoformat()
    
    # 1. Prüfe auf abgebrochene Sessions (abortedLastRun)
    log("Prüfe auf abgebrochene Sessions...")
    recovered = 0

    try:
        result = subprocess.run(
            ["openclaw", "sessions", "--json", "--active", "60"],
            capture_output=True, text=True, timeout=30
        )

        if result.returncode == 0:
            sessions_data = json.loads(result.stdout)
            sessions = sessions_data.get("sessions", [])

            for session in sessions:
                if session.get("abortedLastRun"):
                    session_key = session.get("key", "unknown")
                    log(f"🚨 Abgebrochene Session gefunden: {session_key}")
                    
                    # Prüfe Transkript auf Provider-Fehler
                    transcript_path = session.get("transcriptPath")
                    if transcript_path:
                        error_info = check_session_transcript(transcript_path)
                        if error_info:
                            log(f"   → Provider-Fehler bestätigt, starte Recovery...")
                            if restart_stalled_task(session):
                                recovered += 1
                                state["failed_sessions"][session_key] = {
                                    "recovered_at": datetime.now().isoformat(),
                                    "error": error_info["pattern"]
                                }
            
            log(f"✅ {recovered} Sessions wiederhergestellt")
        else:
            log(f"⚠️ Konnte Sessions nicht abrufen: {result.stderr}")
    
    except Exception as e:
        log(f"❌ Fehler bei Session-Prüfung: {e}")
    
    # 2. Prüfe auf alte Lock-Files (für InstaFollow etc.)
    log("Prüfe auf hängende Lock-Dateien...")
    lock_files = [
        "/root/InstaFollow/.monitor.lock",
        "/root/.openclaw/workspace-tareno/.process.lock",
    ]
    
    stale_locks = 0
    for lock_file in lock_files:
        if os.path.exists(lock_file):
            try:
                mtime = os.path.getmtime(lock_file)
                age_hours = (time.time() - mtime) / 3600
                
                if age_hours > 2:  # Lock älter als 2 Stunden
                    log(f"🗑️ Entferne stale Lock: {lock_file} ({age_hours:.1f}h alt)")
                    os.remove(lock_file)
                    stale_locks += 1
            except Exception as e:
                log(f"⚠️ Fehler bei Lock-Datei {lock_file}: {e}")
    
    log(f"✅ {stale_locks} stale Locks entfernt")
    
    # 3. Agent-spezifische Health Checks
    log("Führe Agent-Health-Checks aus...")
    
    # Prüfe ob InstaFollow läuft
    try:
        result = subprocess.run(
            ["pgrep", "-f", "smart-monitor-v4"],
            capture_output=True, timeout=5
        )
        if result.returncode != 0:
            log("⚠️ InstaFollow Monitor nicht aktiv")
        else:
            log("✅ InstaFollow läuft")
    except:
        pass
    
    # 4. Gateway-Restarts seit letztem Check
    restart_count = count_gateway_restarts_since(last_restart_check)
    if restart_count > 0:
        log(f"🚨 Gateway-Restarts erkannt: {restart_count}")
    else:
        log("✅ Keine neuen Gateway-Restarts")

    state["last_gateway_restart_check"] = now_ts

    # Speichere State
    save_state(state)

    summary = {
        "recovered_sessions": recovered,
        "stale_locks_removed": stale_locks,
        "gateway_restarts": restart_count,
    }
    log(f"SUMMARY_JSON: {json.dumps(summary, ensure_ascii=False)}")
    log("🏁 Watchdog beendet")

if __name__ == "__main__":
    main()