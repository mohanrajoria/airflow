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
import { Button, HStack, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { SearchParamsKeys } from "src/constants/searchParams";

type Props = {
  readonly isFullDagMode: boolean;
  readonly totalTaskCount: number;
  readonly visibleTaskCount: number;
};

export const FullDagModeToggle = ({ isFullDagMode, totalTaskCount, visibleTaskCount }: Props) => {
  const { t: translate } = useTranslation("components");
  const [searchParams, setSearchParams] = useSearchParams();

  const toggle = () => {
    const next = new URLSearchParams(searchParams);

    if (isFullDagMode) {
      next.delete(SearchParamsKeys.GRAPH_FULL_DAG);
    } else {
      next.set(SearchParamsKeys.GRAPH_FULL_DAG, "true");
    }
    setSearchParams(next);
  };

  return (
    <HStack
      bg="bg.panel"
      borderRadius="md"
      boxShadow="sm"
      left="50%"
      position="absolute"
      px={3}
      py={2}
      top={2}
      transform="translateX(-50%)"
      zIndex={5}
    >
      <Text fontSize="sm">
        {isFullDagMode
          ? translate("graph.fullDag", { total: totalTaskCount })
          : translate("graph.focusedView", { total: totalTaskCount, visible: visibleTaskCount })}
      </Text>
      <Button onClick={toggle} size="xs" variant="outline">
        {isFullDagMode ? translate("graph.showFocusedView") : translate("graph.showFullDag")}
      </Button>
    </HStack>
  );
};
