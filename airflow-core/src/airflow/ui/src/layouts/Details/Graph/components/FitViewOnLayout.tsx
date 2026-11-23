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
import { useEffect } from "react";

import { useReactFlow } from "@xyflow/react";

const FOCUS_NEIGHBOUR_LIMIT = 3;

export const FOCUS_MIN_ZOOM = 0.6;

type LayoutData = {
  edges?: Array<{ source: string; target: string }>;
  nodes: Array<{ id: string }>;
};

export const getFocusFrameNodeIds = (layoutData: LayoutData, focusNodeId: string): Array<string> => {
  const upstream: Array<string> = [];
  const downstream: Array<string> = [];

  for (const edge of layoutData.edges ?? []) {
    if (edge.target === focusNodeId && upstream.length < FOCUS_NEIGHBOUR_LIMIT) {
      upstream.push(edge.source);
    } else if (edge.source === focusNodeId && downstream.length < FOCUS_NEIGHBOUR_LIMIT) {
      downstream.push(edge.target);
    }
  }

  return [focusNodeId, ...upstream, ...downstream];
};

// Fits the viewport whenever a new layout is committed. Must live inside
// <ReactFlow> to call useReactFlow(). Using layoutData as the dep means it
// only fires when ELK produces a new layout, not on task-instance updates or
// selection changes (unlike the `fitView` prop, which runs on every re-mount).
// With focusNodeId, fitting the whole layout would render every node (onlyRenderVisibleElements
// renders what the viewport covers), so the view frames that node and a few of its direct
// neighbours. The zoom floor keeps a wide fan-out from zooming back out to the whole graph.
export const FitViewOnLayout = ({
  focusNodeId,
  layoutData,
}: {
  readonly focusNodeId?: string;
  readonly layoutData: LayoutData | undefined;
}) => {
  const { fitView } = useReactFlow();

  useEffect(() => {
    // xyflow holds a fitView queued until nodes exist, so fitting the empty placeholder layout would
    // fire "fit everything" on the first real layout before the focus fit, mounting every node.
    if (layoutData === undefined || layoutData.nodes.length === 0) {
      return;
    }
    const hasFocusNode =
      focusNodeId !== undefined && layoutData.nodes.some((node) => node.id === focusNodeId);

    void (hasFocusNode
      ? fitView({
          duration: 0,
          // Nodes outside the viewport are never mounted, so they have no measured size; use the
          // ELK dimensions instead or fitView ignores them.
          includeHiddenNodes: true,
          maxZoom: 1,
          minZoom: FOCUS_MIN_ZOOM,
          nodes: getFocusFrameNodeIds(layoutData, focusNodeId).map((id) => ({ id })),
          padding: 0.2,
        })
      : fitView({ padding: 0.1 }));
  }, [fitView, focusNodeId, layoutData]);

  return null;
};
