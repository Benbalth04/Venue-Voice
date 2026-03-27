"use client"

import { EdgeLabelRenderer, type EdgeProps } from "@xyflow/react"

export function ReadOnlyOrthoEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  label,
}: EdgeProps) {
  const midX = (sourceX + targetX) / 2
  const edgePath = `M ${sourceX} ${sourceY} H ${midX} V ${targetY} H ${targetX}`
  const labelX = midX
  const labelY = (sourceY + targetY) / 2

  return (
    <>
      <g style={{ pointerEvents: "none" }}>
        <path
          id={id}
          className="react-flow__edge-path"
          d={edgePath}
          fill="none"
          stroke="#a1a1aa"
          strokeWidth={2}
          markerEnd={markerEnd}
        />
      </g>
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              zIndex: 20,
            }}
            className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-500 shadow-sm"
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
