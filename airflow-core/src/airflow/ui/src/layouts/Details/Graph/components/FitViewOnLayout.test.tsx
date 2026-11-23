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

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FitViewOnLayout, FOCUS_MIN_ZOOM, getFocusFrameNodeIds } from "./FitViewOnLayout";

const mockFitView = vi.fn();

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({ fitView: mockFitView }),
}));

const layout = {
  edges: [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "x", target: "y" },
  ],
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "x" }, { id: "y" }],
};

describe("FitViewOnLayout", () => {
  beforeEach(() => {
    mockFitView.mockReset();
  });

  it("fits the whole layout when no focus node is given", () => {
    render(<FitViewOnLayout layoutData={layout} />);

    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.1 });
  });

  it("does nothing before a layout is available", () => {
    render(<FitViewOnLayout focusNodeId="a" layoutData={undefined} />);

    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("frames the focus node with its direct neighbours instead of the whole layout", () => {
    render(<FitViewOnLayout focusNodeId="b" layoutData={layout} />);

    expect(mockFitView).toHaveBeenCalledWith({
      duration: 0,
      includeHiddenNodes: true,
      maxZoom: 1,
      minZoom: FOCUS_MIN_ZOOM,
      nodes: [{ id: "b" }, { id: "a" }, { id: "c" }],
      padding: 0.2,
    });
  });

  it("does not fit an empty layout", () => {
    render(<FitViewOnLayout layoutData={{ edges: [], nodes: [] }} />);

    expect(mockFitView).not.toHaveBeenCalled();
  });

  it("falls back to fitting the whole layout when the focus node is missing", () => {
    render(<FitViewOnLayout focusNodeId="missing" layoutData={layout} />);

    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.1 });
  });

  it("re-frames when the focus node changes without a new layout", () => {
    const { rerender } = render(<FitViewOnLayout focusNodeId="a" layoutData={layout} />);

    mockFitView.mockClear();
    rerender(<FitViewOnLayout focusNodeId="x" layoutData={layout} />);

    expect(mockFitView).toHaveBeenCalledWith(expect.objectContaining({ nodes: [{ id: "x" }, { id: "y" }] }));
  });
});

describe("getFocusFrameNodeIds", () => {
  it("caps upstream and downstream neighbours separately", () => {
    const edges = [
      ...Array.from({ length: 10 }, (_, index) => ({ source: `up${index}`, target: "f" })),
      ...Array.from({ length: 10 }, (_, index) => ({ source: "f", target: `down${index}` })),
    ];

    expect(getFocusFrameNodeIds({ edges, nodes: [] }, "f")).toEqual([
      "f",
      "up0",
      "up1",
      "up2",
      "down0",
      "down1",
      "down2",
    ]);
  });
});
