import importlib.util
from pathlib import Path
import sys
import unittest

spec = importlib.util.spec_from_file_location("worn_guide", Path(__file__).resolve().parents[1] / "worn_guide.py")
guide_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = guide_module
spec.loader.exec_module(guide_module)


class GuideTests(unittest.TestCase):
    def test_direction_check_is_short_and_separates_three_pairs(self):
        plan = guide_module.cue_plan(direction_check=True)
        down = [c for c in plan if c.phase == 'down']
        back = [c for c in plan if c.phase == 'return']
        self.assertEqual([c.index for c in down], [1, 2, 3])
        self.assertEqual([c.index for c in back], [1, 2, 3])
        self.assertTrue(all(b.offset_s - a.offset_s == 2 for a, b in zip(down, back)))
        self.assertFalse(any(c.phase.startswith('tempo_') for c in plan))
        self.assertEqual(plan[-1].offset_s, 34)

    def test_independent_validation_has_ten_spaced_direction_pairs(self):
        plan = guide_module.cue_plan(validation=True)
        down = [c for c in plan if c.phase == "down"]
        back = [c for c in plan if c.phase == "return"]
        self.assertEqual(len(down), len(back))
        self.assertEqual(len(down), 10)
        self.assertTrue(all(b.offset_s - a.offset_s == 2 for a, b in zip(down, back)))
        self.assertLess(plan[-1].offset_s + 15, 155)

    def test_plan_separates_directions_and_preserves_beat_intervals(self):
        plan = guide_module.cue_plan()
        self.assertEqual(sum(c.phase == "down" for c in plan), 6)
        self.assertEqual(sum(c.phase == "return" for c in plan), 6)
        for bpm, count in ((60, 12), (90, 18), (120, 24)):
            cues = [c for c in plan if c.phase == f"tempo_{bpm}"]
            self.assertEqual(len(cues), count)
            for first, second in zip(cues, cues[1:]):
                self.assertAlmostEqual(second.offset_s - first.offset_s, 60 / bpm)
        self.assertEqual(plan[-1].phase, "done")
        self.assertLess(plan[-1].offset_s + 15, 130)

    def test_stalled_host_marks_and_skips_late_cues(self):
        guide = guide_module.Guide()
        self.assertEqual(guide.poll(10), [])
        guide.start(100)
        self.assertEqual(guide.poll(100)[0]["phase"], "rest")
        events = guide.poll(120)
        self.assertTrue(guide.timing_missed)
        self.assertTrue(any(e["frequency"] and e["skipped"] for e in events))
        self.assertEqual(guide.poll(120), [])


if __name__ == "__main__":
    unittest.main()
