import type { ReactNode } from "react";
import type { WorldSlotProps } from "@m3e/app-runtime";
import { ExampleWorld } from "../../exampleWorld";

/* The world view the design places on the screen "HUD" (written once by the export, never overwritten:
   it is the product's own). The picture, the physics, the camera and the rules are the engine's: plug it in here
   (a Cocos mini-game, a <Canvas> loop).

   An engine implements World (@m3e/app-runtime) and is connected to what this view is handed with
   connectWorld(world, channel, onEvent): the design's input actions (move, press, release) come in on the
   channel, and the events it sends (hit, collected, ended) run the design's actions. The props are the world's
   state the design shows (its entities, score, status), for the HUD around it. M3E's example engine is
   src/generated/exampleWorld.tsx: return <ExampleWorld {...props} /> plays it. Here it is plugged in. */
type Props = WorldSlotProps<ReactNode>;

export default function Field2(props: Props) {
  return <ExampleWorld {...props} />;
}
