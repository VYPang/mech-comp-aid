import unittest

import numpy as np

from pinn_playground.backend.payload_serialization import serialize_displacement_grid
from pinn_playground.backend.problem_definition import StructuralProblemConfig
from pinn_playground.backend.training import (
    _fem_displacement_grid_from_result,
    _physical_displacement_scale,
    _teacher_displacement_scale,
)


class DisplacementGridPayloadTest(unittest.TestCase):
    def test_serializes_masked_displacement_grid_with_visual_scale(self):
        x = np.array([[0.0, 1.0], [0.0, 1.0]], dtype=np.float32)
        y = np.array([[0.0, 0.0], [1.0, 1.0]], dtype=np.float32)
        u = np.array([[0.0, 0.01], [0.02, 0.03]], dtype=np.float32)
        v = np.array([[0.0, -0.01], [0.02, np.nan]], dtype=np.float32)

        payload = serialize_displacement_grid(x, y, u, v)

        self.assertEqual(payload["x"], [0.0, 1.0])
        self.assertEqual(payload["y"], [0.0, 1.0])
        self.assertIsNone(payload["u"][1][1])
        self.assertIsNone(payload["v"][1][1])
        self.assertAlmostEqual(payload["magnitude"][1][0], np.sqrt(0.0008), places=6)
        self.assertAlmostEqual(payload["scale"], 0.12 / np.sqrt(0.0008), places=6)

    def test_zero_displacement_grid_keeps_unit_visual_scale(self):
        x = np.array([[0.0, 1.0], [0.0, 1.0]], dtype=np.float32)
        y = np.array([[0.0, 0.0], [1.0, 1.0]], dtype=np.float32)
        u = np.zeros((2, 2), dtype=np.float32)
        v = np.zeros((2, 2), dtype=np.float32)

        payload = serialize_displacement_grid(x, y, u, v)

        self.assertEqual(payload["scale"], 1.0)

    def test_physical_displacement_scale_inverts_training_scale(self):
        problem = StructuralProblemConfig()

        teacher_scale = _teacher_displacement_scale(problem)
        physical_scale = _physical_displacement_scale(problem)

        self.assertAlmostEqual(teacher_scale, 210e9, places=3)
        self.assertAlmostEqual(physical_scale, 1.0 / 210e9, places=18)
        self.assertAlmostEqual(teacher_scale * physical_scale, 1.0, places=12)

    def test_fem_displacement_grid_removes_visual_mesh_scale(self):
        result = {
            "deformed_mesh": {
                "scale": 10.0,
                "points": {
                    "x": [0.0, 1.0, 0.0, 1.0],
                    "y": [0.0, 0.0, 1.0, 1.0],
                },
                "deformed_points": {
                    "x": [0.0, 1.2, 0.0, 1.2],
                    "y": [0.0, -0.3, 1.0, 0.7],
                },
            },
        }

        payload = _fem_displacement_grid_from_result(result, StructuralProblemConfig(), grid_n=2)

        self.assertAlmostEqual(payload["u"][0][1], 0.02, places=6)
        self.assertAlmostEqual(payload["v"][0][1], -0.03, places=6)
        self.assertAlmostEqual(payload["magnitude"][0][1], np.sqrt(0.0013), places=6)


if __name__ == "__main__":
    unittest.main()
