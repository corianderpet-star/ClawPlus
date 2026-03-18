/**
 * Workflow Persistence Store (Main Process)
 *
 * 使用 electron-store 持久化工作流定义。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let workflowStoreInstance: any = null;

export interface WorkflowStoreSchema {
  workflows: Record<string, unknown>[];
}

export async function getWorkflowStore() {
  if (!workflowStoreInstance) {
    const Store = (await import('electron-store')).default;
    workflowStoreInstance = new Store<WorkflowStoreSchema>({
      name: 'clawx-workflows',
      defaults: {
        workflows: [],
      },
    });
  }
  return workflowStoreInstance;
}
