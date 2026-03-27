export function getActionValue(
  actions: { action_type: string; value: string }[] | undefined,
  actionType: string
): number {
  if (!actions) return 0;
  const action = actions.find((a) => a.action_type === actionType);
  return action ? parseInt(action.value, 10) || 0 : 0;
}

export function getCostPerAction(
  costPerActions: { action_type: string; value: string }[] | undefined,
  actionType: string
): number {
  if (!costPerActions) return 0;
  const entry = costPerActions.find((a) => a.action_type === actionType);
  return entry ? parseFloat(entry.value) || 0 : 0;
}

export function getActionRevenue(
  actionValues: { action_type: string; value: string }[] | undefined,
  actionType: string
): number {
  if (!actionValues) return 0;
  const entry = actionValues.find((a) => a.action_type === actionType);
  return entry ? parseFloat(entry.value) || 0 : 0;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
