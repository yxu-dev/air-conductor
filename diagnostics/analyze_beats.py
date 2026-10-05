"""Beat-recording analysis entry point; metrics are not implemented yet."""

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path, help="Recording to analyze")
    parser.add_argument("--target-bpm", type=float, help="Reference metronome tempo")
    parser.parse_args()
    parser.exit(2, "Beat analysis is not implemented yet.\n")


if __name__ == "__main__":
    raise SystemExit(main())
