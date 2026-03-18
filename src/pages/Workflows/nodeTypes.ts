import { TriggerNode } from './nodes/TriggerNode';
import { AgentNode } from './nodes/AgentNode';
import { SkillNode } from './nodes/SkillNode';
import { LogicNode } from './nodes/LogicNode';
import { OutputNode } from './nodes/OutputNode';

export const workflowNodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  skill: SkillNode,
  logic: LogicNode,
  output: OutputNode,
};
