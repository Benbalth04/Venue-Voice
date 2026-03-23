import { AddStepFlowCanvasNode } from "./canvas/add-step-node"
import { FlowCanvasNodeView } from "./canvas/flow-canvas-node-view"
import { OrthoFlowEdge } from "./canvas/ortho-edge"

const step = FlowCanvasNodeView

export const FLOW_EDITOR_NODE_TYPES = {
  trigger: step,
  rule: step,
  branch: step,
  action: step,
  terminate: step,
  add: AddStepFlowCanvasNode,
} as const

export const FLOW_EDITOR_EDGE_TYPES = {
  ortho: OrthoFlowEdge,
} as const
