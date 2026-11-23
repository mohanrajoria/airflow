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
import type { Edge as FlowEdgeType, Node as ReactFlowNode } from "@xyflow/react";

import type { CustomNodeProps, EdgeData } from "src/components/Graph/reactflowUtils";

type Props = {
  baseFilteredNodes: Array<ReactFlowNode<CustomNodeProps>> | undefined;
  dagId: string;
  groupId?: string;
  layoutEdges: Array<FlowEdgeType<EdgeData>>;
  taskId?: string;
};

type Result = {
  edges: Array<FlowEdgeType<EdgeData>>;
  nodes: Array<ReactFlowNode<CustomNodeProps>> | undefined;
};

export const useFilteredNodesAndEdges = ({
  baseFilteredNodes,
  dagId,
  groupId,
  layoutEdges,
  taskId,
}: Props): Result => {
  const taskFilteredNodeIds = new Set<string>();

  for (const node of baseFilteredNodes ?? []) {
    if (node.data.isFiltered) {
      taskFilteredNodeIds.add(node.id);
    }
  }

  let nodes: Array<ReactFlowNode<CustomNodeProps>> | undefined;

  if (!baseFilteredNodes || taskFilteredNodeIds.size === 0) {
    nodes = baseFilteredNodes;
  } else {
    const nodeTypeMap = new Map(baseFilteredNodes.map((node) => [node.id, node.type]));
    const neighboursById = new Map<string, Array<string>>();

    const addNeighbour = (id: string, neighbour: string) => {
      const list = neighboursById.get(id);

      if (list) {
        list.push(neighbour);
      } else {
        neighboursById.set(id, [neighbour]);
      }
    };

    for (const edge of layoutEdges) {
      addNeighbour(edge.source, edge.target);
      addNeighbour(edge.target, edge.source);
    }

    nodes = baseFilteredNodes.map((node) => {
      if (node.type !== "join") {
        return node;
      }

      const connectedIds = neighboursById.get(node.id) ?? [];

      const connectedTaskIds = connectedIds.filter((id) => nodeTypeMap.get(id) === "task");
      const isFiltered =
        connectedTaskIds.length > 0 && connectedTaskIds.every((id) => taskFilteredNodeIds.has(id));

      return { ...node, data: { ...node.data, isFiltered } };
    });
  }

  const filteredNodeIds = new Set<string>();

  for (const node of nodes ?? []) {
    if (node.data.isFiltered) {
      filteredNodeIds.add(node.id);
    }
  }

  const edges = layoutEdges.map((edge) => ({
    ...edge,
    data: {
      ...edge.data,
      rest: {
        ...edge.data?.rest,
        isFiltered: filteredNodeIds.has(edge.source) || filteredNodeIds.has(edge.target),
        isSelected:
          taskId === edge.source ||
          taskId === edge.target ||
          groupId === edge.source ||
          groupId === edge.target ||
          edge.source === `dag:${dagId}` ||
          edge.target === `dag:${dagId}`,
      },
    },
  })) as Array<FlowEdgeType<EdgeData>>;

  return { edges, nodes };
};
