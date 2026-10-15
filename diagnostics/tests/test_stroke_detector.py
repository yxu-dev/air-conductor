from pathlib import Path
import shutil
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from native_runner import compiled_detector, run_detector


@unittest.skipUnless(shutil.which("g++"), "native tests require g++")
class StrokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.build = compiled_detector()
        cls.executable = cls.build.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.build.__exit__(None, None, None)

    def replay(self, samples):
        return run_detector(self.executable, samples)

    @staticmethod
    def stroke(start, score=8):
        return [(start, score, 1), (start + 10, score * 2, 3),
                *[(start + offset, score, 2) for offset in range(20, 100, 10)],
                (start + 100, .1, 0), (start + 110, .1, 0)]

    def test_stillness_and_negative_return_never_emit(self):
        self.assertEqual(self.replay([(t, .1, .02) for t in range(0, 300, 10)] +
                                    [(t, 20, -3) for t in range(300, 600, 10)]), [])

    def test_one_stroke_has_peak_timestamp_and_bounded_intensity(self):
        beats = self.replay([(0, .1, 0)] + self.stroke(10, 20) +
                            [(t, 20, -3) for t in range(130, 400, 10)])
        self.assertEqual(len(beats), 1)
        self.assertEqual(beats[0]["timestamp_ms"], 20)
        self.assertEqual(beats[0]["intensity"], 1)
        self.assertEqual(beats[0]["release_delay_ms"], 90)

    def test_short_spike_and_stuck_motion_are_rejected(self):
        samples = [(0, .1, 0), (10, 8, 2), (20, .1, 0)]
        samples += [(t, 8, 2) for t in range(30, 710, 10)]
        samples += [(710, .1, 0), (720, .1, 0)] + self.stroke(730)
        beats = self.replay(samples)
        self.assertEqual([b["timestamp_ms"] for b in beats], [740])

    def test_low_energy_positive_rebound_is_rejected(self):
        samples = [(0, .1, 0), (10, 2, 1), (20, 3.5, 1.5),
                   *[(t, 3, 1) for t in range(30, 100, 10)], (100, .1, 0)]
        self.assertEqual(self.replay(samples), [])

    def test_short_strong_rebound_does_not_block_next_downstroke(self):
        samples = [(0, .1, 0)] + self.stroke(10)
        samples += [(t, .1, 0) for t in range(130, 670, 10)]
        samples += [(670, 8, 1), (680, 12, 1.2), (690, 9, 1),
                    (700, 8, 1), (710, 8, 1), (720, .1, 0)]
        samples += [(t, .1, 0) for t in range(730, 940, 10)] + self.stroke(940)
        self.assertEqual([b["timestamp_ms"] for b in self.replay(samples)], [20, 950])

    def test_refractory_gap_blocks_rebound_but_allows_next_beat(self):
        samples = [(0, .1, 0)] + self.stroke(10)
        samples += [(t, .1, 0) for t in range(130, 150, 10)] + self.stroke(150)
        samples += [(t, .1, 0) for t in range(270, 350, 10)] + self.stroke(350)
        self.assertEqual([b["timestamp_ms"] for b in self.replay(samples)], [20, 360])

    def test_gap_restart_and_nonfinite_input_discard_partial_strokes(self):
        for interrupted in ((500, 8, 2), (1, 8, 2), (30, float("nan"), 2)):
            samples = [(0, .1, 0), (10, 8, 1), (20, 8, 3), interrupted]
            at = interrupted[0]
            samples += [(at + 10, .1, 0), (at + 20, .1, 0)] + self.stroke(at + 30)
            with self.subTest(interrupted=interrupted):
                self.assertEqual(len(self.replay(samples)), 1)

    def test_millisecond_wrap_and_explicit_reset(self):
        samples = [(2**32 - 30, .1, 0)]
        samples += [((t % 2**32), score, gyro) for t, score, gyro in self.stroke(2**32 - 20)]
        samples += [None, (100, .1, 0)] + self.stroke(110)
        self.assertEqual([b["timestamp_ms"] for b in self.replay(samples)], [2**32 - 10, 120])


if __name__ == "__main__":
    unittest.main()
