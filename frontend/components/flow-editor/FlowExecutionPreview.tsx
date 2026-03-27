"use client"

import "@xyflow/react/dist/style.css"

import { useMemo } from "react"
import { Background, Controls, ReactFlow } from "@xyflow/react"
import { CheckCircle2, Clock, MapPin, QrCode, X, XCircle } from "lucide-react"
import type { FlowResponse, FlowRunResponse } from "@/lib/api/client"
import { draftFromFlow } from "./draftUtils"
import { buildReadOnlyCanvas, type RuleInfo, type TraceNode } from "./buildReadOnlyCanvas"
import { ReadOnlyFlowCanvasNode } from "./canvas/read-only-node"
import { ReadOnlyOrthoEdge } from "./canvas/read-only-ortho-edge"

const NODE_TYPES = {
  trigger: ReadOnlyFlowCanvasNode,
  rule: ReadOnlyFlowCanvasNode,
  branch: ReadOnlyFlowCanvasNode,
  action: ReadOnlyFlowCanvasNode,
  terminate: ReadOnlyFlowCanvasNode,
}

const EDGE_TYPES = {
  "ortho-readonly": ReadOnlyOrthoEdge,
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function FlowExecutionPreview({
  run,
  flow,
  rulesById,
  onClose,
}: {
  run: FlowRunResponse
  flow: FlowResponse
  rulesById: Map<string, RuleInfo>
  onClose: () => void
}) {
  const draft = useMemo(() => draftFromFlow(flow), [flow])

  const { executedNodeIds, traceByNodeId } = useMemo(() => {
    const rawNodes = (run.execution_trace as { nodes?: unknown[] } | null)?.nodes
    const executed = new Set<string>()
    const traceMap = new Map<string, TraceNode>()

    if (Array.isArray(rawNodes)) {
      for (const raw of rawNodes) {
        if (!raw || typeof raw !== "object") continue
        const n = raw as Record<string, unknown>
        if (typeof n.id !== "string") continue
        executed.add(n.id)
        traceMap.set(n.id, n as unknown as TraceNode)
      }
    }
    return { executedNodeIds: executed, traceByNodeId: traceMap }
  }, [run.execution_trace])

  const { nodes, edges } = useMemo(
    () => buildReadOnlyCanvas(draft, executedNodeIds, rulesById, traceByNodeId),
    [draft, executedNodeIds, rulesById, traceByNodeId],
  )

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[88vh] w-[92vw] max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {run.success ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="h-5 w-5 shrink-0 text-red-500" />
              )}
              <h2 className="truncate text-lg font-semibold text-zinc-950">{run.flow_name}</h2>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDateTime(run.created_at)}
                {run.runtime_ms != null ? ` · ${run.runtime_ms} ms` : ""}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {run.survey_name}
                {run.location_name ? ` · ${run.location_name}` : ""}
              </span>
              {run.qr_code_title ? (
                <span className="flex items-center gap-1">
                  <QrCode className="h-3.5 w-3.5" />
                  {run.qr_code_title}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            {/* Legend */}
            <div className="hidden items-center gap-4 text-xs text-zinc-500 sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 rounded border-2 border-emerald-500 bg-white" />
                Executed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 rounded border border-zinc-300 bg-white opacity-40" />
                Skipped
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden bg-zinc-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
          >
            <Background color="#e4e4e7" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}
