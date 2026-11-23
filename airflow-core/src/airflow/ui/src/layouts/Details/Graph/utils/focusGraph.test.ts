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
import { describe, expect, it } from "vitest";

import type { EdgeResponse, NodeResponse } from "openapi/requests/types.gen";

import { countTasks, getDefaultFocusId, getFocusedGraph } from "./focusGraph";

const task = (id: string): NodeResponse => ({ id, label: id, type: "task" });
const join = (id: string): NodeResponse => ({ id, label: id, type: "join" });
const group = (id: string, children: Array<NodeResponse>): NodeResponse => ({
  children,
  id,
  label: id,
  type: "task",
});
const edge = (source: string, target: string): EdgeResponse => ({ source_id: source, target_id: target });

const chain = (count: number): { edges: Array<EdgeResponse>; nodes: Array<NodeResponse> } => {
  const ids = Array.from({ length: count }, (_, index) => `t${index}`);

  return {
    edges: ids.slice(1).map((id, index) => edge(ids[index] as string, id)),
    nodes: ids.map(task),
  };
};

const idsOf = (nodes: Array<NodeResponse>) => nodes.map((node) => node.id);

describe("countTasks", () => {
  it("counts leaf tasks, including tasks inside groups, and ignores joins", () => {
    const nodes = [task("a"), join("j"), group("g", [task("b"), group("inner", [task("c")])])];

    expect(countTasks(nodes)).toBe(3);
  });
});

describe("getFocusedGraph", () => {
  it("returns the whole graph when it is under the limit", () => {
    const { edges, nodes } = chain(3);
    const result = getFocusedGraph({ edges, focusId: "t1", limit: 200, nodes, openGroupIds: new Set() });

    expect(idsOf(result.nodes)).toEqual(["t0", "t1", "t2"]);
    expect(result.edges).toEqual(edges);
    expect(result.visibleTaskCount).toBe(3);
    expect(result.totalTaskCount).toBe(3);
  });

  it("centres a chain beyond the limit on the focused task in both directions", () => {
    const { edges, nodes } = chain(10);
    const result = getFocusedGraph({ edges, focusId: "t5", limit: 4, nodes, openGroupIds: new Set() });

    expect(result.focusId).toBe("t5");
    expect(idsOf(result.nodes)).toEqual(["t3", "t4", "t5", "t6"]);
    expect(result.visibleTaskCount).toBe(4);
    expect(result.totalTaskCount).toBe(10);
  });

  it("keeps the original edge objects only when both endpoints are kept", () => {
    const { edges, nodes } = chain(10);
    const result = getFocusedGraph({ edges, focusId: "t5", limit: 4, nodes, openGroupIds: new Set() });

    expect(result.edges).toEqual([edges[3], edges[4], edges[5]]);
    expect(result.edges[0]).toBe(edges[3]);
  });

  it("picks the first root in tree order when no focus is given", () => {
    const { edges, nodes } = chain(10);
    const result = getFocusedGraph({ edges, limit: 3, nodes, openGroupIds: new Set() });

    expect(result.focusId).toBe("t0");
    expect(idsOf(result.nodes)).toEqual(["t0", "t1", "t2"]);
  });

  it("falls back to the default root when the focus id is unknown", () => {
    const { edges, nodes } = chain(10);
    const result = getFocusedGraph({ edges, focusId: "missing", limit: 3, nodes, openGroupIds: new Set() });

    expect(result.focusId).toBe("t0");
    expect(idsOf(result.nodes)).toEqual(["t0", "t1", "t2"]);
  });

  it("returns an empty graph when there are no nodes", () => {
    const result = getFocusedGraph({ edges: [], limit: 3, nodes: [], openGroupIds: new Set() });

    expect(result).toEqual({
      edges: [],
      focusId: undefined,
      nodes: [],
      totalTaskCount: 0,
      visibleTaskCount: 0,
    });
  });

  it("does not count join nodes towards the limit but keeps them", () => {
    const nodes = [task("t0"), join("j"), task("t1"), task("t2")];
    const edges = [edge("t0", "j"), edge("j", "t1"), edge("t1", "t2")];
    const result = getFocusedGraph({ edges, focusId: "t0", limit: 2, nodes, openGroupIds: new Set() });

    expect(idsOf(result.nodes)).toEqual(["t0", "j", "t1"]);
    expect(result.visibleTaskCount).toBe(2);
  });

  it("treats a closed group as one unit and keeps its children intact", () => {
    const closed = group("g", [task("a"), task("b")]);
    const nodes = [task("c"), closed, task("d")];
    const edges = [edge("a", "c"), edge("c", "d")];
    const result = getFocusedGraph({ edges, focusId: "c", limit: 3, nodes, openGroupIds: new Set() });

    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[1]).toBe(closed);
    expect(result.visibleTaskCount).toBe(4);
  });

  it("resolves a focus on a task inside a closed group to the group", () => {
    const nodes = [task("c"), group("g", [task("a"), task("b")])];
    const edges = [edge("a", "c")];
    const result = getFocusedGraph({ edges, focusId: "a", limit: 5, nodes, openGroupIds: new Set() });

    expect(result.focusId).toBe("g");
    expect(idsOf(result.nodes)).toEqual(["c", "g"]);
  });

  it("resolves a focus on an open group to its first non-join descendant", () => {
    const nodes = [group("g", [join("j"), task("a"), task("b")]), task("c")];
    const edges = [edge("a", "c")];
    const result = getFocusedGraph({ edges, focusId: "g", limit: 2, nodes, openGroupIds: new Set(["g"]) });

    expect(result.focusId).toBe("a");
    expect(idsOf(result.nodes)).toEqual(["g", "c"]);
    expect(idsOf(result.nodes[0]?.children ?? [])).toEqual(["a"]);
  });

  it("prunes children of an open group and drops the group when none are kept", () => {
    const nodes = [task("t0"), task("t1"), group("g", [task("a")]), task("t2")];
    const edges = [edge("t0", "t1")];
    const result = getFocusedGraph({ edges, focusId: "t0", limit: 2, nodes, openGroupIds: new Set(["g"]) });

    expect(idsOf(result.nodes)).toEqual(["t0", "t1"]);
  });

  it("keeps an open group with only its kept children", () => {
    const nodes = [group("g", [task("a"), task("b")]), task("c")];
    const edges = [edge("a", "c"), edge("b", "c")];
    const result = getFocusedGraph({ edges, focusId: "a", limit: 2, nodes, openGroupIds: new Set(["g"]) });

    expect(idsOf(result.nodes[0]?.children ?? [])).toEqual(["a"]);
    expect(result.nodes[0]?.id).toBe("g");
  });

  it("fills up from other components when the focused component is smaller than the limit", () => {
    const nodes = [task("a1"), task("a2"), task("b1"), task("b2")];
    const edges = [edge("a1", "a2"), edge("b1", "b2")];
    const result = getFocusedGraph({ edges, focusId: "a1", limit: 3, nodes, openGroupIds: new Set() });

    expect(idsOf(result.nodes)).toEqual(["a1", "a2", "b1"]);
    expect(result.edges).toEqual([edges[0]]);
    expect(result.visibleTaskCount).toBe(3);
  });

  it("drops edges that point at units outside the kept set", () => {
    const { edges, nodes } = chain(6);
    const result = getFocusedGraph({ edges, focusId: "t0", limit: 2, nodes, openGroupIds: new Set() });

    expect(idsOf(result.nodes)).toEqual(["t0", "t1"]);
    expect(result.edges).toEqual([edges[0]]);
  });
});

describe("getDefaultFocusId", () => {
  it("returns the first root that is not a join", () => {
    const nodes = [join("j"), task("a"), task("b")];
    const edges = [edge("j", "b")];

    expect(getDefaultFocusId({ edges, nodes, openGroupIds: new Set() })).toBe("a");
  });
});
