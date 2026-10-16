"use client"

import type { ComponentProps } from "react"

import { StackerSchematic } from "@/components/plant/stacker-schematic"

type BayOneSchematicProps = Omit<ComponentProps<typeof StackerSchematic>, "title">

/** Bay 1 temporarily mirrors Stacker, including its data, scale and layout. */
export function BayOneSchematic(props: BayOneSchematicProps) {
  return <StackerSchematic {...props} title="Bay 1" />
}
