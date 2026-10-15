"""Local sound cues for browser checks; never opens or reads a serial port."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time

from worn_guide import AudioCues, Cue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bpm', type=int, nargs='+', default=[60, 90, 120])
    parser.add_argument('--count', type=int, default=12)
    args = parser.parse_args()
    if not 3 <= args.count <= 60 or any(not 50 <= bpm <= 180 for bpm in args.bpm):
        parser.error('Use 50–180 BPM and 3–60 strokes per block.')
    plan = [Cue(0, 'initial_rest', instruction='Keep still. The browser should already be detecting.')]
    at = 6.0
    for bpm in args.bpm:
        plan.append(Cue(at, f'prepare_{bpm}', instruction=f'{bpm} beats per minute. One down stroke per tone. Return between tones.'))
        at += 8
        for index in range(1, args.count + 1):
            plan.append(Cue(at, f'tempo_{bpm}', index, 900))
            at += 60 / bpm
        plan.append(Cue(at, f'rest_{bpm}', instruction='Stop moving. Check the browser tempo, then wait.'))
        at += 6
    plan.append(Cue(at, 'done', instruction='Test complete. Stop detection and export the beat record.'))
    output_dir = Path(__file__).resolve().parents[1] / 'recordings'
    output_dir.mkdir(exist_ok=True)
    output = output_dir / f'browser-cues-{datetime.now():%Y%m%d-%H%M%S-%f}.json'
    events = []
    audio = AudioCues()
    started = time.monotonic()
    interrupted = False
    try:
        for cue in plan:
            deadline = started + cue.offset_s
            while time.monotonic() < deadline:
                time.sleep(min(.01, max(0, deadline - time.monotonic())))
            elapsed = time.monotonic() - started
            event = dict(scheduled_s=cue.offset_s, actual_s=elapsed,
                         utc=datetime.now(timezone.utc).isoformat(), phase=cue.phase,
                         index=cue.index, instruction=cue.instruction,
                         frequency=cue.frequency, skipped=elapsed - cue.offset_s > .15)
            events.append(event)
            audio.play(event)
            if cue.instruction:
                print(f'{cue.phase}: {cue.instruction}', flush=True)
    except KeyboardInterrupt:
        interrupted = True
    finally:
        audio.close()
        output.write_text(json.dumps(dict(events=events, interrupted=interrupted,
                                         note='Cue times are instructions, not observed hand motion.'),
                                     ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'Cue log: {output}', flush=True)


if __name__ == '__main__':
    main()
