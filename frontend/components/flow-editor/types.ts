import type {
  FlowActionType,
  FlowBranchType,
  FlowNodePayload,
  FlowResponse,
} from "@/lib/api/client"

export type DraftNode = Omit<FlowNodePayload, "id"> & { id: string }

export type FlowDraft = {
  id?: string
  survey_id: string
  name: string
  description: string
  is_active: boolean
  location_survey_ids: string[]
  nodes: DraftNode[]
}

export type RuleSummary = {
  id: string
  name: string
  description: string | null
}

export type BranchRuleCondition = { rule_id: string; expected: boolean }

export type EdgeInsertData = {
  onInsert?: (kind: "rule" | "branch" | "action" | "terminate") => void
  insertOptions?: ReadonlyArray<"rule" | "branch" | "action" | "terminate">
}

export type CanvasNodeKind = "trigger" | "rule" | "branch" | "action" | "terminate"

export type CanvasNodeData = {
  kind: CanvasNodeKind
  label: string
  title: string
  subtitle?: string
  selected: boolean
  /** Transient validation highlight (red border); cleared after timeout or when user selects this node. */
  errorHighlight?: boolean
  onSelect: () => void
  onDelete?: () => void
}

export type AddNodeData = {
  onAdd: (kind: "rule" | "branch" | "action" | "terminate") => void
  chainAfterAction?: boolean
}

export type Slot =
  | { kind: "node"; node: DraftNode }
  | { kind: "add"; parentId: string | null; branchType: FlowBranchType | null }

export type { FlowResponse }
