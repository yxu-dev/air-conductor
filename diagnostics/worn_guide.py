"""Host cue schedule; cue times are instructions, not observed motion labels."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Cue:
    offset_s: float
    phase: str
    index: int = 0
    frequency: int = 0
    instruction: str = ""


def cue_plan(validation: bool = False, focus60: bool = False, direction_check: bool = False) -> list[Cue]:
    if direction_check:
        cues = [Cue(0, 'rest', instruction='Keep still for six seconds.'),
                Cue(6, 'prepare_isolated', instruction='Raise your hand. Low tone: move down and hold. High tone: lift back up and hold. Only move at the tones.')]
        for index in range(1, 4):
            at = 14 + (index - 1) * 4
            cues.extend([Cue(at, 'down', index, 700), Cue(at + 2, 'return', index, 1400)])
        cues.extend([Cue(26, 'final_rest', instruction='Stop moving. Keep still for eight seconds.'),
                     Cue(34, 'done', instruction='Direction check complete. Thank you.')])
        return cues
    cues = [Cue(0, "rest", instruction="Keep still for eight seconds.")]
    at = 8.0
    if not focus60:
        cues.append(Cue(at, "prepare_isolated", instruction="Low tone: down. High tone: return. Wait between movements."))
        at += 8
        for index in range(1, 11 if validation else 7):
            cues.append(Cue(at, "down", index, 700))
            cues.append(Cue(at + (2 if validation else 1.5), "return", index, 1400))
            at += 4 if validation else 3
    for bpm, count in (((60, 12),) if focus60 else ((60, 12), (90, 18), (120, 24))):
        cues.append(Cue(at, f"prepare_{bpm}", instruction=f"Rest. Then one down stroke per tone, at {bpm} beats per minute. Return between tones."))
        at += 8
        for index in range(1, count + 1):
            cues.append(Cue(at, f"tempo_{bpm}", index, 900))
            at += 60 / bpm
    cues.append(Cue(at, "final_rest", instruction="Stop moving. Keep still for eight seconds."))
    cues.append(Cue(at + 8, "done", instruction="Recording complete. Thank you."))
    return cues


class Guide:
    def __init__(self, validation: bool = False, focus60: bool = False, direction_check: bool = False):
        self.plan = cue_plan(validation, focus60, direction_check)
        self.started = None
        self.next_cue = 0
        self.phase = "calibration"
        self.index = 0
        self.done = False
        self.timing_missed = False
        self.events = []

    def start(self, now: float) -> None:
        self.started = now

    def poll(self, now: float) -> list[dict]:
        due = []
        if self.started is None:
            return due
        elapsed = now - self.started
        while self.next_cue < len(self.plan) and self.plan[self.next_cue].offset_s <= elapsed:
            cue = self.plan[self.next_cue]
            late = elapsed - cue.offset_s
            if late > 0.15:
                # Never present late catch-up tones as correctly timed beats.
                self.timing_missed = True
            self.phase, self.index = cue.phase, cue.index
            event = {"scheduled_s": cue.offset_s, "actual_s": elapsed,
                     "lateness_s": late, "phase": cue.phase, "index": cue.index,
                     "frequency": cue.frequency, "instruction": cue.instruction,
                     "skipped": late > 0.15}
            due.append(event)
            self.events.append(event)
            self.next_cue += 1
        self.done = self.phase == "done"
        return due


class AudioCues:
    """Windows local tones and queued English speech; no network dependency."""

    def __init__(self):
        import subprocess
        import winsound
        self.winsound = winsound
        self.speaker = subprocess.Popen(
            ["powershell.exe", "-NoProfile", "-Command",
             "Add-Type -AssemblyName System.Speech; "
             "$taskSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
             "$taskEnglishVoice = $taskSpeaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'en-US' } | Select-Object -First 1; "
             "if ($null -ne $taskEnglishVoice) { $taskSpeaker.SelectVoice($taskEnglishVoice.VoiceInfo.Name) }; "
             "$taskSpeaker.Rate = 1; "
             "while ($null -ne ($taskPhrase = [Console]::ReadLine())) { $taskSpeaker.Speak($taskPhrase) }"],
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            text=True, creationflags=subprocess.CREATE_NO_WINDOW,
        )

    def speak(self, phrase: str) -> None:
        if self.speaker.poll() is not None:
            raise RuntimeError("Local speech process is unavailable")
        self.speaker.stdin.write(phrase + "\n")
        self.speaker.stdin.flush()

    def play(self, event: dict) -> None:
        if event["instruction"]:
            self.speak(event["instruction"])
        if event["frequency"] and not event["skipped"]:
            self.winsound.Beep(event["frequency"], 60)

    def close(self) -> None:
        import subprocess
        self.speaker.stdin.close()
        try:
            self.speaker.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.speaker.terminate()
            self.speaker.wait(timeout=2)
