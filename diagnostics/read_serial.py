"""Serial diagnostic entry point; hardware reading is not implemented yet."""

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="Confirmed Arduino port, e.g. COM3")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--output", type=Path, help=f"Optional log under {ROOT / 'recordings'}")
    parser.parse_args()
    parser.exit(2, "Serial capture is not implemented yet.\n")


if __name__ == "__main__":
    raise SystemExit(main())
