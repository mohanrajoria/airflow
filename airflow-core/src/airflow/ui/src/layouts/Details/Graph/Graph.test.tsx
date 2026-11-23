/*!
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { ReactFlow } from "@xyflow/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { useDagRunServiceGetDagRun, useStructureServiceStructureData } from "openapi/queries";

import { useGraphLayout } from "src/components/Graph/useGraphLayout";

import { useGridTiSummariesStream } from "src/queries/useGridTISummaries.ts";
import { Wrapper } from "src/utils/Wrapper";

import { Graph } from "./Graph";
import { GRAPH_FOCUS_TASK_LIMIT } from "./utils/focusGraph";

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    defaultNS: "components",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    lng: "en",
    ns: ["components"],
    resources: {
      en: {
        components: {
          graph: {
            focusedView: "Focused view: {{visible}} of {{total}} tasks",
            fullDag: "Full Dag: {{total}} tasks",
            showFocusedView: "Show focused view",
            showFullDag: "Show full Dag",
          },
        },
      },
    },
  });
});

// testsSetup.ts globally mocks Graph to null so full-page tests don't need to
// stub ELK layout data. Unmock it here so we test the real component.
vi.unmock("src/layouts/Details/Graph/Graph");

let mockParams: Record<string, string> = { dagId: "test_dag" };
let mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");

  return {
    ...actual,
    useParams: () => mockParams,
    useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  };
});

vi.mock("openapi/queries", () => ({
  useDagRunServiceGetDagRun: vi.fn(() => ({ data: undefined, isLoading: false })),
  useStructureServiceStructureData: vi.fn(() => ({ data: { edges: [], nodes: [] } })),
}));

vi.mock("src/queries/useDependencyGraph", () => ({
  useDependencyGraph: vi.fn(() => ({ data: { edges: [], nodes: [] } })),
}));

vi.mock("src/components/Graph/useGraphLayout", () => ({
  useGraphLayout: vi.fn(() => ({ data: { edges: [], nodes: [] } })),
}));

vi.mock("src/queries/useGridTISummaries.ts", () => ({
  useGridTiSummariesStream: vi.fn(() => ({ summariesByRunId: new Map() })),
}));

vi.mock("src/hooks/useSelectedVersion", () => ({
  default: vi.fn(() => 1),
}));

vi.mock("src/context/groups", () => ({
  useGroups: vi.fn(() => ({ allGroupIds: [], openGroupIds: [], setAllGroupIds: vi.fn() })),
}));

const mockFitView = vi.fn();

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual("@xyflow/react");

  return {
    ...actual,
    ReactFlow: vi.fn(() => null),
    useReactFlow: vi.fn(() => ({ fitView: mockFitView, getZoom: vi.fn() })),
  };
});

const mockDagRun = {
  bundle_version: null,
  conf: null,
  dag_display_name: "test_dag",
  dag_id: "test_dag",
  dag_versions: [],
  end_date: null,
  has_missed_deadline: false,
  logical_date: null,
  note: null,
  partition_key: null,
  queued_at: null,
  run_after: "2025-01-01T00:00:00Z",
  run_id: "run_1",
  run_type: "manual" as const,
  start_date: "2025-01-01T00:00:01Z",
  state: "running" as const,
  triggered_by: "ui" as const,
  triggering_user_name: null,
};

describe("Graph", () => {
  it("passes states to useGridTiSummariesStream when a runId is present", () => {
    mockParams = { dagId: "test_dag", runId: "run_1" };
    vi.mocked(useDagRunServiceGetDagRun).mockReturnValue({
      data: mockDagRun,
      isLoading: false,
    } as ReturnType<typeof useDagRunServiceGetDagRun>);

    render(<Graph />, { wrapper: Wrapper });

    expect(vi.mocked(useGridTiSummariesStream)).toHaveBeenCalledWith(
      expect.objectContaining({
        runIds: ["run_1"],
        states: ["running"],
      }),
    );
  });

  it("passes undefined states while dag run is still loading", () => {
    mockParams = { dagId: "test_dag", runId: "run_1" };
    vi.mocked(useDagRunServiceGetDagRun).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useDagRunServiceGetDagRun>);

    render(<Graph />, { wrapper: Wrapper });

    expect(vi.mocked(useGridTiSummariesStream)).toHaveBeenCalledWith(
      expect.objectContaining({
        runIds: ["run_1"],
        states: undefined,
      }),
    );
  });

  it("passes undefined states to useGridTiSummariesStream when there is no runId", () => {
    mockParams = { dagId: "test_dag" };
    vi.mocked(useDagRunServiceGetDagRun).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useDagRunServiceGetDagRun>);

    render(<Graph />, { wrapper: Wrapper });

    expect(vi.mocked(useGridTiSummariesStream)).toHaveBeenCalledWith(
      expect.objectContaining({
        runIds: [],
        states: undefined,
      }),
    );
  });

  it("does not show the Dag mode banner for a Dag at the task limit", () => {
    mockParams = { dagId: "test_dag" };
    mockSearchParams = new URLSearchParams();
    const nodes = Array.from({ length: GRAPH_FOCUS_TASK_LIMIT }, (_, index) => ({
      id: `t${index}`,
      label: `t${index}`,
      type: "task" as const,
    }));

    vi.mocked(useStructureServiceStructureData).mockReturnValue({
      data: { edges: [], nodes },
    } as ReturnType<typeof useStructureServiceStructureData>);

    render(<Graph />, { wrapper: Wrapper });

    expect(screen.queryByRole("button", { name: "Show full Dag" })).toBeNull();
    expect(vi.mocked(useGraphLayout).mock.lastCall?.[0].nodes).toHaveLength(GRAPH_FOCUS_TASK_LIMIT);
  });

  it("passes the whole Dag to layout unchanged for a small Dag", () => {
    mockSearchParams = new URLSearchParams();
    const nodes = [
      { id: "a", label: "a", type: "task" as const },
      { id: "b", label: "b", type: "task" as const },
    ];
    const edges = [{ source_id: "a", target_id: "b" }];

    vi.mocked(useStructureServiceStructureData).mockReturnValue({
      data: { edges, nodes },
    } as ReturnType<typeof useStructureServiceStructureData>);

    render(<Graph />, { wrapper: Wrapper });

    const lastCall = vi.mocked(useGraphLayout).mock.lastCall?.[0];

    expect(lastCall?.nodes).toBe(nodes);
    expect(lastCall?.edges).toEqual(edges);
  });

  it("focuses a large Dag on the task in the URL and shows the focused banner", () => {
    mockParams = { dagId: "test_dag", taskId: "t125" };
    mockSearchParams = new URLSearchParams();
    const nodes = Array.from({ length: 250 }, (_, index) => ({
      id: `t${index}`,
      label: `t${index}`,
      type: "task" as const,
    }));
    const edges = nodes.slice(1).map((node, index) => ({ source_id: `t${index}`, target_id: node.id }));

    vi.mocked(useStructureServiceStructureData).mockReturnValue({
      data: { edges, nodes },
    } as ReturnType<typeof useStructureServiceStructureData>);

    render(<Graph />, { wrapper: Wrapper });

    const laidOut = vi.mocked(useGraphLayout).mock.lastCall?.[0].nodes ?? [];

    expect(laidOut).toHaveLength(GRAPH_FOCUS_TASK_LIMIT);
    expect(laidOut.map((node) => node.id)).toContain("t125");
    expect(screen.getByText("Focused view: 200 of 250 tasks")).toBeDefined();
  });

  it("passes every task for a large Dag in full Dag mode and shows the full banner", () => {
    mockParams = { dagId: "test_dag", taskId: "t125" };
    mockSearchParams = new URLSearchParams({ "graph-full_dag": "true" });
    const nodes = Array.from({ length: 250 }, (_, index) => ({
      id: `t${index}`,
      label: `t${index}`,
      type: "task" as const,
    }));

    vi.mocked(useStructureServiceStructureData).mockReturnValue({
      data: { edges: [], nodes },
    } as ReturnType<typeof useStructureServiceStructureData>);

    render(<Graph />, { wrapper: Wrapper });

    expect(vi.mocked(useGraphLayout).mock.lastCall?.[0].nodes).toHaveLength(250);
    expect(screen.getByText("Full Dag: 250 tasks")).toBeDefined();
  });

  it("switches to full Dag mode from the banner while keeping other search params", () => {
    mockParams = { dagId: "test_dag" };
    mockSearchParams = new URLSearchParams({ depth: "2" });
    const nodes = Array.from({ length: 250 }, (_, index) => ({
      id: `t${index}`,
      label: `t${index}`,
      type: "task" as const,
    }));

    vi.mocked(useStructureServiceStructureData).mockReturnValue({
      data: { edges: [], nodes },
    } as ReturnType<typeof useStructureServiceStructureData>);

    render(<Graph />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Show full Dag" }));

    const next = mockSetSearchParams.mock.lastCall?.[0] as URLSearchParams;

    expect(next.get("graph-full_dag")).toBe("true");
    expect(next.get("depth")).toBe("2");
  });

  it("removes the full Dag search param when switching back to the focused view", () => {
    mockParams = { dagId: "test_dag" };
    mockSearchParams = new URLSearchParams({ "graph-full_dag": "true" });
    const nodes = Array.from({ length: 250 }, (_, index) => ({
      id: `t${index}`,
      label: `t${index}`,
      type: "task" as const,
    }));

    vi.mocked(useStructureServiceStructureData).mockReturnValue({
      data: { edges: [], nodes },
    } as ReturnType<typeof useStructureServiceStructureData>);

    render(<Graph />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Show focused view" }));

    const next = mockSetSearchParams.mock.lastCall?.[0] as URLSearchParams;

    expect(next.has("graph-full_dag")).toBe(false);
  });

  it("attaches each node's task instance from the selected run's summaries", () => {
    mockParams = { dagId: "test_dag", runId: "run_1" };
    mockSearchParams = new URLSearchParams();
    vi.mocked(useDagRunServiceGetDagRun).mockReturnValue({
      data: mockDagRun,
      isLoading: false,
    } as ReturnType<typeof useDagRunServiceGetDagRun>);
    vi.mocked(useGraphLayout).mockReturnValue({
      data: {
        edges: [],
        nodes: ["a", "b", "c"].map((id) => ({
          data: { id, label: id, type: "task" },
          id,
          position: { x: 0, y: 0 },
          type: "task",
        })),
      },
      isPending: false,
    } as unknown as ReturnType<typeof useGraphLayout>);
    const tiA = { state: "success", task_id: "a" };
    const tiB = { state: "failed", task_id: "b" };

    vi.mocked(useGridTiSummariesStream).mockReturnValue({
      summariesByRunId: new Map([["run_1", { dag_run_id: "run_1", task_instances: [tiB, tiA] }]]),
    } as unknown as ReturnType<typeof useGridTiSummariesStream>);

    render(<Graph />, { wrapper: Wrapper });

    const renderedNodes = vi.mocked(ReactFlow).mock.lastCall?.[0].nodes ?? [];
    const byId = new Map(renderedNodes.map((node) => [node.id, node.data.taskInstance]));

    expect(byId.get("a")).toBe(tiA);
    expect(byId.get("b")).toBe(tiB);
    expect(byId.get("c")).toBeUndefined();
  });
});
