/**
 * Agentic Loop Schematic — static blueprint of the development loop.
 * SPEC → CONTEXT → AGENT → VERIFY → REVIEW → COMMIT, with the failure
 * path wired back from VERIFY to AGENT and a human gate before COMMIT.
 * Pure SVG, no client JS — nothing animates, so reduced-motion is moot.
 */

const NODES = ['SPEC', 'CONTEXT', 'AGENT', 'VERIFY', 'REVIEW', 'COMMIT'] as const;

// Node x-centers on the 960-wide canvas
const CX = [85, 243, 401, 559, 717, 875];
const NODE_W = 110;
const NODE_Y = 100;
const NODE_H = 40;

function Node({ cx, label }: { cx: number; label: string }) {
  return (
    <g>
      <rect
        x={cx - NODE_W / 2}
        y={NODE_Y}
        width={NODE_W}
        height={NODE_H}
        rx={6}
        fill="var(--bg-raised)"
        stroke="var(--border-2)"
      />
      <text
        x={cx}
        y={NODE_Y + NODE_H / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--fg-muted)"
        style={{ font: '500 11px var(--font-jetbrains)', letterSpacing: '0.06em' }}
      >
        {label}
      </text>
    </g>
  );
}

export function AgenticLoopSchematic({ label }: { label: string }) {
  const annotation = {
    font: '400 9px var(--font-jetbrains)',
    letterSpacing: '0.12em',
  } as const;

  return (
    <svg viewBox="0 0 960 200" role="img" aria-label={label} className="h-auto w-full">
      {/* Main wire (nodes are drawn on top) and the VERIFY → AGENT failure loop */}
      <path
        d={`M${CX[0]} 120 H${CX[5]} M${CX[3]} ${NODE_Y} V56 H${CX[2]} V${NODE_Y}`}
        fill="none"
        stroke="var(--border-3)"
        strokeWidth="1"
      />

      {/* Human gate marks on the wire before COMMIT */}
      <path d="M792 112 V128 M800 112 V128" stroke="var(--accent)" strokeWidth="1.5" />

      {/* Failure-loop annotation */}
      <text x={(CX[2] + CX[3]) / 2} y={48} textAnchor="middle" fill="var(--fg-faint)" style={annotation}>
        FAIL / RETRY
      </text>

      {/* Node annotations */}
      <text x={CX[1]} y={170} textAnchor="middle" fill="var(--fg-faint)" style={annotation}>
        AGENTS.MD · MEMORY
      </text>
      <text x={CX[3]} y={170} textAnchor="middle" fill="var(--fg-faint)" style={annotation}>
        TESTS · E2E · A11Y · PERF
      </text>
      <text x={CX[4]} y={170} textAnchor="middle" fill="var(--accent)" style={annotation}>
        HUMAN GATE
      </text>

      {NODES.map((n, i) => (
        <Node key={n} cx={CX[i]} label={n} />
      ))}
    </svg>
  );
}
