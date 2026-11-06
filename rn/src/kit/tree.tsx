import type { ComponentType, ReactNode } from "react";

import { Cell } from "./layout";
import type { Appearance } from "./look";
import { Placeholder } from "./Placeholder";
import { PARTS } from "./parts.generated";
import { COMPONENTS } from "./registry";

/* A tree of atoms drawn from data: what a composite with no component of the kit's own splits into, and a kit as a style
 * composes it (the editor writes them, lib/export/rn/data.ts). The printer writes the same as JSX; this draws it as it
 * comes, for the kit's gallery and for an app that receives a tree at run time. */

export type TreeNode = {
  slug: string;
  props: Record<string, unknown>;
  /** takes the room left along its layout's run */
  grow?: boolean;
  fill?: string;
  textColor?: string;
  corners?: Record<string, number>;
  look?: Record<string, unknown>;
  kids?: TreeNode[];
};

type AnyPart = ComponentType<Record<string, unknown> & Appearance & { children?: ReactNode }>;

/** one node and what it holds, each child in the cell its layout gives it */
export function TreeView({ node, testID }: { node: TreeNode; testID?: string }) {
  const Part = (COMPONENTS as Record<string, AnyPart | undefined>)[node.slug];
  const appearance = { fill: node.fill, textColor: node.textColor, corners: node.corners as Appearance["corners"], look: node.look as Appearance["look"] };
  const dir = (node.props.layout as string | undefined) ?? (node.slug === "box" ? "column" : "free");
  const stretch = node.props.align === "stretch";
  const kids = node.kids?.map((k, i) => {
    const across = dir === "row" ? false : stretch;
    const tall = dir === "row" && stretch;
    const inner = <TreeView key={i} node={k} />;
    if (!k.grow && !across && !tall) return inner;
    return (
      <Cell key={i} dir={dir === "grid" ? "grid" : dir === "row" ? "row" : "column"} grow={k.grow} fillWidth={across} fillHeight={tall}>
        {inner}
      </Cell>
    );
  });
  if (!Part) return <Placeholder part={node.slug} name={PARTS[node.slug]?.name} testID={testID} {...appearance} />;
  return (
    <Part {...node.props} {...appearance} testID={testID}>
      {kids}
    </Part>
  );
}
