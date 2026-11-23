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
import type { EdgeResponse, NodeResponse } from "openapi/requests/types.gen";

export const GRAPH_FOCUS_TASK_LIMIT = 200;

type GraphIndex = {
  adjacency: Map<string, Set<string>>;
  hasIncoming: Set<string>;
  isJoin: Map<string, boolean>;
  orderedUnits: Array<string>;
  repOf: Map<string, string>;
  taskCount: Map<string, number>;
};

type FocusedGraphProps = {
  edges: Array<EdgeResponse>;
  focusId?: string;
  limit: number;
  nodes: Array<NodeResponse>;
  openGroupIds: ReadonlySet<string>;
};

type FocusedGraph = {
  edges: Array<EdgeResponse>;
  focusId: string | undefined;
  nodes: Array<NodeResponse>;
  totalTaskCount: number;
  visibleTaskCount: number;
};

export const countTasks = (nodes: Array<NodeResponse>): number =>
  nodes.reduce(
    (total, node) =>
      node.children ? total + countTasks(node.children) : total + (node.type === "task" ? 1 : 0),
    0,
  );

// Maps every node id to the visible unit that draws it, and records the unit order (tree pre-order).
const indexGraph = (
  nodes: Array<NodeResponse>,
  edges: Array<EdgeResponse>,
  openGroupIds: ReadonlySet<string>,
) => {
  const repOf = new Map<string, string>();
  const isJoin = new Map<string, boolean>();
  const taskCount = new Map<string, number>();
  const orderedUnits: Array<string> = [];

  const mapDescendants = (children: Array<NodeResponse>, unit: string) => {
    for (const child of children) {
      repOf.set(child.id, unit);
      if (child.children) {
        mapDescendants(child.children, unit);
      }
    }
  };

  const indexNode = (node: NodeResponse): { first?: string; firstNonJoin?: string } => {
    if (!node.children) {
      repOf.set(node.id, node.id);
      isJoin.set(node.id, node.type === "join");
      taskCount.set(node.id, node.type === "task" ? 1 : 0);
      orderedUnits.push(node.id);

      return { first: node.id, firstNonJoin: node.type === "join" ? undefined : node.id };
    }

    if (!openGroupIds.has(node.id)) {
      mapDescendants(node.children, node.id);
      repOf.set(node.id, node.id);
      isJoin.set(node.id, false);
      taskCount.set(node.id, countTasks(node.children));
      orderedUnits.push(node.id);

      return { first: node.id, firstNonJoin: node.id };
    }

    let first: string | undefined;
    let firstNonJoin: string | undefined;

    for (const child of node.children) {
      const result = indexNode(child);

      first ??= result.first;
      firstNonJoin ??= result.firstNonJoin;
    }

    const target = firstNonJoin ?? first;

    if (target !== undefined) {
      repOf.set(node.id, target);
    }

    return { first, firstNonJoin };
  };

  for (const node of nodes) {
    indexNode(node);
  }

  const adjacency = new Map<string, Set<string>>();
  const hasIncoming = new Set<string>();

  for (const unit of orderedUnits) {
    adjacency.set(unit, new Set<string>());
  }

  for (const edge of edges) {
    const source = repOf.get(edge.source_id);
    const target = repOf.get(edge.target_id);

    if (source !== undefined && target !== undefined && source !== target) {
      adjacency.get(source)?.add(target);
      adjacency.get(target)?.add(source);
      hasIncoming.add(target);
    }
  }

  return { adjacency, hasIncoming, isJoin, orderedUnits, repOf, taskCount };
};

const resolveFocusId = (index: GraphIndex, focusId: string | undefined): string | undefined => {
  const known = focusId === undefined ? undefined : index.repOf.get(focusId);

  if (known !== undefined) {
    return known;
  }

  return (
    index.orderedUnits.find((unit) => !index.isJoin.get(unit) && !index.hasIncoming.has(unit)) ??
    index.orderedUnits.find((unit) => !index.isJoin.get(unit))
  );
};

export const getDefaultFocusId = ({
  edges,
  nodes,
  openGroupIds,
}: Omit<FocusedGraphProps, "focusId" | "limit">): string | undefined =>
  resolveFocusId(indexGraph(nodes, edges, openGroupIds), undefined);

export const getFocusedGraph = ({
  edges,
  focusId,
  limit,
  nodes,
  openGroupIds,
}: FocusedGraphProps): FocusedGraph => {
  const index = indexGraph(nodes, edges, openGroupIds);
  const { adjacency, isJoin, orderedUnits, repOf, taskCount } = index;
  const focus = resolveFocusId(index, focusId);

  if (focus === undefined) {
    return { edges: [], focusId, nodes: [], totalTaskCount: countTasks(nodes), visibleTaskCount: 0 };
  }

  const kept = new Set<string>();
  const queue: Array<string> = [];
  let head = 0;
  let nonJoinCount = 0;

  const addUnit = (unit: string) => {
    kept.add(unit);
    queue.push(unit);
    if (!isJoin.get(unit)) {
      nonJoinCount += 1;
    }
  };

  const drain = () => {
    for (let unit = queue[head]; unit !== undefined; unit = queue[head]) {
      if (nonJoinCount >= limit) {
        break;
      }
      head += 1;
      for (const neighbour of adjacency.get(unit) ?? []) {
        if (nonJoinCount >= limit) {
          break;
        }
        if (!kept.has(neighbour)) {
          addUnit(neighbour);
        }
      }
    }
  };

  addUnit(focus);
  drain();

  for (const unit of orderedUnits) {
    if (nonJoinCount >= limit) {
      break;
    }
    if (!kept.has(unit) && !isJoin.get(unit)) {
      addUnit(unit);
      drain();
    }
  }

  const pruneNodes = (candidates: Array<NodeResponse>): Array<NodeResponse> =>
    candidates.flatMap((node) => {
      if (!node.children || !openGroupIds.has(node.id)) {
        return kept.has(node.id) ? [node] : [];
      }

      const children = pruneNodes(node.children);

      return children.length > 0 ? [{ ...node, children }] : [];
    });

  const keptEdges = edges.filter((edge) => {
    const source = repOf.get(edge.source_id);
    const target = repOf.get(edge.target_id);

    return source !== undefined && target !== undefined && kept.has(source) && kept.has(target);
  });

  let visibleTaskCount = 0;

  for (const unit of kept) {
    visibleTaskCount += taskCount.get(unit) ?? 0;
  }

  return {
    edges: keptEdges,
    focusId: focus,
    nodes: pruneNodes(nodes),
    totalTaskCount: countTasks(nodes),
    visibleTaskCount,
  };
};
