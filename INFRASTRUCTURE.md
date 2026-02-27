# INFRASTRUCTURE.md - VPS Details

## VPS Information
- **Host:** srv828445
- **OS:** Linux 5.15.0-164-generic (x64)
- **Disk Space:** Keep > 5GB free. (Current ~26GB free)
- **Location:** Germany (Berlin timezone for scripts)

## Core Tools & Services
- **Xvfb:** Active on `:99`. Essential for Playwright/Headless Shell.
- **Whisper:** Local OpenAI Whisper CLI installed for audio transcription.
- **Git:** Primary sync tool. Be careful with lock files.
- **Snap/Docker:** Installed but use with caution.

## Safety Directives
- **NEVER delete files** without express permission from Mert.
- **Absolute Paths Only** for scripts and commands.
- Use `trash` or move to a temp folder instead of `rm` if possible.
