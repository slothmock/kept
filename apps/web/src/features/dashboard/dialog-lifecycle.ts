export function updateDialogOpenState(
  open: boolean,
  setOpen: (open: boolean) => void,
  onDismiss: () => void,
): void {
  setOpen(open);
  if (!open) onDismiss();
}
