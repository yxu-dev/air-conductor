import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("read_serial", Path(__file__).resolve().parents[1] / "read_serial.py")
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class ProtocolTests(unittest.TestCase):
    def test_beat_timestamp_and_normalized_intensity(self):
        self.assertEqual(capture.parse_beat("BEAT,4294967295,0.75"), (2**32 - 1, .75))
        for line in ("BEAT,1,nan", "BEAT,1,1.01", "BEAT,1,-0.1", "BEAT,-1,0.5",
                     "BEAT,4294967296,0.5", "BEAT,1,0.5,extra"):
            with self.subTest(line=line), self.assertRaises(ValueError):
                capture.parse_beat(line)

    def test_fragmented_and_corrupt_frames_resynchronize(self):
        frames = capture.LineBuffer(limit=40)
        self.assertEqual(frames.feed(b"REA"), [])
        self.assertEqual(frames.feed(b"DY\r\n\xff\n"), ["READY"])
        self.assertEqual(frames.feed(b"x" * 50 + b"\nSTATUS,READY\n"), ["STATUS,READY"])
        self.assertEqual(frames.invalid, 2)

    def test_imu_rejects_nonfinite_and_malformed_samples(self):
        self.assertEqual(capture.parse_imu("IMU,10,0,0,9.81,0,0,0")[0], 10)
        for line in ("IMU,10,0,0,nan,0,0,0", "IMU,-1,0,0,9.81,0,0,0",
                     "IMU,4294967296,0,0,9.81,0,0,0", "IMU,10,0,0,9.81",
                     "IMU,10.5,0,0,9.81,0,0,0"):
            with self.subTest(line=line), self.assertRaises(ValueError):
                capture.parse_imu(line)

    def test_clock_wrap_is_distinct_from_device_restart(self):
        stats = capture.CaptureStats()
        values = (0, 0, 9.81, 0, 0, 0)
        for timestamp in (2**32 - 5, 5, 15, 1, 11):
            stats.add(timestamp, values)
        self.assertEqual(stats.summary()["device_timestamp_resets"], 1)
        self.assertEqual(stats.summary()["device_rate_hz"], 100)

    def test_statistics_flag_sampling_gaps(self):
        stats = capture.CaptureStats()
        for timestamp, ax in ((100, 0), (110, 1), (150, 2)):
            stats.add(timestamp, (ax, 0, 9.81, 0, 0, 0))
        result = stats.summary()
        self.assertEqual(result["intervals_over_30ms"], 1)
        self.assertEqual(result["axes"]["ax"]["mean"], 1)
        self.assertEqual(result["axes"]["ax"]["std"], 1)


if __name__ == "__main__":
    unittest.main()
