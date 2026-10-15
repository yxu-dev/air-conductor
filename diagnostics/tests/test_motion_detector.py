from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


@unittest.skipUnless(shutil.which('g++'), 'native tests require g++')
class MotionTests(unittest.TestCase):
    def test_firmware_motion_state_machine(self):
        root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(prefix='air-conductor-motion-') as directory:
            executable = Path(directory) / 'motion_checks.exe'
            subprocess.run([shutil.which('g++'), '-std=c++11', '-Wall', '-Wextra', '-Werror', '-pedantic',
                            '-I', str(root / 'arduino' / 'AirConductor'),
                            str(root / 'diagnostics' / 'native' / 'motion_checks.cpp'),
                            '-o', str(executable)], check=True, capture_output=True, text=True, timeout=60)
            subprocess.run([str(executable)], check=True, capture_output=True, text=True, timeout=10)
