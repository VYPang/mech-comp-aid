import { analyticalFigureConfig, createAnalyticalFigure } from "./figure-2-analytical.js?v=checkpoint-shell-15";
import { boundaryFigureConfig, createBoundaryFigure } from "./figure-6-boundary.js?v=checkpoint-shell-15";
import { createEulerFigure, eulerFigureConfig } from "./figure-4-euler.js?v=checkpoint-shell-15";
import { createMechanicsFigure, mechanicsFigureConfig } from "./figure-1-mechanics.js?v=checkpoint-shell-15";
import { createMeshFigure, meshFigureConfig } from "./figure-7-mesh.js?v=checkpoint-shell-15";
import { createResidualFigure, residualFigureConfig } from "./figure-5-residual.js?v=checkpoint-shell-15";
import { createTaylorFigure, taylorFigureConfig } from "./figure-3-taylor.js?v=checkpoint-shell-15";
import { createWeakFormFigure, weakFormFigureConfig } from "./figure-8-weak-form.js?v=checkpoint-shell-15";

export const NUMERICAL_FIGURES = {
  mechanics: {
    config: mechanicsFigureConfig,
    factory: createMechanicsFigure,
  },
  analytical: {
    config: analyticalFigureConfig,
    factory: createAnalyticalFigure,
  },
  taylor: {
    config: taylorFigureConfig,
    factory: createTaylorFigure,
  },
  euler: {
    config: eulerFigureConfig,
    factory: createEulerFigure,
  },
  residual: {
    config: residualFigureConfig,
    factory: createResidualFigure,
  },
  boundary: {
    config: boundaryFigureConfig,
    factory: createBoundaryFigure,
  },
  mesh: {
    config: meshFigureConfig,
    factory: createMeshFigure,
  },
  weakForm: {
    config: weakFormFigureConfig,
    factory: createWeakFormFigure,
  },
};